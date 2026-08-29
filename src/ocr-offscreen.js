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

async function baixarLocal(caminho) {
  const r = await fetch(chrome.runtime.getURL(caminho));
  if (!r.ok) throw new Error("não foi possível ler " + caminho);
  return r.arrayBuffer();
}

async function garantirServico() {
  if (servico) return servico;
  if (!iniciando) iniciando = criarServico().finally(() => (iniciando = null));
  return iniciando;
}

async function criarServico() {
  const API = self.PpuOcr;
  if (!API) throw new Error("motor de OCR não carregou");

  // Os binários do ORT (.wasm E .mjs) precisam sair do PACOTE e da MESMA
  // compilação do JS. Copiar só o .wasm devolve "no available backend found".
  API.ort.env.wasm.wasmPaths = chrome.runtime.getURL("vendor/ort/");

  const [detection, recognition, charactersDictionary] = await Promise.all([
    baixarLocal(MODELOS.detection),
    baixarLocal(MODELOS.recognition),
    baixarLocal(MODELOS.charactersDictionary),
  ]);

  // `navigator.gpu` EXISTIR não prova que o modelo roda: o WebGPU cobre um
  // subconjunto dos operadores, e a sessão pode falhar na criação, na
  // compilação do shader, por memória ou por device lost. Por isso a escolha é
  // por TENTATIVA de sessão real, com fallback para WASM — e o WASM é a base
  // universal, nunca o contrário.
  const temGpu = (await API.isWebGpuAvailable?.().catch(() => false)) || false;
  const base = {
    model: { detection, recognition, charactersDictionary },
    // `canvas-native` evita arrastar o OpenCV em WASM (ppu-ocv) para dentro do
    // pacote — são megabytes por uma precisão de caixa que não muda o texto.
    processing: { engine: "canvas-native" },
  };

  if (temGpu) {
    try {
      const s = new API.PaddleOcrService(base);
      await s.initialize();
      servico = s;
      backendAtivo = "webgpu";
      return s;
    } catch (e) {
      console.warn("[PJe IA] WebGPU recusou o modelo, caindo para WASM:", (e && e.message) || e);
    }
  }

  const s = new API.PaddleOcrService(
    Object.assign({}, base, { session: { executionProviders: ["wasm"] } })
  );
  await s.initialize();
  servico = s;
  backendAtivo = "wasm";
  return s;
}

// --- canal -------------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
  if (!msg || msg.alvo !== "ocrOffscreen") return false;

  if (msg.tipo === "ping") {
    responder({ ok: true });
    return true;
  }

  if (msg.tipo === "reconhecer") {
    (async () => {
      try {
        const svc = await garantirServico();
        // A página chega como data URL (um Blob viraria `{}` ao atravessar
        // `sendMessage`). O serviço aceita ArrayBuffer.
        const resp = await fetch(msg.img);
        const buf = await resp.arrayBuffer();
        const r = await svc.recognize(buf, { flatten: true, noCache: true });
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
        });
      } catch (e) {
        responder({ ok: false, erro: String((e && e.message) || e) });
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
