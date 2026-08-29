// ---------------------------------------------------------------------------
// TecJustiça PJe — OCR das páginas digitalizadas: PP-OCRv6 sobre ONNX Runtime.
//
// Roda no DOCUMENTO OFFSCREEN. A divisão de contexto NÃO é gosto:
//
//  · o pdf.js vive no iframe (src/ocr-render.js), porque `page.render()` TRAVA
//    aqui — um documento offscreen é sempre "hidden" e o rAF fica congelado;
//  · o motor de OCR vive AQUI, e não no iframe, porque o iframe morre com o F5
//    da página do tribunal e sofre o throttling de aba em segundo plano. Um
//    processo de 300 folhas leva minutos, e o usuário troca de aba;
//  · e não no service worker, que não tem `new Worker` e é morto em tarefa longa.
//
// MOTOR ÚNICO E QUENTE: um offscreen por extensão, uma instância do serviço. O
// custo é o warm-up (alguns segundos na 1ª página); recriar por documento
// pagaria isso toda vez.
//
// Tudo local: modelos e WASM vêm do pacote (`chrome.runtime.getURL`). MV3 proíbe
// código hospedado remotamente, e o `wasm-unsafe-eval` da CSP executa WASM
// LOCAL — não é código remoto.
// ---------------------------------------------------------------------------

// PP-OCRv6 TINY: detecção 1,80 MB + reconhecimento 4,32 MB + dicionário 33 KB.
//
// Medido nas 4 páginas digitalizadas de um processo real (comprovante de
// residência, petição inicial, contestação e réplica), contra o tier Small:
// tiny 3417 chars em 3079 ms, Small 3242 chars em 6470 ms. O tiny é 5× menor,
// 2,1× mais rápido e igual ou melhor na leitura — o Small devolveu
// "Acee ide cliad na magem acima" onde o tiny leu "Acesse o vídeo clicando na
// imagem acima". O guia PP-OCRv6 recomenda Small como padrão, e ele próprio
// manda decidir com documentos reais; foi o que se fez.
const MODELOS = {
  detection: "vendor/ocr-modelos/PP-OCRv6_tiny_det.ort",
  recognition: "vendor/ocr-modelos/PP-OCRv6_tiny_rec.ort",
  charactersDictionary: "vendor/ocr-modelos/ppocrv6_tiny_dict.txt",
};

let servico = null;
let iniciando = null;
let backendAtivo = "";
let threads = 1;

// ESCOLHA DO BACKEND: MEDIDA, NUNCA PRESUMIDA — e depois LEMBRADA.
//
// A versão anterior ficava com o WebGPU sempre que a sessão INICIALIZAVA. Mas
// `initialize()` que resolve prova que a sessão subiu, não que ela é rápida: no
// onnxruntime-web o WebGPU cobre um subconjunto dos operadores, e o que ele não
// cobre volta para a CPU pagando uma transferência GPU<->CPU por operador. Medido
// num processo real de 93 folhas digitalizadas: **~18 s por página no WebGPU
// contra os 2,4 s do WASM com 4 threads** — 7,6x mais lento, com o backend certo
// disponível e desligado por uma decisão que nunca olhou para o relógio.
//
// Pior: a escolha era instável. O teste de GPU tem teto de 3 s, então com a GPU
// fria o `requestAdapter()` estourava e caía no WASM; com ela quente o WebGPU
// vencia. O mesmo pacote, na mesma máquina, ficava 7x mais lento sem ninguém
// mudar nada — e o único vestígio era a palavra "WebGPU" no cabeçalho do .md.
//
// Agora os dois disputam a PRIMEIRA página real (a mesma imagem, o mesmo modelo)
// e ganha quem for mais rápido. A decisão vai para `chrome.storage.local` porque
// é propriedade da MÁQUINA, não da sessão: a GPU não muda entre um processo e
// outro. É a mesma lição do `safety_settings` do Gemini — MEMORIZAR a descoberta
// em vez de fixá-la no código: se o driver melhorar, a extensão reaprende sozinha
// no dia em que a medição for refeita, sem release.
// QUEM PERSISTE É O WORKER, e isso não é organização: **documento offscreen só
// tem `chrome.runtime` garantido** — nem `chrome.storage` (a regra está escrita
// no cabeçalho de `ocr-offscreen.html`). Um `chrome.storage.local.get` aqui
// falharia em silêncio e a decisão seria re-medida a cada vida do offscreen,
// que é justamente o custo que ela existe para evitar. Então a decisão LEMBRADA
// chega no pedido (`msg.backend`) e a decisão MEDIDA volta na resposta
// (`decisao`); gravar é com o `background.js`.
// Sobe quando algo que muda o resultado da medição muda: modelo, versão do ORT,
// pré-processamento. Uma decisão tomada sob outras condições não vale mais.
const VERSAO_DUELO = 1;
let lembrado = null;
// Guarda o que falta para montar o adversário quando o duelo acontecer.
let duelo = null;
// Decisão a devolver ao worker na próxima resposta (uma vez só).
let decisaoPendente = null;

// DIAGNÓSTICO QUE VIAJA COM A RESPOSTA.
//
// O offscreen tem um console próprio, que só se alcança por
// chrome://extensions -> Inspecionar visualizações. Pedir isso a quem está
// tentando trabalhar é pedir demais — e um relato de erro que exige três
// consoles não chega. Cada linha aqui volta junto do resultado e o content
// script a imprime no F12 da página, num lugar só.
const diag = [];
function d(...a) {
  const linha = a
    .map((x) => (typeof x === "string" ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })()))
    .join(" ");
  diag.push(linha);
  console.log("[PJe IA OCR][offscreen]", linha);
}
function tirarDiag() {
  const c = diag.slice();
  diag.length = 0;
  return c;
}

d("offscreen carregou", "| crossOriginIsolated=" + self.crossOriginIsolated,
  "| SharedArrayBuffer=" + typeof SharedArrayBuffer,
  "| cores=" + (navigator.hardwareConcurrency || "?"),
  "| PpuOcr=" + typeof self.PpuOcr);

async function baixarLocal(caminho) {
  const r = await fetch(chrome.runtime.getURL(caminho));
  if (!r.ok) throw new Error("não foi possível ler " + caminho);
  return r.arrayBuffer();
}

// TETO DE TEMPO em tudo o que pode não voltar. Um `initialize()` que nunca
// resolve — motor que não carrega, worker de thread barrado pela CSP, WASM que
// não compila — deixaria este listener sem chamar `responder`, e o content
// script esperaria PARA SEMPRE. Melhor um erro com nome que um silêncio.
function comTeto(promessa, ms, oQue) {
  let t;
  return Promise.race([
    Promise.resolve(promessa).finally(() => clearTimeout(t)),
    new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(oQue + " não respondeu em " + Math.round(ms / 1000) + "s")), ms);
    }),
  ]);
}

async function garantirServico() {
  if (servico) return servico;
  if (!iniciando) {
    iniciando = comTeto(criarServico(), 90000, "o motor de OCR")
      .catch((e) => {
        // Zera para a próxima página poder tentar de novo: guardar uma promessa
        // rejeitada faria TODAS as páginas seguintes falharem pelo mesmo erro
        // antigo, mesmo que a causa tenha passado.
        servico = null;
        throw e;
      })
      .finally(() => (iniciando = null));
  }
  return iniciando;
}

async function criarServico() {
  const API = self.PpuOcr;
  if (!API) throw new Error("motor de OCR não carregou (o bundle não expôs PpuOcr)");
  d("criando serviço; wasmPaths do bundle =", String(API.ort.env.wasm.wasmPaths));

  // Os binários do ORT (.wasm E .mjs) precisam sair do PACOTE e da MESMA
  // compilação do JS. Copiar só o .wasm devolve "no available backend found".
  //
  // E tem de ser DEPOIS do bundle carregar: o `ppu-paddle-ocr/web` chama
  // `applyDefaultWasmPaths()` no próprio import e aponta o ORT para o
  // jsDelivr. Sob MV3 esse fetch nunca aconteceria (código remoto é proibido),
  // então sobrescrever aqui não é preferência — é o que faz funcionar.
  API.ort.env.wasm.wasmPaths = chrome.runtime.getURL("vendor/ort/");
  d("wasmPaths ->", API.ort.env.wasm.wasmPaths);

  // THREADS. É a diferença entre 2 minutos e 45 minutos, e não é figura de
  // linguagem: medido na mesma página, mesmo modelo, mesma máquina —
  // **2.357 ms com 4 threads contra ~50.000 ms numa thread só**, 21×.
  //
  // O ORT só usa threads com `SharedArrayBuffer`, que o Chrome só entrega em
  // contexto CROSS-ORIGIN ISOLATED. Para páginas de extensão isso se declara no
  // manifest (`cross_origin_embedder_policy` + `cross_origin_opener_policy`);
  // sem as duas chaves, `crossOriginIsolated` é false, o ORT cai para uma thread
  // e o OCR de um processo inteiro deixa de ser viável.
  //
  // O teto de 4 é deliberado: mais threads também é mais CPU, mais energia e
  // mais disputa com o resto da máquina do usuário — que está trabalhando.
  if (self.crossOriginIsolated && typeof SharedArrayBuffer === "function") {
    API.ort.env.wasm.numThreads = Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1));
    threads = API.ort.env.wasm.numThreads;
    d("threads =", threads);
  } else {
    // Não é fatal: o WASM roda numa thread e o OCR sai, devagar. Mas é a
    // primeira coisa a conferir se alguém reclamar de lentidão.
    d("SEM cross-origin isolation -> 1 thread, ~20x mais lento");
  }

  d("baixando modelos do pacote…");
  const [detection, recognition, charactersDictionary] = await Promise.all([
    baixarLocal(MODELOS.detection),
    baixarLocal(MODELOS.recognition),
    baixarLocal(MODELOS.charactersDictionary),
  ]);
  d("modelos ok:", detection.byteLength, recognition.byteLength, charactersDictionary.byteLength);

  // Os modelos já estão em memória; o que muda entre os dois candidatos é só o
  // execution provider. `base` fica guardado para o duelo poder montar o
  // adversário sem baixar nada de novo.
  const base = {
    model: { detection, recognition, charactersDictionary },
    // `canvas-native` evita arrastar o OpenCV em WASM (ppu-ocv) para dentro do
    // pacote — são megabytes por uma precisão de caixa que não muda o texto.
    processing: { engine: "canvas-native" },
  };

  // `navigator.gpu` EXISTIR não prova que o modelo roda: o WebGPU cobre um
  // subconjunto dos operadores, e a sessão pode falhar na criação, na
  // compilação do shader, por memória ou por device lost. Por isso o candidato
  // só entra no duelo depois de uma TENTATIVA de sessão real.
  // COM TETO DE TEMPO. `isWebGpuAvailable` faz `await navigator.gpu.requestAdapter()`,
  // e um documento offscreen não tem superfície de renderização: se o adapter
  // nunca resolver, o turno inteiro fica pendurado SEM erro — que é o pior
  // sintoma possível, indistinguível de travamento. Rota que pendura precisa de
  // alternativa, não de paciência: estourou, segue em WASM.
  const temGpu = await Promise.race([
    Promise.resolve()
      .then(() => API.isWebGpuAvailable?.())
      .then((v) => !!v)
      .catch(() => false),
    new Promise((r) => setTimeout(() => r(false), 3000)),
  ]);
  d("WebGPU disponível?", temGpu);

  if (lembrado) {
    d("backend LEMBRADO:", lembrado.escolha, "| medido em", lembrado.em,
      "| ms:", JSON.stringify(lembrado.ms || {}));
  }

  // Um backend lembrado que não está mais disponível (GPU sumiu, driver caiu)
  // não pode virar erro: o WASM é a base universal e assume em silêncio.
  const querGpu = lembrado ? lembrado.escolha === "webgpu" && temGpu : false;
  const s = await montar(API, base, querGpu ? "webgpu" : "wasm");
  servico = s;
  backendAtivo = nomeBackend(querGpu ? "webgpu" : "wasm");

  // Sem decisão gravada E com GPU disponível: a PRIMEIRA página real vira o
  // banco de provas. Nada acontece aqui — o duelo precisa de uma imagem, e a
  // imagem só existe no `reconhecer`. Assim a medição não desperdiça trabalho:
  // a página que serve de régua é uma página que o usuário pediu de todo jeito.
  duelo = !lembrado && temGpu ? { base, API } : null;
  if (duelo) d("sem decisão gravada -> a 1ª página vai medir WASM x WebGPU");
  else if (!lembrado && !temGpu) {
    // Sem GPU não há o que comparar; a decisão é gravada assim mesmo para não
    // pagar o teste do adapter (até 3 s) a cada vida do offscreen.
    gravar({ escolha: "wasm", ms: { webgpu: null }, motivo: "sem WebGPU" });
  }
  return s;
}

// Monta um serviço com o execution provider pedido. Os dois candidatos
// compartilham `base` — mesmos pesos, mesmo pré-processamento —, senão a
// comparação mediria outra coisa.
async function montar(API, base, qual) {
  const opts =
    qual === "webgpu"
      ? Object.assign({}, base, { session: { executionProviders: ["webgpu"] } })
      : Object.assign({}, base, { session: { executionProviders: ["wasm"] } });
  const s = new API.PaddleOcrService(opts);
  d("initialize() no " + qual + "…");
  const t0 = Date.now();
  await s.initialize();
  d("initialize " + qual + " OK em", Date.now() - t0, "ms");
  return s;
}

// O número de threads vai JUNTO do nome do backend porque é ele que explica a
// velocidade: "WASM x1" e "WASM x4" são 21× diferentes, e sem isso escrito no
// arquivo a lentidão volta a ser invisível para quem for diagnosticar.
function nomeBackend(qual) {
  return qual === "webgpu" ? "WebGPU" : "WASM x" + threads;
}

// --- memória da decisão ------------------------------------------------------
// Só REGISTRA o que o worker deve gravar. Best-effort por construção: se a
// resposta se perder, a próxima vida do offscreen mede de novo — uma página
// lenta, nunca um erro. Falha ao guardar uma preferência não pode derrubar um
// OCR.
function gravar(info) {
  decisaoPendente = Object.assign({ v: VERSAO_DUELO, em: new Date().toISOString() }, info);
  d("decisão de backend a gravar:", info.escolha, JSON.stringify(info.ms || {}));
}

function tomarDecisao() {
  const x = decisaoPendente;
  decisaoPendente = null;
  return x;
}

// --- o duelo -----------------------------------------------------------------
// Roda a MESMA imagem nos dois e fica com o mais rápido. O vencedor devolve o
// resultado da página — a medição não custa uma página a mais.
//
// Nunca é fatal: qualquer tropeço aqui deixa o serviço que já está de pé e a
// decisão sem gravar (a próxima vida do offscreen tenta de novo). Perder o duelo
// custa uma página lenta; deixá-lo derrubar o turno custaria a extração inteira.
async function medirBackends(buf, msWasm, resWasm) {
  const { API, base } = duelo;
  duelo = null; // uma vez por vida do offscreen, aconteça o que acontecer
  let rival = null;
  try {
    rival = await comTeto(montar(API, base, "webgpu"), 30000, "a sessão WebGPU");
    // O ORÇAMENTO DO DESAFIANTE SAI DO TEMPO DO CAMPEÃO. Ele não precisa
    // terminar: precisa GANHAR. Se não bate o WASM em 4× o tempo do WASM, já
    // perdeu — esperar o fim só encareceria a primeira página, que é
    // justamente a que o usuário está olhando. O piso de 20 s protege contra um
    // campeão rápido demais (warm-up do rival conta a favor dele), e o teto de
    // 60 s garante que a página inteira caiba no `OCR_TIMEOUT_1A_MS` do
    // content.js — teto que existe do outro lado e que o duelo não pode furar.
    // VIÉS CONHECIDO E ACEITO: o WebGPU compila os shaders na PRIMEIRA execução,
    // então ele disputa carregando um custo que não se repete. O viés é contra
    // ele — isto é, a favor do WASM, que é a base universal e previsível —, e
    // corrigi-lo custaria uma inferência de aquecimento na primeira página, que
    // é justamente a que o usuário está esperando. Medido em máquina real: o
    // WebGPU ganhou mesmo assim, o que mostra que quando ele é de fato melhor a
    // margem cobre o viés.
    const orcamento = Math.min(60000, Math.max(20000, msWasm * 4));
    const t0 = Date.now();
    const r = await comTeto(
      rival.recognize(buf, { flatten: true, noCache: true }),
      orcamento,
      "o reconhecimento no WebGPU"
    );
    const msGpu = Date.now() - t0;
    // O DUELO NÃO PODE SER SÓ DE VELOCIDADE. Um backend que perde operadores
    // para a CPU pode devolver MENOS TEXTO e, por isso mesmo, terminar antes —
    // e aí "ganhar" significaria trocar leitura por rapidez, em silêncio e para
    // sempre (a decisão é memorizada). Os dois resultados já estão em mãos, e o
    // tamanho do texto é o sinal mais barato que existe: um vencedor que lê
    // menos de 70% do que o adversário leu não venceu nada.
    //
    // O limiar é FROUXO de propósito: os dois rodam o mesmo modelo e uma
    // diferença de poucos por cento é o ruído normal do reamostramento. O que
    // 70% pega é o colapso — a página que volta pela metade ou vazia.
    const nGpu = ((r && r.text) || "").trim().length;
    const nWasm = ((resWasm && resWasm.text) || "").trim().length;
    const leuMenos = nWasm > 0 && nGpu < nWasm * 0.7;
    d("DUELO -> WASM", msWasm + "ms/" + nWasm + " chars", "| WebGPU", msGpu + "ms/" + nGpu + " chars");
    if (leuMenos) {
      d("WebGPU foi mais rápido mas leu MENOS texto -> fica o WASM");
      gravar({ escolha: "wasm", ms: { wasm: msWasm, webgpu: msGpu }, motivo: "WebGPU leu menos texto" });
      return { res: resWasm, ms: msWasm };
    }
    if (msGpu < msWasm) {
      // O WebGPU venceu: ele passa a ser o serviço vivo e o WASM é liberado.
      const perdedor = servico;
      servico = rival;
      backendAtivo = nomeBackend("webgpu");
      rival = null;
      try { await perdedor?.destroy?.(); } catch {}
      gravar({ escolha: "webgpu", ms: { wasm: msWasm, webgpu: msGpu } });
      return { res: r, ms: msGpu };
    }
    gravar({ escolha: "wasm", ms: { wasm: msWasm, webgpu: msGpu } });
  } catch (e) {
    // WebGPU que não sobe ou não responde é exatamente o caso em que o WASM
    // deve ficar — e a decisão vale a pena ser gravada, para não pagar a
    // tentativa de novo a cada vida do offscreen.
    d("WebGPU recusou o duelo:", String((e && e.message) || e), "-> fica o WASM");
    gravar({ escolha: "wasm", ms: { wasm: msWasm, webgpu: null }, motivo: "WebGPU falhou" });
  } finally {
    if (rival) { try { await rival.destroy?.(); } catch {} }
  }
  return { res: resWasm, ms: msWasm };
}

// --- canal -------------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
  if (!msg || msg.alvo !== "ocrOffscreen") return false;

  if (msg.tipo === "ping") {
    responder({ ok: true, diag: tirarDiag() });
    return true;
  }

  if (msg.tipo === "reconhecer") {
    (async () => {
      try {
        // A decisão lembrada vem do worker (aqui não há `chrome.storage`) e só
        // vale ANTES de o serviço existir: depois disso o motor já está de pé e
        // trocar de backend no meio seria jogar fora o warm-up.
        // Quem VALIDA a decisão é este lado, porque é ele que conhece as
        // condições sob as quais ela foi tomada: `VERSAO_DUELO` sobe quando
        // muda o modelo, o ORT ou o pré-processamento, e uma medição feita sob
        // outras condições não vale mais nada.
        if (!servico && !iniciando && msg.backend && msg.backend.v === VERSAO_DUELO &&
            (msg.backend.escolha === "wasm" || msg.backend.escolha === "webgpu")) {
          lembrado = msg.backend;
        }
        const svc = await garantirServico();
        d("reconhecendo página (" + Math.round((msg.img || "").length / 1024) + " KB)…");
        // A página chega como data URL (um Blob viraria `{}` ao atravessar
        // `sendMessage`). O serviço aceita ArrayBuffer.
        const resp = await fetch(msg.img);
        const buf = await resp.arrayBuffer();
        const tOcr = Date.now();
        let r = await comTeto(
          svc.recognize(buf, { flatten: true, noCache: true }),
          120000,
          "o reconhecimento da página"
        );
        let ms = Date.now() - tOcr;
        // O duelo roda AQUI, na primeira página real, porque é aqui que existe
        // uma imagem — e uma imagem representativa, do processo que o usuário
        // está de fato extraindo. Um benchmark sintético mediria outra coisa.
        if (duelo) {
          // O `try` é a garantia de que a medição NUNCA custa a página. Dentro
          // de `medirBackends` já há tratamento, mas tratamento é inspeção — e
          // um `ReferenceError` no próprio caminho de erro escapa dele (foi o
          // que aconteceu: uma constante removida numa edição derrubou a página
          // inteira a partir do bloco que existia para não deixar isso
          // acontecer). Aqui a promessa vale por construção: aconteça o que
          // acontecer no duelo, o resultado que o WASM já produziu segue.
          try {
            const escolhido = await medirBackends(buf, ms, r);
            r = escolhido.res;
            ms = escolhido.ms;
          } catch (e) {
            duelo = null;
            d("o duelo falhou por completo:", String((e && e.message) || e), "-> fica o WASM");
          }
        }
        d("página reconhecida em", ms, "ms |", backendAtivo);
        const linhas = r.results || [];
        const scores = linhas
          .map((l) => (l && (l.score ?? l.confidence)))
          .filter((n) => typeof n === "number");
        responder({
          ok: true,
          texto: (r.text || "").trim(),
          linhas: linhas.length,
          // Score 0–100. O guia manda combinar média com percentil, porque uma
          // média alta esconde a linha crítica ruim; o p10 é o que serve de
          // portão para um segundo passe.
          score: scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) * 100 : null,
          p10: scores.length ? percentil(scores, 0.1) * 100 : null,
          backend: backendAtivo,
          // O tempo do OCR volta MEDIDO, e não estimado pelo chamador: o card
          // do painel mostrava "~18 s por página" somando download e
          // rasterização ao OCR, o que atribuía ao motor um custo que não era
          // dele e tornava impossível saber o que otimizar.
          ms,
          // Vai só na resposta em que houve decisão NOVA — `tomarDecisao()`
          // devolve e zera, como o `tirarDiag()` ao lado. Campo ausente não é
          // erro nenhum do outro lado.
          decisao: tomarDecisao(),
          diag: tirarDiag(),
        });
      } catch (e) {
        d("ERRO:", (e && e.stack) || (e && e.message) || String(e));
        responder({ ok: false, erro: String((e && e.message) || e), diag: tirarDiag() });
      }
    })();
    return true; // resposta assíncrona
  }

  return false;
});

function percentil(v, q) {
  const s = v.slice().sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))));
  return s[i];
}
