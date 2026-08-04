// ---------------------------------------------------------------------------
// PJe IA — OCR de peças digitalizadas pela API da Mistral.
//
// Quarto irmão de claude.js / gemini.js / openai.js, com um papel diferente:
// a Mistral NÃO é provedor de chat aqui. Ela só converte o PDF de uma peça
// digitalizada em texto, e por isso não entra em `providerDe()` nem em
// `chaveDe()` — trocar o modelo do chat nunca deve escolher um OCR.
//
// É o NÍVEL 2 da extração: o nível 1 (pdf.js, em src/extrator.js) lê a camada
// de texto que a maioria das peças já tem, de graça e sem nada sair do
// navegador. Só cai aqui a peça que é imagem — e aí o usuário confirma, porque
// custa por página e o pacote sai do computador dele.
// ---------------------------------------------------------------------------
const API = "https://api.mistral.ai/v1";

// Preço por 1.000 páginas (tabela pública da Mistral). O custo entra no mesmo
// acumulador do rodapé que os tokens do chat — o usuário vê UM número.
export const MISTRAL_MODELS = {
  "mistral-ocr-latest": { rotulo: "Mistral OCR 3", usdPor1000Paginas: 2 },
  "mistral-ocr-4-0": { rotulo: "Mistral OCR 4", usdPor1000Paginas: 4 },
};
export const MISTRAL_MODEL_PADRAO = "mistral-ocr-latest";

// Limites da API. Ambos já são mais folgados do que os que a extensão impõe
// antes (MODEL_CAPS.maxPages, MAX_TOTAL_B64_CHARS), mas conferimos aqui para
// falhar com mensagem clara em vez de 413.
export const MISTRAL_MAX_BYTES = 50 * 1024 * 1024;
export const MISTRAL_MAX_PAGINAS = 1000;

function precoDe(model) {
  const m = MISTRAL_MODELS[model] || MISTRAL_MODELS[MISTRAL_MODEL_PADRAO];
  return m.usdPor1000Paginas;
}

export function custoOcrUsd(model, paginas) {
  return (precoDe(model) * (paginas || 0)) / 1000;
}

async function erroHttp(resp) {
  let detalhe = "";
  try {
    const j = await resp.json();
    detalhe =
      (j && j.message) ||
      (j && j.error && (j.error.message || j.error)) ||
      (j && j.detail && (j.detail[0] ? j.detail[0].msg : j.detail)) ||
      "";
  } catch {
    try {
      detalhe = (await resp.text()).slice(0, 300);
    } catch {
      /* corpo ilegível */
    }
  }
  if (resp.status === 401)
    return "chave da Mistral inválida — confira em Configurações da extensão";
  if (resp.status === 429)
    return "limite de uso da Mistral atingido — tente de novo em instantes";
  if (resp.status === 413) return "a peça excede o limite de 50 MB da API de OCR";
  return "OCR falhou (HTTP " + resp.status + ")" + (detalhe ? ": " + detalhe : "");
}

// Converte a resposta da API em folhas [{p, texto}], com a numeração começando
// em 1 — que é como a folha aparece nos autos e em toda citação do projeto.
//
// A API devolve `pages[].index`, e a documentação não fixa a base. Em vez de
// apostar, detectamos: se o menor índice é 0, a API é 0-based e somamos 1. Sem
// isto, uma resposta 0-based produziria "fl. 0" e deslocaria TODAS as citações
// em uma folha — um erro que passa despercebido e corrompe a rastreabilidade.
function folhasDe(pages) {
  const idx = pages
    .map((pg) => (typeof pg.index === "number" ? pg.index : null))
    .filter((n) => n !== null);
  // Sem índice nenhum caímos na posição do array, que também é 0-based — daí o
  // `!idx.length` somar 1 igual ao caso 0-based explícito.
  const base = !idx.length || Math.min(...idx) === 0 ? 1 : 0;
  return pages.map((pg, i) => ({
    p: (typeof pg.index === "number" ? pg.index : i) + base,
    texto: String(pg.markdown || "").trim(),
  }));
}

// OCR de UMA peça. Um request por peça, de propósito: a chamada é síncrona do
// ponto de vista do content script, que orquestra a fila e mantém o service
// worker vivo a cada sendMessage.
//
// O PDF vai como data URI no `document_url` — a API aceita essa forma, e ela
// evita as duas chamadas extras do caminho Files API + signed URL. O base64 já
// está no docsCache: nenhuma conversão nova.
export async function ocrMistral({ apiKey, model, b64, paginas }) {
  const mdl = MISTRAL_MODELS[model] ? model : MISTRAL_MODEL_PADRAO;
  const bytes = Math.floor((b64 || "").length * 0.75); // base64 → bytes
  if (!b64) throw new Error("peça sem conteúdo para OCR");
  if (bytes > MISTRAL_MAX_BYTES) {
    throw new Error(
      "a peça tem ~" +
        Math.round(bytes / 1024 / 1024) +
        " MB e o limite do OCR é 50 MB — use o documento original nesta peça"
    );
  }
  if (paginas && paginas > MISTRAL_MAX_PAGINAS) {
    throw new Error(
      "a peça tem " + paginas + " páginas e o limite do OCR é 1.000 por documento"
    );
  }

  const resp = await fetch(API + "/ocr", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: mdl,
      document: {
        type: "document_url",
        document_url: "data:application/pdf;base64," + b64,
      },
      // As imagens extraídas não são usadas em lugar nenhum e multiplicariam o
      // tamanho da resposta por dez.
      include_image_base64: false,
    }),
  });

  if (!resp.ok) {
    const err = new Error(await erroHttp(resp));
    err.status = resp.status;
    // transitórios: o chamador re-tenta o MESMO request com backoff
    err.retryable = resp.status === 429 || resp.status >= 500;
    throw err;
  }

  const j = await resp.json();
  const pages = (j && j.pages) || [];
  if (!pages.length) throw new Error("o OCR não retornou nenhuma página");
  const folhas = folhasDe(pages);
  const processadas =
    (j.usage_info && j.usage_info.pages_processed) || folhas.length;
  return {
    folhas,
    paginas: folhas.length,
    custoUsd: custoOcrUsd(mdl, processadas),
    modelo: mdl,
  };
}
