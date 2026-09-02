// src/ner-nucleo.js — a parte do NER que NÃO depende do ONNX Runtime.
//
// Existe separado do worker por uma razão prática: assim o janelamento, a
// montagem do lote, a recomposição BIO e a fusão entre janelas são testáveis em
// `node` com um motor FALSO, sem carregar 433 MB de pesos. É a mesma técnica que
// provou valor no duelo de backends do OCR, e ela cobre justamente a parte onde
// os erros são silenciosos: um deslocamento de uma posição aqui devolve o
// rótulo da palavra vizinha, e o sintoma é um nome não mascarado.
//
// O QUE ESTE ARQUIVO NÃO FAZ: não tokeniza (é o `tokenizador.js`), não mascara
// (é o `pseudonimos.js`) e não decide o que é dado pessoal (é a política do
// `anonimizar.js`). Ele traduz logits em intervalos de caractere.
(() => {
  "use strict";

  // ------------------------------------------------------------------ rótulos
  // `id2label` do config.json tem CHAVES STRING E FORA DE ORDEM ("10" antes de
  // "2"). Ler por posição de array devolveria o rótulo errado para metade das
  // classes — e o erro seria mudo, porque o formato de saída continua válido.
  function rotulosDe(id2label) {
    const out = [];
    for (const k of Object.keys(id2label || {})) {
      const i = Number(k);
      if (!Number.isInteger(i) || i < 0) continue;
      out[i] = String(id2label[k]);
    }
    for (let i = 0; i < out.length; i++) if (out[i] === undefined) out[i] = "O";
    return out;
  }

  // Divide "B-PESSOA" em {prefixo:"B", tipo:"PESSOA"}; "O" vira {prefixo:"O"}.
  function partirRotulo(r) {
    const s = String(r || "O");
    if (s === "O") return { prefixo: "O", tipo: null };
    const m = s.match(/^([BI])-(.+)$/);
    return m ? { prefixo: m[1], tipo: m[2] } : { prefixo: "B", tipo: s };
  }

  // ------------------------------------------------------------------ softmax
  // Com subtração do máximo, senão `Math.exp` estoura em logit alto e devolve
  // NaN — e um NaN no score não estoura nada: ele perde toda comparação e a
  // entidade some do desempate.
  function softmaxLinha(logits, de, n) {
    let mx = -Infinity;
    for (let i = 0; i < n; i++) if (logits[de + i] > mx) mx = logits[de + i];
    let soma = 0;
    const e = new Array(n);
    for (let i = 0; i < n; i++) {
      e[i] = Math.exp(logits[de + i] - mx);
      soma += e[i];
    }
    for (let i = 0; i < n; i++) e[i] /= soma || 1;
    return e;
  }

  // ------------------------------------------------------------- lote
  // Monta os tensores de uma batelada de janelas.
  //
  // PADDING AO MAIOR DA BATELADA, nunca a 512 fixo: a atenção é O(L²), e uma
  // página de trezentos caracteres não pode pagar o custo de 512 posições. O
  // `attention_mask` zerado no padding é o que faz o modelo ignorá-lo.
  //
  // INT64 EM BigInt64Array: as três entradas do BertForTokenClassification são
  // int64, e o ONNX Runtime Web exige BigInt64Array para elas — passar
  // Int32Array dá erro de tipo na hora do `run`.
  function montarLote(janelas, opts) {
    const o = opts || {};
    const padId = o.padId == null ? 0 : o.padId;
    const B = janelas.length;
    let L = 0;
    for (const j of janelas) if (j.ids.length > L) L = j.ids.length;
    const ids = new BigInt64Array(B * L);
    const mask = new BigInt64Array(B * L);
    const tipos = new BigInt64Array(B * L); // token_type_ids: tudo zero, uma sentença só
    for (let b = 0; b < B; b++) {
      const src = janelas[b].ids;
      for (let i = 0; i < L; i++) {
        const dentro = i < src.length;
        ids[b * L + i] = BigInt(dentro ? src[i] : padId);
        mask[b * L + i] = dentro ? 1n : 0n;
      }
    }
    return { ids: ids, mask: mask, tipos: tipos, dims: [B, L] };
  }

  // ------------------------------------------------ agregação por PALAVRA
  // A unidade de decisão é a PALAVRA, nunca o subtoken. "João" tokeniza como
  // "Jo" + "##ão", e o argmax dos dois pode discordar — um deles dizer PESSOA e
  // o outro dizer O parte o nome no meio. Política: vence o subtoken de MAIOR
  // score da palavra (equivale ao aggregation_strategy="max" do HF).
  //
  // A palavra começa no token com `sub === false` e engloba os seguintes com
  // `sub === true`.
  function agregarPalavras(tokens, porToken) {
    const palavras = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (!t.sub || !palavras.length) {
        palavras.push({ ini: t.ini, fim: t.fim, rotulo: porToken[i].rotulo, score: porToken[i].score });
        continue;
      }
      const p = palavras[palavras.length - 1];
      p.fim = t.fim;
      // "O" SÓ VENCE QUANDO TODOS OS SUBTOKENS DIZEM O.
      //
      // O máximo puro inverte a segurança: com "Jo" = B-PESSOA (0,70) e "##ão"
      // = O (0,80), a palavra vira O e o NOME SOME. Num anonimizador o erro
      // caro é o falso NEGATIVO — mascarar demais custa legibilidade, mascarar
      // de menos deixa dado pessoal sair. Entre os rótulos sensíveis o máximo
      // continua decidindo; o O só entra se não houver nenhum sensível.
      const novoEhO = porToken[i].rotulo === "O";
      const atualEhO = p.rotulo === "O";
      if (atualEhO && !novoEhO) {
        p.rotulo = porToken[i].rotulo;
        p.score = porToken[i].score;
      } else if (atualEhO === novoEhO && porToken[i].score > p.score) {
        p.rotulo = porToken[i].rotulo;
        p.score = porToken[i].score;
      }
    }
    return palavras;
  }

  // ------------------------------------------------------- recomposição BIO
  // SEQUÊNCIA MALFORMADA É O CASO NORMAL, NÃO A EXCEÇÃO. O modelo emite
  // "I-PESSOA" sem "B-PESSOA" antes com frequência, e descartar por
  // malformação é PERDER UMA PESSOA EM SILÊNCIO — o pior desfecho possível
  // aqui. Regras (as do aggregation "simple" do HF):
  //   B-X            -> fecha o que estiver aberto e abre X
  //   I-X, com X aberto -> continua
  //   I-X, sem X aberto -> ABRE X (não descarta)
  //   I-Y, com X aberto -> fecha X e abre Y
  //   O              -> fecha
  function entidadesDasPalavras(palavras) {
    const out = [];
    let atual = null;
    const fechar = () => {
      if (atual) {
        atual.score = atual.soma / atual.n;
        delete atual.soma;
        delete atual.n;
        out.push(atual);
      }
      atual = null;
    };
    for (const p of palavras) {
      const { prefixo, tipo } = partirRotulo(p.rotulo);
      if (prefixo === "O" || !tipo) {
        fechar();
        continue;
      }
      if (atual && atual.tipo === tipo && prefixo === "I") {
        atual.fim = p.fim;
        atual.soma += p.score;
        atual.n += 1;
        continue;
      }
      fechar();
      atual = { tipo: tipo, ini: p.ini, fim: p.fim, soma: p.score, n: 1 };
    }
    fechar();
    return out;
  }

  // ---------------------------------------------------- decodificar uma janela
  // `logits` é a fatia da janela: L linhas por `nRotulos` colunas, onde a linha
  // 0 é o [CLS] e a última é o [SEP]. Os especiais são pulados por CONSTRUÇÃO
  // (o laço anda sobre `janela.tokens`, que não os contém), nunca por um
  // `slice(1, -1)` — que erraria numa janela com padding no fim.
  //
  // `opts.temVizinhaEsq/Dir` liga a REGRA DE FRONTEIRA: detecção que encosta na
  // borda interna é, por construção, a versão TRUNCADA — a inteira está na
  // janela vizinha, que viu aquele trecho com contexto dos dois lados.
  // Descartá-la aqui é o que evita a mesma entidade sair pela metade.
  function decodificarJanela(janela, logits, rotulos, opts) {
    const o = opts || {};
    const n = rotulos.length;
    const tokens = janela.tokens;
    const porToken = [];
    for (let i = 0; i < tokens.length; i++) {
      // +1 pula o [CLS]; a linha do token i está em i+1.
      const probs = softmaxLinha(logits, (i + 1) * n, n);
      let melhor = 0;
      for (let k = 1; k < n; k++) if (probs[k] > probs[melhor]) melhor = k;
      porToken.push({ rotulo: rotulos[melhor], score: probs[melhor] });
    }
    const palavras = agregarPalavras(tokens, porToken);
    const ents = entidadesDasPalavras(palavras);
    if (!ents.length) return ents;

    // Fronteira: MARCA, não descarta.
    //
    // A primeira versão filtrava aqui, apostando que a janela vizinha teria a
    // versão inteira. A aposta é razoável e não é garantida: a vizinha vê aquele
    // trecho com outro contexto e pode simplesmente NÃO disparar ali. Quando
    // isso acontece, descartar aqui apaga a ÚNICA detecção que existia — e o
    // nome sai inteiro, em claro.
    //
    // Marcando, quem decide é `fundirJanelas`, que já viu todas as janelas: a
    // versão truncada só cai quando existe uma versão FIRME cobrindo o mesmo
    // trecho. Sem ela, a truncada fica — máscara parcial é pior que máscara
    // inteira, e melhor que nenhuma.
    const iniJanela = tokens[0].ini;
    const fimJanela = tokens[tokens.length - 1].fim;
    for (const e of ents) {
      if ((o.temVizinhaEsq && e.ini <= iniJanela) || (o.temVizinhaDir && e.fim >= fimJanela)) {
        e.naBorda = true;
      }
    }
    return ents;
  }

  // -------------------------------------------------------------------- fusão
  // Une o que veio de todas as janelas. Duplicata EXATA some; o resto fica para
  // `PSEUD._resolverSobreposicao`, que é quem conhece a regra de desempate
  // (mais longo; empate, maior score) e a aplica também ao que veio do regex.
  // Ter duas regras de desempate em dois lugares é como elas divergem.
  function dedup(spans) {
    const porChave = new Map();
    for (const s of spans || []) {
      const k = s.tipo + "|" + s.ini + "|" + s.fim;
      const ant = porChave.get(k);
      if (!ant || s.score > ant.score) porChave.set(k, s);
    }
    return [...porChave.values()].sort((a, b) => a.ini - b.ini || b.fim - a.fim);
  }

  const cruza = (a, b) => a.ini < b.fim && b.ini < a.fim;

  // Junta o que veio de todas as janelas e resolve as marcadas na borda.
  //
  // Uma detecção `naBorda` é a candidata a TRUNCADA — ela encosta na fronteira
  // interna de uma janela, então pode ser o pedaço de uma entidade que a janela
  // vizinha viu inteira. Ela só cai quando existe uma detecção FIRME (de outra
  // janela, que viu o trecho com contexto dos dois lados) cobrindo o mesmo
  // ponto. Se não existe, ela FICA: descartar seria apagar a única detecção que
  // havia, e o nome sairia inteiro em claro.
  //
  // Duas bordas que se cruzam e nenhuma firme ficam as duas — o
  // `_resolverSobreposicao` do pseudonimos as funde pela UNIÃO na hora de
  // mascarar, que é a direção segura.
  function fundirJanelas(spans) {
    const todos = dedup(spans);
    const firmes = todos.filter((s) => !s.naBorda);
    const bordas = todos.filter((s) => s.naBorda);
    const mantidas = bordas.filter((b) => !firmes.some((f) => cruza(b, f)));
    return dedup(firmes.concat(mantidas)).map((s) => {
      // A marca é de trabalho interno; não vaza para quem consome os spans.
      if (s.naBorda) {
        const c = Object.assign({}, s);
        delete c.naBorda;
        return c;
      }
      return s;
    });
  }

  // ------------------------------------------------------- laço de alto nível
  // `correr` recebe um MOTOR — `async (lote) => Float32Array` — em vez de criar
  // a sessão. É o que torna este arquivo testável sem o modelo, e é também o
  // que deixa o worker trocar de backend sem tocar aqui.
  async function correr(texto, vocab, motor, opts) {
    const o = opts || {};
    const T = o.tokenizador || (typeof globalThis !== "undefined" && globalThis.Tokenizador);
    if (!T) throw new Error("ner-nucleo: tokenizador.js não está carregado");
    const rotulos = o.rotulos || [];
    const tamLote = o.tamLote || 8;

    const canon = texto;
    const tokens = T.tokenizar(canon, vocab);
    const janelas = T.janelas(tokens, vocab, { uteis: o.uteis, over: o.over });
    if (!janelas.length) return [];

    const achados = [];
    for (let b = 0; b < janelas.length; b += tamLote) {
      const lote = janelas.slice(b, b + tamLote);
      const tensores = montarLote(lote, { padId: o.padId });
      const logits = await motor(tensores);
      // Só o COMPRIMENTO importa aqui: o número de janelas do lote já é
      // `lote.length`, e ler `dims[0]` seria uma segunda fonte para a mesma
      // verdade — das que divergem quando alguém mexe num lado só.
      const L = tensores.dims[1];
      for (let k = 0; k < lote.length; k++) {
        const iGlobal = b + k;
        const fatia = logits.subarray
          ? logits.subarray(k * L * rotulos.length, (k + 1) * L * rotulos.length)
          : logits.slice(k * L * rotulos.length, (k + 1) * L * rotulos.length);
        for (const e of decodificarJanela(lote[k], fatia, rotulos, {
          temVizinhaEsq: iGlobal > 0,
          temVizinhaDir: iGlobal < janelas.length - 1,
        })) {
          achados.push(e);
        }
      }
      if (o.aoAndar) o.aoAndar(Math.min(b + tamLote, janelas.length), janelas.length);
      if (o.cancelado && o.cancelado()) break;
    }
    return fundirJanelas(achados);
  }

  const api = {
    rotulosDe: rotulosDe,
    partirRotulo: partirRotulo,
    montarLote: montarLote,
    agregarPalavras: agregarPalavras,
    entidadesDasPalavras: entidadesDasPalavras,
    decodificarJanela: decodificarJanela,
    dedup: dedup,
    fundirJanelas: fundirJanelas,
    correr: correr,
    _softmaxLinha: softmaxLinha,
  };

  if (typeof globalThis !== "undefined") globalThis.NerNucleo = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
