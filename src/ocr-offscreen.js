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

  // `navigator.gpu` EXISTIR não prova que o modelo roda: o WebGPU cobre um
  // subconjunto dos operadores, e a sessão pode falhar na criação, na
  // compilação do shader, por memória ou por device lost. Por isso a escolha é
  // por TENTATIVA de sessão real, com fallback para WASM — e o WASM é a base
  // universal, nunca o contrário.
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
  const base = {
    model: { detection, recognition, charactersDictionary },
    // `canvas-native` evita arrastar o OpenCV em WASM (ppu-ocv) para dentro do
    // pacote — são megabytes por uma precisão de caixa que não muda o texto.
    processing: { engine: "canvas-native" },
  };

  if (temGpu) {
    try {
      d("initialize() no WebGPU…");
      const s = new API.PaddleOcrService(base);
      await s.initialize();
      d("initialize WebGPU OK");
      servico = s;
      backendAtivo = "WebGPU";
      return s;
    } catch (e) {
      d("WebGPU recusou:", (e && e.message) || String(e), "-> caindo para WASM");
    }
  }

  const s = new API.PaddleOcrService(
    Object.assign({}, base, { session: { executionProviders: ["wasm"] } })
  );
  d("initialize() no WASM…");
  await s.initialize();
  d("initialize WASM OK");
  servico = s;
  // O numero de threads vai JUNTO do nome do backend porque e' ele que explica a
  // velocidade: "WASM x1" e "WASM x4" sao 21x diferentes, e sem isso escrito no
  // arquivo a lentidao volta a ser invisivel para quem for diagnosticar.
  backendAtivo = "WASM x" + threads;
  return s;
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
        const svc = await garantirServico();
        d("reconhecendo página (" + Math.round((msg.img || "").length / 1024) + " KB)…");
        // A página chega como data URL (um Blob viraria `{}` ao atravessar
        // `sendMessage`). O serviço aceita ArrayBuffer.
        const resp = await fetch(msg.img);
        const buf = await resp.arrayBuffer();
        const r = await comTeto(
          svc.recognize(buf, { flatten: true, noCache: true }),
          120000,
          "o reconhecimento da página"
        );
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
