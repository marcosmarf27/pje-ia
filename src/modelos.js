// ---------------------------------------------------------------------------
// PJe IA — biblioteca de MODELOS do usuário (peças-modelo para a minuta).
//
// Irmão do PLIB (prompts.js), com duas diferenças de propósito:
//  1. Persiste em chrome.storage.LOCAL, não sync. Um modelo é uma peça inteira
//     (sentença, decisão, ofício…) — facilmente dezenas de KB, muito acima dos
//     8.192 B/item do sync. Local aguenta ~10 MB no total; perde-se o
//     espelhamento entre dispositivos (custo aceito).
//  2. Cada item tem CATEGORIA (a espécie do ato) e DESCRIÇÃO, além de
//     título + texto: a categoria é o que a minuta usa para escolher, na hora
//     de redigir, qual modelo trazer como referência de forma.
//
// Chave "modelo:<id>". ISTO GRAVA TEXTO DO USUÁRIO (possivelmente trecho de
// outros processos) NO DISCO — daí a nota no PRIVACY.md e a exclusão fácil.
// ---------------------------------------------------------------------------
const MLIB = (() => {
  const AREA = "local"; // único ponto de troca local/sync
  const PREFIXO = "modelo:";
  // Teto por modelo: puramente uma barreira de sanidade (o request da minuta
  // já carrega os autos inteiros; um modelo gigante só desperdiça tokens). O
  // local não tem cota por item, então isto é escolha de UX, não da API.
  const TETO_BYTES = 60000;

  // Espécies de ato que o usuário cadastra. `valor` é o que fica gravado e
  // casa com a detecção da minuta (content.js/panel.js); `rotulo` é a UI.
  // A ordem é a de exibição no seletor e no <optgroup>.
  const CATEGORIAS = [
    { valor: "despacho", rotulo: "Despachos" },
    { valor: "sentenca", rotulo: "Sentenças" },
    { valor: "decisao", rotulo: "Decisões, votos e acórdãos" },
    { valor: "ata", rotulo: "Atas de audiência" },
    { valor: "oficio", rotulo: "Ofícios" },
    { valor: "mandado", rotulo: "Mandados e alvarás" },
    { valor: "outro", rotulo: "Outros" },
  ];

  function rotuloCategoria(v) {
    const c = CATEGORIAS.find((x) => x.valor === v);
    return c ? c.rotulo : "Outros";
  }

  function categoriaValida(v) {
    return CATEGORIAS.some((x) => x.valor === v);
  }

  function area() {
    return chrome.storage[AREA];
  }

  function novoId() {
    try {
      return crypto.randomUUID();
    } catch {
      return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    }
  }

  // Bytes REAIS (UTF-8) — .length mentiria com o texto jurídico acentuado.
  function bytesDe(m) {
    try {
      return new TextEncoder().encode(PREFIXO + m.id + JSON.stringify(m)).length;
    } catch {
      return Infinity;
    }
  }

  function tamanhoOk(m) {
    return bytesDe(m) <= TETO_BYTES;
  }

  // cb(modelos) — sempre chamada, com [] em qualquer falha (harness sem
  // storage, contexto invalidado…): a UI nunca pode quebrar por causa daqui.
  function listar(cb) {
    try {
      area().get(null, (all) => {
        const out = [];
        for (const k in all || {}) {
          if (k.startsWith(PREFIXO) && all[k] && all[k].id) out.push(all[k]);
        }
        out.sort((a, b) =>
          String(a.titulo || "").localeCompare(String(b.titulo || ""), "pt-BR")
        );
        cb(out);
      });
    } catch {
      cb([]);
    }
  }

  // cb(erro) — string amigável ou null. Valida o teto ANTES do set e checa
  // chrome.runtime.lastError (cota total do local): nunca falha mudo.
  function salvar(m, cb) {
    if (!tamanhoOk(m)) {
      cb("o modelo excede o limite de " + Math.round(TETO_BYTES / 1000) + " mil caracteres — encurte o texto.");
      return;
    }
    try {
      area().set({ [PREFIXO + m.id]: m }, () => {
        cb(chrome.runtime.lastError ? chrome.runtime.lastError.message : null);
      });
    } catch (e) {
      cb(String((e && e.message) || e));
    }
  }

  function excluir(id, cb) {
    try {
      area().remove(PREFIXO + id, () => {
        if (cb) cb(chrome.runtime.lastError ? chrome.runtime.lastError.message : null);
      });
    } catch (e) {
      if (cb) cb(String((e && e.message) || e));
    }
  }

  // Re-lista a cada mudança na própria aba ou em outra. Filtra a área "local"
  // e o prefixo "modelo:" para NÃO colidir com o storage.onChanged do
  // content.js (config) nem com o do PLIB (área "sync").
  function aoMudar(cb) {
    try {
      chrome.storage.onChanged.addListener((ch, areaName) => {
        if (areaName !== AREA) return;
        if (!Object.keys(ch).some((k) => k.startsWith(PREFIXO))) return;
        listar(cb);
      });
    } catch {
      /* sem storage (harness): sem propagação, a lista local segue valendo */
    }
  }

  return {
    listar,
    salvar,
    excluir,
    tamanhoOk,
    bytesDe,
    aoMudar,
    novoId,
    CATEGORIAS,
    rotuloCategoria,
    categoriaValida,
    TETO_BYTES,
    _AREA: AREA,
  };
})();
