// src/tokenizador.js — WordPiece do BERT, escrito à mão, com offsets de caractere.
//
// Por que escrever um em vez de vendorizar "@huggingface/transformers": a
// extensão NÃO TEM build step (primeira linha do CLAUDE.md) e o Transformers.js
// é pacote ESM moderno, que exigiria um; pior, ele traz o PRÓPRIO ONNX Runtime,
// duplicando os 27 MB de vendor/ort/ que já estão no pacote — o guia técnico
// manda eliminar essa duplicação antes do release. O que sobra do problema é um
// Map de 29.794 entradas e duas passadas de string. É a mesma conta que manteve
// o JSZip fora (zip.js), o extrator de RTF próprio (pje.js) e o conversor de
// Markdown próprio (minuta-md.js).
//
// O QUE ESTE ARQUIVO REPLICA, e por que a fidelidade é de SEGURANÇA e não de
// estilo: um token a mais ou a menos desloca o rótulo previsto para a posição
// errada, e o efeito de um rótulo deslocado num anonimizador é um nome que não
// foi mascarado. Daí o contrato ser copiado do modelo, não da memória:
//
//   tokenizer_config.json -> do_lower_case: false | strip_accents: null
//                            do_basic_tokenize: true | tokenize_chinese_chars: true
//
// Em BasicTokenizer, strip_accents só age quando é verdadeiro OU quando
// do_lower_case é verdadeiro. Aqui os dois são falsos: **não há minúsculas e
// não há remoção de acento**. Isso contraria o reflexo do resto do projeto — o
// norm() do painel faz NFD + remoção de diacríticos em toda classificação de
// peça —, e usar aquele aqui produziria um fluxo de tokens completamente
// diferente. É literalmente o "erro de acento" de que o guia avisa.
//
// OFFSETS: o resultado carrega, por token, o intervalo [ini, fim) na string que
// FOI PASSADA. Para não existirem dois sistemas de coordenadas, a normalização
// Unicode acontece UMA vez, na entrada, em paraCanonico: a string canônica é a
// que se tokeniza, a que se mascara, a que vai ao modelo e a que vai ao
// arquivo. O BasicTokenizer do HF normaliza para NFC lá dentro, depois de
// limpar; fazendo antes, o índice de cada code point vale do começo ao fim e
// nada precisa ser remapeado.
//
// ASTRAL PLANE: o vocabulário termina em "##U+103BE", "##U+10B9E", "##U+10BAD"
// — code points acima de 0xFFFF, que em JavaScript são PARES de unidades
// UTF-16. Toda iteração aqui é por CODE POINT (for..of), nunca por índice de
// string, e o teto de 100 caracteres por palavra do WordPiece conta code
// points, como o list(token) do Python.
(() => {
  "use strict";

  // ---------------------------------------------------------------- constantes
  // Espelham WordpieceTokenizer.max_input_chars_per_word e os especiais do
  // special_tokens_map.json do modelo.
  const MAX_CHARS_PALAVRA = 100;
  const UNK = "[UNK]";
  const CLS = "[CLS]";
  const SEP = "[SEP]";

  // Janelamento. 512 é max_position_embeddings do config.json e inclui os dois
  // especiais, então o teto útil é 510. O guia sugere 384 úteis com 64 de
  // sobreposição; a sobreposição existe para o nome partido na fronteira não
  // sumir, que é um dos dois únicos escapes do gate de 819 páginas do
  // TecJustiça Sigilo.
  //
  // INVARIANTE: `JANELA_OVER` tem de ser MAIOR que a entidade mais longa, EM
  // TOKENS. Não é margem de conforto — abaixo disso a entidade que cai sobre a
  // fronteira não é vista inteira por NENHUMA das duas janelas, e a `naBorda`
  // do ner-nucleo não a salva, porque ela nunca chega a ser detectada. O nome
  // sai em claro, sem sintoma nenhum.
  // Medido: "ELIONEUDO EVARISTO" são DOZE tokens (o WordPiece parte nome
  // próprio em pedaços de uma letra: E ##L ##IO ##N ##E ##U ##DO E ##VA…), e
  // com `over: 8` a detecção some por completo. Os 64 daqui dão folga de 5×
  // sobre um nome composto longo. Quem for reduzi-los para economizar
  // inferência precisa medir o nome mais longo dos autos primeiro — há teste
  // que documenta esse custo.
  const JANELA_UTEIS = 384;
  const JANELA_OVER = 64;
  const JANELA_TETO = 510;

  // -------------------------------------------------------- classes de caractere
  // _is_control do HF: \t \n \r NÃO são controle (caem no ramo de espaço em
  // branco logo abaixo); o resto da categoria geral "C" é. Em JavaScript \p{C}
  // cobre Cc, Cf, Co, Cs e Cn — o mesmo que category().startswith("C") em
  // Python, inclusive o Cn (não atribuído), que o HF também descarta.
  const RE_CONTROLE = /\p{C}/u;
  // _is_whitespace: espaço, \t, \n, \r, mais a categoria Zs.
  const RE_ESPACO = /[ \t\n\r]|\p{Zs}/u;
  // _is_punctuation: as quatro faixas ASCII vêm ANTES da categoria, e não são
  // redundantes — cifrão, mais, menor, igual, maior, circunflexo, crase, barra
  // vertical e til são Sc/Sm/Sk, não P, e mesmo assim o HF os trata como
  // pontuação. Ler só \p{P} mudaria a divisão de palavras.
  const RE_PONTUACAO = /\p{P}/u;
  function ehPontuacao(cp) {
    if (
      (cp >= 33 && cp <= 47) ||
      (cp >= 58 && cp <= 64) ||
      (cp >= 91 && cp <= 96) ||
      (cp >= 123 && cp <= 126)
    ) {
      return true;
    }
    return RE_PONTUACAO.test(String.fromCodePoint(cp));
  }

  // _is_chinese_char: as oito faixas CJK do HF, verbatim.
  function ehCjk(cp) {
    return (
      (cp >= 0x4e00 && cp <= 0x9fff) ||
      (cp >= 0x3400 && cp <= 0x4dbf) ||
      (cp >= 0x20000 && cp <= 0x2a6df) ||
      (cp >= 0x2a700 && cp <= 0x2b73f) ||
      (cp >= 0x2b740 && cp <= 0x2b81f) ||
      (cp >= 0x2b820 && cp <= 0x2ceaf) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0x2f800 && cp <= 0x2fa1f)
    );
  }

  // ------------------------------------------------------------------ canônico
  // A ÚNICA normalização Unicode do pipeline. Chamada uma vez, na entrada; daí
  // em diante a string devolvida é a verdade para offset, máscara e arquivo.
  // NFC e não NFKC: a compatibilidade (NFKC) reescreve ligaduras, frações e
  // formas de largura — mudaria o texto do documento, e o que sai daqui vira
  // registro de trabalho.
  function paraCanonico(texto) {
    return String(texto == null ? "" : texto).normalize("NFC");
  }

  // -------------------------------------------------------------- vocabulário
  // vocab.txt é uma linha por token, e o índice da linha É o id. Só o \r do
  // CRLF é retirado — nada de trim(), que comeria um token que fosse um único
  // caractere de espaço se o vocabulário mudasse.
  function lerVocabulario(texto) {
    const mapa = new Map();
    const linhas = String(texto).split("\n");
    for (let i = 0; i < linhas.length; i++) {
      let t = linhas[i];
      if (t.endsWith("\r")) t = t.slice(0, -1);
      if (!t.length && i === linhas.length - 1) continue; // quebra final do arquivo
      if (!mapa.has(t)) mapa.set(t, i);
    }
    return mapa;
  }

  // ------------------------------------------------------------- BasicTokenizer
  // Devolve [{c, i, larg}], onde c é o code point como string e i é o índice
  // dele na string ORIGINAL. É este par que faz o offset sobreviver à limpeza:
  // o HF REMOVE caracteres (nulo, U+FFFD, controle) e SUBSTITUI espaço em
  // branco por espaço simples, e as duas coisas deslocariam índices se o texto
  // fosse reescrito.
  function limpar(texto) {
    const saida = [];
    let i = 0;
    for (const ch of texto) {
      const cp = ch.codePointAt(0);
      const larg = ch.length;
      const espaco = RE_ESPACO.test(ch);
      if (cp === 0 || cp === 0xfffd || (!espaco && RE_CONTROLE.test(ch))) {
        i += larg;
        continue;
      }
      if (espaco) {
        saida.push({ c: " ", i: i, larg: larg });
      } else if (ehCjk(cp)) {
        // _tokenize_chinese_chars cerca o ideograma de espaços. Os espaços
        // sintéticos têm largura ZERO e herdam o índice vizinho: existem só
        // para separar palavras e morrem na divisão por espaço.
        saida.push({ c: " ", i: i, larg: 0 });
        saida.push({ c: ch, i: i, larg: larg });
        saida.push({ c: " ", i: i + larg, larg: 0 });
      } else {
        saida.push({ c: ch, i: i, larg: larg });
      }
      i += larg;
    }
    return saida;
  }

  // O INTERVALO PODE CONTER O QUE A LIMPEZA DESCARTOU, e isso é deliberado.
  // O offset de um token é [primeiro caractere sobrevivente, fim do último) na
  // string ORIGINAL — contíguo. Se um caractere foi descartado no MEIO da
  // palavra, ele está dentro do intervalo sem estar no texto do token:
  //
  //   "sof<U+00AD>thyphen"  ->  token "##thy"  ->  slice = "t<U+00AD>hy"
  //
  // Para mascarar, é exatamente o que se quer: substituir o intervalo apaga o
  // invisível junto. O OCR produz soft hyphen dentro de palavra com alguma
  // frequência, e um nome partido por ele (JO<U+00AD>ÃO) precisa que a máscara
  // cubra o trecho inteiro. Quem comparar `slice` com o texto do token para
  // conferir alinhamento precisa tirar \p{C} da fatia antes — não "consertar"
  // o intervalo, que quebraria a máscara.

  // Divide por espaço e depois por pontuação, preservando o intervalo de cada
  // pedaço. Cada caractere de pontuação vira uma palavra própria — é o
  // _run_split_on_punc.
  function palavras(limpo) {
    const out = [];
    let atual = null;
    const fechar = () => {
      if (atual && atual.chars.length) out.push(atual);
      atual = null;
    };
    for (const u of limpo) {
      if (u.c === " ") {
        fechar();
        continue;
      }
      if (ehPontuacao(u.c.codePointAt(0))) {
        fechar();
        out.push({ chars: [u], ini: u.i, fim: u.i + u.larg });
        continue;
      }
      if (!atual) atual = { chars: [], ini: u.i, fim: u.i };
      atual.chars.push(u);
      atual.fim = u.i + u.larg;
    }
    fechar();
    return out;
  }

  // ---------------------------------------------------------- WordpieceTokenizer
  // Casamento guloso, do mais longo para o mais curto, com "##" nas
  // continuações. Palavra que não fecha vira UM [UNK] cobrindo a palavra
  // INTEIRA — não um [UNK] por pedaço: é o is_bad do HF.
  function wordpiece(palavra, vocab) {
    const chars = palavra.chars;
    if (chars.length > MAX_CHARS_PALAVRA) {
      return [{ tok: UNK, ini: palavra.ini, fim: palavra.fim, sub: false }];
    }
    const pedacos = [];
    let inicio = 0;
    while (inicio < chars.length) {
      let fim = chars.length;
      let achado = null;
      while (inicio < fim) {
        let cand = "";
        for (let k = inicio; k < fim; k++) cand += chars[k].c;
        if (inicio > 0) cand = "##" + cand;
        if (vocab.has(cand)) {
          achado = cand;
          break;
        }
        fim -= 1;
      }
      if (achado === null) {
        return [{ tok: UNK, ini: palavra.ini, fim: palavra.fim, sub: false }];
      }
      const ultimo = chars[fim - 1];
      pedacos.push({
        tok: achado,
        ini: chars[inicio].i,
        fim: ultimo.i + ultimo.larg,
        sub: inicio > 0,
      });
      inicio = fim;
    }
    return pedacos;
  }

  // ------------------------------------------------------------------- público
  // tokenizar(texto, vocab) -> [{tok, id, ini, fim, sub}]
  //
  // NÃO acrescenta [CLS]/[SEP] — quem faz isso é janelas(), porque os especiais
  // são por JANELA e não pelo texto. E NÃO normaliza: o chamador passa o que
  // paraCanonico devolveu, senão os offsets apontam para outra string.
  function tokenizar(texto, vocab) {
    const toks = [];
    const idUnk = vocab.get(UNK);
    for (const p of palavras(limpar(texto))) {
      for (const t of wordpiece(p, vocab)) {
        toks.push({
          tok: t.tok,
          id: vocab.has(t.tok) ? vocab.get(t.tok) : idUnk,
          ini: t.ini,
          fim: t.fim,
          sub: t.sub,
        });
      }
    }
    return toks;
  }

  // janelas(tokens, vocab, opts) -> [{ini, tokens, ids}]
  //
  // ini é o índice do primeiro token da janela no array completo — é por ele
  // que a entidade encontrada volta para o texto inteiro. Os ids já vêm com
  // [CLS] na frente e [SEP] no fim, que é o que o modelo espera; os dois NÃO
  // entram em tokens, para o índice do rótulo previsto bater com o token
  // depois de descontar a posição 0.
  function janelas(tokens, vocab, opts) {
    const o = opts || {};
    const uteis = Math.max(1, Math.min(o.uteis || JANELA_UTEIS, JANELA_TETO));
    const over = Math.max(0, Math.min(o.over == null ? JANELA_OVER : o.over, uteis - 1));
    const passo = Math.max(1, uteis - over);
    const idCls = vocab.get(CLS);
    const idSep = vocab.get(SEP);
    const out = [];
    if (!tokens.length) return out;
    for (let ini = 0; ini < tokens.length; ini += passo) {
      const fatia = tokens.slice(ini, ini + uteis);
      out.push({
        ini: ini,
        tokens: fatia,
        ids: [idCls].concat(
          fatia.map((t) => t.id),
          [idSep]
        ),
      });
      if (ini + uteis >= tokens.length) break;
    }
    return out;
  }

  // ------------------------------------------------------- guarda de contrato
  // As duas constantes acima (não baixar caixa, não tirar acento) estão
  // ESCRITAS neste arquivo, e escrita envelhece. Esta função confere o que foi
  // escrito contra o tokenizer_config.json que veio junto do modelo, e LANÇA na
  // divergência em vez de degradar.
  //
  // A armadilha é específica e vale nomear: no BertTokenizer do HF,
  // `strip_accents` tem default **null**, que significa "siga o do_lower_case".
  // Um config que diga do_lower_case:true e seja SILENCIOSO sobre strip_accents
  // também remove acento — "José" vira "Jose", os ids mudam, e um modelo cased
  // passa a ver um texto que ele nunca viu no treino. Ler `null` como "false"
  // sem olhar o do_lower_case é o erro que esta função existe para impedir.
  //
  // Mesma disciplina do VERSAO_DUELO do OCR: quem valida é quem conhece as
  // condições sob as quais a decisão vale.
  function conferirConfig(cfgTok) {
    const c = cfgTok || {};
    const baixaCaixa = c.do_lower_case === true;
    // null/undefined => segue o do_lower_case; true/false => vale o que diz.
    const tiraAcento = c.strip_accents == null ? baixaCaixa : c.strip_accents === true;
    if (baixaCaixa || tiraAcento) {
      throw new Error(
        "o tokenizador embarcado não casa com o tokenizer_config.json do modelo: " +
          "ele foi escrito para um modelo CASED e sem remoção de acento (do_lower_case=" +
          String(c.do_lower_case) +
          ", strip_accents=" +
          String(c.strip_accents) +
          ")"
      );
    }
    if (c.do_basic_tokenize === false) {
      throw new Error(
        "o tokenizador embarcado sempre faz a divisão básica; o modelo pede do_basic_tokenize=false"
      );
    }
    return {
      baixaCaixa: baixaCaixa,
      tiraAcento: tiraAcento,
      cjk: c.tokenize_chinese_chars !== false,
      unk: c.unk_token || UNK,
    };
  }

  const api = {
    paraCanonico: paraCanonico,
    lerVocabulario: lerVocabulario,
    conferirConfig: conferirConfig,
    tokenizar: tokenizar,
    janelas: janelas,
    CLS: CLS,
    SEP: SEP,
    UNK: UNK,
    JANELA_UTEIS: JANELA_UTEIS,
    JANELA_OVER: JANELA_OVER,
    JANELA_TETO: JANELA_TETO,
    // expostos para teste fora do navegador
    _limpar: limpar,
    _palavras: palavras,
    _wordpiece: wordpiece,
    _ehPontuacao: ehPontuacao,
    _ehCjk: ehCjk,
  };

  if (typeof window !== "undefined") window.Tokenizador = api;
  else if (typeof self !== "undefined") self.Tokenizador = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
