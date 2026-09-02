// src/ner-worker.js — o NER roda AQUI, num Web Worker que é terminado ao fim.
//
// POR QUE UM WORKER, E NÃO O REALM DO DOCUMENTO OFFSCREEN. `InferenceSession
// .create()` copia os pesos para dentro da `WebAssembly.Memory` do ORT, e
// `WebAssembly.Memory` **cresce e nunca encolhe**. Criar a sessão do BERT no
// mesmo módulo WASM que hospeda o PP-OCRv6 comprometeria ~500 MB de heap PELA
// VIDA do documento offscreen — inclusive durante o OCR das peças seguintes.
// `session.release()` devolve a memória ao alocador do ORT, não ao sistema.
//
// É esse o mecanismo por trás do número que o TecJustiça Sigilo mediu: ter o
// BERT residente e NÃO USADO deixou a extração 1,48× mais lenta. O único ponto
// de liberação determinística que a plataforma oferece é `Worker.terminate()`,
// que destrói a instância WASM inteira. Daí o desenho: o offscreen cria este
// worker, manda o lote, recebe os spans e o TERMINA. O OCR fica intocado.
//
// O ORT ENTRA COMO MÓDULO, e não pelo bundle do OCR: aquele é um IIFE que
// publica `window.PpuOcr`, e **`window` não existe num Web Worker**. O que se
// duplica é o JS (413 KB); o que NÃO se duplica é o que pesa — o
// `ort.bundle.min.mjs` referencia exatamente os mesmos
// `ort-wasm-simd-threaded.jsep.{mjs,wasm}` que já estavam no pacote para o OCR.
// A invariante do `vendor/LICENSES.md` vale para as TRÊS peças: mesma
// compilação, 1.29.0.
import * as ort from "../vendor/ort/ort.bundle.min.mjs";
import "./tokenizador.js";
import "./ner-nucleo.js";
// Só pela `conferirPolitica`: é ela que recusa um modelo cujo `id2label` traga
// uma classe que a política não conhece.
import "./anonimizar.js";

const T = self.Tokenizador;
const NUCLEO = self.NerNucleo;

const BASE = new URL("../vendor/ner-modelo/", import.meta.url);
const CAMINHO_ORT = new URL("../vendor/ort/", import.meta.url).href;

let sessao = null;
let vocab = null;
let rotulos = null;
let padId = 0;
let backend = "";
let cancelar = false;

function diag(msg) {
  self.postMessage({ tipo: "diag", msg: String(msg) });
}

async function json(nome) {
  const r = await fetch(new URL(nome, BASE));
  if (!r.ok) throw new Error("não foi possível ler " + nome + " (HTTP " + r.status + ")");
  return r.json();
}

async function texto(nome) {
  const r = await fetch(new URL(nome, BASE));
  if (!r.ok) throw new Error("não foi possível ler " + nome + " (HTTP " + r.status + ")");
  return r.text();
}

// Carrega uma vez. `qual` é "wasm" ou "webgpu" — quem decide é o duelo, que
// mora no offscreen (é ele que tem como persistir a decisão).
async function carregar(qual, opcoesCarga) {
  if (sessao) return { backend: backend };

  ort.env.wasm.wasmPaths = CAMINHO_ORT;
  // Threads só com isolamento cross-origin, que o manifest garante pelas chaves
  // COEP/COOP. Sem elas o ORT cai para uma thread e a diferença é de ordem de
  // grandeza — o OCR mediu 21× no mesmo eixo.
  const podeThreads = self.crossOriginIsolated && typeof SharedArrayBuffer !== "undefined";
  ort.env.wasm.numThreads = podeThreads ? Math.min(4, self.navigator.hardwareConcurrency || 4) : 1;
  ort.env.logLevel = "error";

  const cfg = await json("config.json");
  const cfgTok = await json("tokenizer_config.json");
  // LANÇA se o tokenizador embarcado não casar com o do modelo. Degradar aqui
  // significaria tokenizar diferente do treino, e o efeito de um rótulo
  // deslocado num anonimizador é um nome que não foi mascarado.
  T.conferirConfig(cfgTok);

  vocab = T.lerVocabulario(await texto("vocab.txt"));
  rotulos = NUCLEO.rotulosDe(cfg.id2label);
  // A POLÍTICA É CONFERIDA CONTRA O MODELO, aqui e não na primeira inferência:
  // `conferirPolitica` transforma um rótulo desconhecido em recusa explícita, e
  // sem chamá-la a falha fechada que ela implementa nunca acontecia — uma versão
  // futura do modelo com uma classe a mais teria essa entidade silenciosamente
  // PRESERVADA (`politica[tipo]` seria `undefined`, e `undefined !== false`).
  // A política viaja do content script porque é lá que ela vive; sem ela (um
  // chamador antigo), não há o que conferir.
  if (opcoesCarga && opcoesCarga.politica) {
    if (!self.ANON) {
      throw new Error("anonimizar.js não está carregado no worker do NER");
    }
    self.ANON.conferirPolitica(opcoesCarga.politica, cfg.id2label);
  }
  padId = cfg.pad_token_id == null ? 0 : cfg.pad_token_id;
  if (vocab.size !== cfg.vocab_size) {
    throw new Error(
      "o vocabulário tem " + vocab.size + " entradas e o config.json declara " + cfg.vocab_size
    );
  }

  const t0 = Date.now();
  sessao = await ort.InferenceSession.create(new URL("model.onnx", BASE).href, {
    executionProviders: [qual === "webgpu" ? "webgpu" : "wasm"],
    graphOptimizationLevel: "all",
  });
  backend = qual === "webgpu" ? "WebGPU" : "WASM x" + ort.env.wasm.numThreads;
  diag("sessão pronta em " + (Date.now() - t0) + " ms, backend " + backend);

  // INSPECIONAR, NUNCA PRESUMIR. O `optimum-cli` emite TRÊS entradas para o
  // BertForTokenClassification (input_ids, attention_mask, token_type_ids), mas
  // a lista depende da versão do exportador. Alimentar a menos dá erro de
  // runtime; alimentar a mais, também. Ler os nomes reais é o que faz uma
  // reexportação futura falhar com mensagem em vez de silenciosamente.
  const esperadas = ["input_ids", "attention_mask"];
  for (const nome of esperadas) {
    if (!sessao.inputNames.includes(nome)) {
      throw new Error(
        "o modelo não tem a entrada '" + nome + "' (tem: " + sessao.inputNames.join(", ") + ")"
      );
    }
  }
  diag("entradas: " + sessao.inputNames.join(", ") + " | saídas: " + sessao.outputNames.join(", "));
  return { backend: backend };
}

// O motor que o núcleo chama: recebe os tensores já montados e devolve os
// logits achatados. Toda a lógica de janela, lote e BIO fica do lado de lá,
// onde ela é testável sem carregar 433 MB.
async function motor(tensores) {
  const [B, L] = tensores.dims;
  const feeds = {
    input_ids: new ort.Tensor("int64", tensores.ids, [B, L]),
    attention_mask: new ort.Tensor("int64", tensores.mask, [B, L]),
  };
  if (sessao.inputNames.includes("token_type_ids")) {
    feeds.token_type_ids = new ort.Tensor("int64", tensores.tipos, [B, L]);
  }
  const saida = await sessao.run(feeds);
  const nome = sessao.outputNames.includes("logits") ? "logits" : sessao.outputNames[0];
  return saida[nome].data;
}

async function detectar(texto, opts) {
  if (!sessao) throw new Error("a sessão do NER não foi carregada");
  const o = opts || {};
  return NUCLEO.correr(texto, vocab, motor, {
    tokenizador: T,
    rotulos: rotulos,
    padId: padId,
    tamLote: o.tamLote || 8,
    uteis: o.uteis,
    over: o.over,
    aoAndar: (feitas, total) => self.postMessage({ tipo: "progresso", feitas, total }),
    cancelado: () => cancelar,
  });
}

self.onmessage = async (ev) => {
  const m = ev.data || {};
  try {
    if (m.tipo === "carregar") {
      const r = await carregar(m.backend, m);
      self.postMessage({ tipo: "pronto", id: m.id, backend: r.backend });
      return;
    }
    if (m.tipo === "detectar") {
      cancelar = false;
      const t0 = Date.now();
      const spans = await detectar(m.texto, m.opts);
      self.postMessage({
        tipo: "spans",
        id: m.id,
        spans: spans,
        ms: Date.now() - t0,
        chars: (m.texto || "").length,
        backend: backend,
      });
      return;
    }
    if (m.tipo === "cancelar") {
      cancelar = true;
      self.postMessage({ tipo: "cancelado", id: m.id });
      return;
    }
    // Tipo desconhecido é ignorado de propósito, como o handler do Port do
    // worker faz com o `ping`: um remetente novo não pode derrubar este.
  } catch (e) {
    // NUNCA repassar o texto analisado na mensagem de erro — ele é o conteúdo
    // dos autos, e um erro que carrega o dado é um vazamento com outro nome.
    self.postMessage({ tipo: "erro", id: m.id, erro: (e && e.message) || String(e) });
  }
};
