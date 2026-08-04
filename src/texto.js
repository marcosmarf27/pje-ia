// ---------------------------------------------------------------------------
// PJe IA — cache do TEXTO EXTRAÍDO das peças.
//
// Irmão do MLIB (modelos.js) e do PLIB (prompts.js), com três diferenças de
// propósito:
//
//  1. O conteúdo NÃO é do usuário — é trecho dos autos. Junto com os rascunhos
//     de minuta (`minuta:<id>`), esta é a segunda persistência do gênero na
//     extensão, e é por isso que existem as DUAS podas (idade e orçamento de
//     bytes) e a nota no PRIVACY.md.
//  2. Persiste porque EXTRAIR CUSTA. O pdf.js é grátis, mas o OCR da Mistral é
//     pago por página: perder o cache ao fechar o navegador significaria
//     repagar. Daí `local` e não `session` (que é onde vive o cache de file_id).
//  3. A chave carrega o TAMANHO do PDF (`texto:<proc>:<peca>:<bytes>`): se a
//     peça for substituída nos autos, o cache se invalida sozinho — mesma
//     técnica do cacheKey de upload em content.js.
//
// O campo `usar` mora AQUI, e não só na memória do content script, porque é a
// página de leitura (src/texto.html, outra aba) que precisa poder ligá-lo — o
// `aoMudar` propaga de volta para o painel sem RPC nenhuma.
// ---------------------------------------------------------------------------
const TEXTOLIB = (() => {
  const AREA = "local"; // único ponto de troca local/sync
  const PREFIXO = "texto:";
  // Orçamento do namespace, não da cota inteira: o `local` tem ~10 MB e já
  // hospeda `minuta:*`, `modelo:*` e a configuração. Estourar a cota faria o
  // set FALHAR — e derrubaria a gravação de uma minuta, que é trabalho do
  // usuário. 6 MB deixa essa folga de propósito.
  const ORCAMENTO_BYTES = 6000000;
  const DIAS_VALIDADE = 7;

  function area() {
    return chrome.storage[AREA];
  }

  function chaveDe(proc, peca, tamanho) {
    return PREFIXO + proc + ":" + peca + ":" + (tamanho || 0);
  }

  // --- formato do texto extraído -------------------------------------------
  // Montado AQUI, e não em cada extrator, para que pdf.js e OCR produzam texto
  // byte a byte no mesmo formato: o modelo não pode perceber de onde veio.
  //
  // O marcador `[fl. N]` é o que sustenta a regra peça·id·folha quando a peça
  // vira texto: nos provedores sem citação nativa (Gemini, OpenAI) é dele que o
  // modelo tira a folha para escrever "(Contestação, id 123456, fl. 7)"; na
  // Anthropic, a citação volta como char_location (sem página) e o mapa de
  // offsets abaixo reconstrói o número da folha a partir do índice do caractere.
  const MARCA = (p) => "[fl. " + p + "]";

  // folhas: [{p, texto}] → {md, folhas:[{p, ini, fim}], paginas, chars}
  // `ini` aponta para o INÍCIO do marcador e `fim` é exclusivo, de modo que
  // qualquer offset em [ini, fim) — inclusive um que caia no próprio marcador —
  // resolva para a folha certa.
  function montar(folhas) {
    let md = "";
    const mapa = [];
    for (const f of folhas || []) {
      const txt = String(f.texto || "").trim();
      const ini = md.length;
      md += MARCA(f.p) + "\n" + (txt ? txt + "\n" : "");
      mapa.push({ p: f.p, ini, fim: md.length });
      md += "\n";
    }
    md = md.trimEnd();
    if (mapa.length) mapa[mapa.length - 1].fim = md.length;
    return { md, folhas: mapa, paginas: mapa.length, chars: md.length };
  }

  // Trunca em FRONTEIRA DE FOLHA. Cortar no meio faria o mapa de offsets
  // apontar para texto que não foi enviado — a citação viria com a folha errada,
  // que é pior do que não vir folha nenhuma.
  // Devolve {md, folhas, paginas, cortou, folhasCortadas}.
  function cortar(md, folhas, maxChars) {
    if (!maxChars || md.length <= maxChars) {
      return { md, folhas, paginas: folhas.length, cortou: false, folhasCortadas: 0 };
    }
    let i = 0;
    while (i < folhas.length && folhas[i].fim <= maxChars) i++;
    if (!i) i = 1; // ao menos a primeira folha, mesmo que sozinha estoure
    const mantidas = folhas.slice(0, i);
    const corte = mantidas[mantidas.length - 1].fim;
    return {
      md: md.slice(0, corte),
      folhas: mantidas,
      paginas: mantidas.length,
      cortou: true,
      folhasCortadas: folhas.length - mantidas.length,
    };
  }

  // Offset de caractere → número da folha. Busca binária: a citação chega por
  // delta durante o streaming e isto roda a cada marcador.
  function folhaDoOffset(folhas, off) {
    if (!folhas || !folhas.length) return null;
    let a = 0;
    let b = folhas.length - 1;
    while (a <= b) {
      const m = (a + b) >> 1;
      if (off < folhas[m].ini) b = m - 1;
      else if (off >= folhas[m].fim) a = m + 1;
      else return folhas[m].p;
    }
    // fora de qualquer intervalo (offset no separador entre folhas, ou além do
    // fim): devolve a folha mais próxima por baixo, nunca null por um espaço
    const ult = Math.min(a, folhas.length - 1);
    return folhas[Math.max(0, ult)].p;
  }

  // Todos os registros gravados, do mais recente para o mais antigo.
  // cb(regs) — sempre chamada, com [] em qualquer falha (harness sem storage,
  // contexto invalidado…): a UI nunca pode quebrar por causa daqui.
  function listar(cb) {
    try {
      area().get(null, (all) => {
        const out = [];
        for (const k in all || {}) {
          if (k.startsWith(PREFIXO) && all[k] && all[k].md) out.push(all[k]);
        }
        out.sort((a, b) => (b.em || 0) - (a.em || 0));
        cb(out);
      });
    } catch {
      cb([]);
    }
  }

  // Os textos de UM processo, indexados por id da peça — é o formato que o
  // content script precisa para reidratar o docsCache de uma vez só.
  // cb({ [idPeca]: registro })
  function doProcesso(proc, cb) {
    listar((regs) => {
      const map = {};
      for (const r of regs) if (String(r.proc) === String(proc)) map[r.peca] = r;
      cb(map);
    });
  }

  // cb(erro) — string amigável ou null. Poda DEPOIS de gravar (a entrada nova
  // conta no orçamento) e checa chrome.runtime.lastError: nunca falha mudo.
  function salvar(reg, cb) {
    const k = reg.chave || chaveDe(reg.proc, reg.peca, reg.tamanho);
    const val = Object.assign({}, reg, { chave: k, em: reg.em || Date.now() });
    try {
      area().set({ [k]: val }, () => {
        const err = chrome.runtime.lastError ? chrome.runtime.lastError.message : null;
        if (err) {
          if (cb) cb(err);
          return;
        }
        podar(() => {
          if (cb) cb(null);
        });
      });
    } catch (e) {
      if (cb) cb(String((e && e.message) || e));
    }
  }

  // Liga/desliga o uso do texto no contexto do modelo. Escrita mínima (não
  // reescreve o `md`) para não pagar o custo de serializar centenas de KB.
  function marcarUso(k, usar, cb) {
    try {
      area().get(k, (v) => {
        const reg = v && v[k];
        if (!reg) {
          if (cb) cb("registro não encontrado");
          return;
        }
        reg.usar = !!usar;
        area().set({ [k]: reg }, () => {
          if (cb) cb(chrome.runtime.lastError ? chrome.runtime.lastError.message : null);
        });
      });
    } catch (e) {
      if (cb) cb(String((e && e.message) || e));
    }
  }

  function excluir(k, cb) {
    try {
      area().remove(k, () => {
        if (cb) cb(chrome.runtime.lastError ? chrome.runtime.lastError.message : null);
      });
    } catch (e) {
      if (cb) cb(String((e && e.message) || e));
    }
  }

  function limparTudo(cb) {
    try {
      area().get(null, (all) => {
        const ks = Object.keys(all || {}).filter((k) => k.startsWith(PREFIXO));
        if (!ks.length) {
          if (cb) cb(null, 0);
          return;
        }
        area().remove(ks, () => {
          if (cb) cb(chrome.runtime.lastError ? chrome.runtime.lastError.message : null, ks.length);
        });
      });
    } catch (e) {
      if (cb) cb(String((e && e.message) || e), 0);
    }
  }

  // Bytes que uma entrada ocupa no storage: é a chave mais o valor serializado
  // em JSON — a mesma conta do getBytesInUse. Medimos aqui, e não com a API,
  // porque o get(null) da poda JÁ trouxe os valores: pedir de volta por chave
  // seriam N round-trips para um número que já está na mão.
  function bytesDe(k, v) {
    try {
      return new TextEncoder().encode(k + JSON.stringify(v)).length;
    } catch {
      return 0;
    }
  }

  // Poda em dois critérios, nesta ordem: idade e orçamento de bytes. Só toca em
  // chaves com o PREFIXO — `minuta:*`, `modelo:*` e a config ficam intactos.
  // cb(removidos)
  function podar(cb) {
    const fim = (n) => {
      if (cb) cb(n || 0);
    };
    try {
      area().get(null, (all) => {
        const regs = [];
        for (const k in all || {}) {
          if (k.startsWith(PREFIXO) && all[k]) {
            regs.push({ k, em: all[k].em || 0, bytes: bytesDe(k, all[k]) });
          }
        }
        if (!regs.length) return fim(0);
        regs.sort((a, b) => b.em - a.em); // recentes primeiro
        const corte = Date.now() - DIAS_VALIDADE * 86400000;
        const remover = [];
        const ficam = [];
        for (const r of regs) (r.em < corte ? remover : ficam).push(r);
        // Enquanto o namespace passar do orçamento, sai o mais antigo. O
        // `length > 1` garante que o registro recém-gravado sobreviva mesmo se
        // ele sozinho for maior que o orçamento — o usuário acabou de pagar
        // por ele (ou de esperar por ele).
        let total = ficam.reduce((a, r) => a + r.bytes, 0);
        while (total > ORCAMENTO_BYTES && ficam.length > 1) {
          const velho = ficam.pop();
          total -= velho.bytes;
          remover.push(velho);
        }
        if (!remover.length) return fim(0);
        area().remove(
          remover.map((r) => r.k),
          () => fim(remover.length)
        );
      });
    } catch {
      fim(0);
    }
  }

  // Re-lista a cada mudança na própria aba ou em outra. Filtra a área "local" e
  // o prefixo "texto:" para NÃO colidir com o storage.onChanged do content.js
  // (config, que filtra por chave nominal) nem com o do MLIB ("modelo:") nem
  // com o do PLIB (área "sync").
  function aoMudar(cb) {
    try {
      chrome.storage.onChanged.addListener((ch, areaName) => {
        if (areaName !== AREA) return;
        const chaves = Object.keys(ch).filter((k) => k.startsWith(PREFIXO));
        if (!chaves.length) return;
        cb(chaves, ch);
      });
    } catch {
      /* sem storage (harness): sem propagação, o estado local segue valendo */
    }
  }

  return {
    chaveDe,
    montar,
    cortar,
    folhaDoOffset,
    listar,
    doProcesso,
    salvar,
    marcarUso,
    excluir,
    limparTudo,
    podar,
    aoMudar,
    PREFIXO,
    ORCAMENTO_BYTES,
    DIAS_VALIDADE,
    _AREA: AREA,
  };
})();

// Alcançável tanto como content script (global) quanto pela página de leitura.
if (typeof window !== "undefined") window.TEXTOLIB = TEXTOLIB;
