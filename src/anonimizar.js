// src/anonimizar.js — detectores determinísticos, gazetteer e política.
//
// Esta é a camada que NÃO depende do modelo, e ela é a mais confiável das duas:
// um CPF com dígito verificador válido é um CPF, ponto. O NER entra por cima,
// para o que só um modelo acha (nomes de terceiros dentro do texto), e a fusão
// resolve as sobreposições — a arquitetura do Presidio, que o guia toma como
// referência: "nenhum detector isolado será tratado como verdade absoluta".
//
// O DÍGITO VERIFICADOR NÃO É ENFEITE, E TRABALHA NOS DOIS SENTIDOS: candidato
// com DV inválido é DESCARTADO (menos falso positivo — "1.234.567.890-12" num
// contrato não é CPF de ninguém), e candidato com DV válido tem o score
// ELEVADO. É o que permite pegar CPF sem formatação sem inundar o documento de
// máscaras sobre números de protocolo.
//
// O GAZETTEER É O DETECTOR DE MAIOR RETORNO E CUSTA ZERO. `lerCabecalhoProcesso`
// (pje.js) já devolve, estruturados, o nome, o CPF/CNPJ e a OAB de CADA PARTE e
// de CADA ADVOGADO deste processo. São exatamente as pessoas que mais aparecem
// nos autos, e o modelo pode errá-las quando o nome vem em caixa alta partida
// ou com abreviação — a busca literal, não.
//
// A DENY LIST É ESTRUTURAL, não polimento. Mascarar "Ministério Público",
// "Tribunal de Justiça" ou "Banco do Brasil" não protege ninguém e arruína a
// leitura jurídica do documento. Sem ela o recurso produz documento PIOR, não
// mais seguro. A lista vem de arquivo (src/config/deny-list.json), portada do
// TecJustiça Sigilo, e não de constante no código: termo novo entra sem release.
(() => {
  "use strict";

  // ------------------------------------------------- normalização com índice
  // Comparar sem acento e sem caixa MUDA O COMPRIMENTO da string (NFD separa o
  // acento num code point próprio; o colapso de espaço come caracteres). Sem um
  // mapa de índice, todo offset achado no espaço normalizado aponta para o
  // lugar errado no texto original — e o sintoma é máscara no lugar errado, não
  // uma exceção.
  //
  // Devolve {alvo, idx}: idx[i] é o índice, no texto ORIGINAL, do caractere que
  // produziu alvo[i].
  function normalizarComIndice(texto) {
    const s = String(texto == null ? "" : texto);
    let alvo = "";
    const idx = [];
    let emEspaco = false;
    let i = 0;
    for (const ch of s) {
      const larg = ch.length;
      if (/\s/u.test(ch)) {
        // Colapsa a corrida de espaços num só, como `normalizar` do pseudonimos.
        if (!emEspaco) {
          alvo += " ";
          idx.push(i);
          emEspaco = true;
        }
        i += larg;
        continue;
      }
      emEspaco = false;
      const dec = ch.normalize("NFKD").replace(/\p{Mn}/gu, "").toLowerCase();
      // Um caractere pode virar ZERO (um acento combinante solto), UM, ou mais
      // de um ("DŽ" decompõe em "dz").
      //
      // UMA ENTRADA POR UNIDADE UTF-16, NÃO POR CODE POINT. `for..of` itera
      // code points, mas `alvo += c` acrescenta DUAS unidades quando `c` é
      // astral — e `indexOf` e `alvo[i]`, que é como este mapa é consultado,
      // trabalham em unidades. Empurrando um índice por code point, o mapa
      // dessincroniza no primeiro caractere fora do plano básico e todo offset
      // seguinte desliza. O sintoma é MÁSCARA NO LUGAR ERRADO — um nome
      // recortado pela metade, com o resto do nome saindo em claro —, e não uma
      // exceção. É a mesma armadilha do `##<astral>` no fim do vocabulário, em
      // `tokenizador.js`.
      for (const c of dec) {
        alvo += c;
        for (let k = 0; k < c.length; k++) idx.push(i);
      }
      i += larg;
    }
    // Sentinela: permite ler idx[fim] sem estourar quando o casamento vai até o fim.
    idx.push(s.length);
    return { alvo: alvo, idx: idx };
  }

  function ehLetraOuDigito(c) {
    return c !== undefined && /[\p{L}\p{N}]/u.test(c);
  }

  // ------------------------------------------------------ dígitos verificadores
  const soDigitos = (s) => String(s).replace(/\D/g, "");

  function cpfValido(bruto) {
    const d = soDigitos(bruto);
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    for (const [ate, peso] of [[9, 10], [10, 11]]) {
      let soma = 0;
      for (let i = 0; i < ate; i++) soma += Number(d[i]) * (peso - i);
      const dv = ((soma * 10) % 11) % 10;
      if (dv !== Number(d[ate])) return false;
    }
    return true;
  }

  function cnpjValido(bruto) {
    const d = soDigitos(bruto);
    if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
    const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const pesos2 = [6].concat(pesos1);
    for (const [ate, pesos] of [[12, pesos1], [13, pesos2]]) {
      let soma = 0;
      for (let i = 0; i < ate; i++) soma += Number(d[i]) * pesos[i];
      const r = soma % 11;
      const dv = r < 2 ? 0 : 11 - r;
      if (dv !== Number(d[ate])) return false;
    }
    return true;
  }

  function pisValido(bruto) {
    const d = soDigitos(bruto);
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    const pesos = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < 10; i++) soma += Number(d[i]) * pesos[i];
    const r = soma % 11;
    const dv = r < 2 ? 0 : 11 - r;
    return dv === Number(d[10]);
  }

  // CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO, com DD = 98 - (NNNNNNNAAAAJTROOOO * 100 mod 97).
  // O número tem 18 dígitos antes do *100, o que passa de Number.MAX_SAFE_INTEGER
  // — daí o módulo ser feito dígito a dígito, sobre string. Um `Number()` aqui
  // funcionaria na maioria dos casos e erraria em alguns, que é o pior modo de
  // falha para um validador.
  function cnjValido(seq, dv, ano, seg, trib, orig) {
    const corpo = seq + ano + seg + trib + orig + "00";
    let r = 0;
    for (const c of corpo) r = (r * 10 + Number(c)) % 97;
    return 98 - r === Number(dv);
  }

  // ------------------------------------------------------------------ padrões
  // Todos com fronteira de dígito (`(?<!\d)` / `(?!\d)`), o que impede casar um
  // PREFIXO de um número maior: sem isso, os 11 primeiros dígitos de um CNJ de
  // 20 dígitos passariam por CPF.
  const PADROES = [
    {
      tipo: "CNJ",
      dv: true,
      re: /(?<!\d)(\d{7})[ \t]*-?[ \t]*(\d{2})[ \t]*\.?[ \t]*(\d{4})[ \t]*\.?[ \t]*(\d)[ \t]*\.?[ \t]*(\d{2})[ \t]*\.?[ \t]*(\d{4})(?!\d)/g,
      valida: (m) => cnjValido(m[1], m[2], m[3], m[4], m[5], m[6]),
    },
    {
      tipo: "CNPJ",
      dv: true,
      re: /(?<!\d)\d{2}[ \t]*\.?[ \t]*\d{3}[ \t]*\.?[ \t]*\d{3}[ \t]*\/?[ \t]*\d{4}[ \t]*-?[ \t]*\d{2}(?!\d)/g,
      valida: (m) => cnpjValido(m[0]),
    },
    {
      tipo: "CPF",
      dv: true,
      re: /(?<!\d)\d{3}[ \t]*\.?[ \t]*\d{3}[ \t]*\.?[ \t]*\d{3}[ \t]*-?[ \t]*\d{2}(?!\d)/g,
      valida: (m) => cpfValido(m[0]),
    },
    {
      tipo: "NIT",
      dv: true,
      re: /(?<!\d)\d{3}[ \t]*\.?[ \t]*\d{5}[ \t]*\.?[ \t]*\d{2}[ \t]*-?[ \t]*\d(?!\d)/g,
      valida: (m) => pisValido(m[0]),
    },
    {
      // OAB: a UF pode vir antes ou depois do número, com ou sem barra.
      tipo: "OAB",
      dv: false,
      re: /\bOAB\s*[/\-]?\s*([A-Z]{2})?\s*n?[.º°]?\s*(?:\d{1,3}\.\d{3}|\d{1,6})(?!\d)\s*(?:[/\-]\s*([A-Z]{2}))?/gi,
      valida: () => true,
    },
    {
      // RG. Ele NÃO tem dígito verificador padronizado (cada estado emite o seu,
      // e São Paulo usa um dígito que pode ser "X"), e o número cru é
      // indistinguível de qualquer outro de 7 a 9 dígitos. Por isso este é o
      // único padrão ANCORADO NA PALAVRA: sem o rótulo por perto, não há como
      // afirmar que um número é RG, e mascarar todos encheria a peça de ruído —
      // o mesmo raciocínio da âncora de contexto do CEP.
      //
      // A máscara cobre o rótulo E o número de propósito: `[RG_1]` no lugar de
      // "RG 12.345.678-9" continua legível, e deixar o "RG" solto na frente do
      // rótulo não protege mais ninguém.
      //
      // LIMITAÇÃO DITA: um RG escrito sem nenhuma âncora ("portador do 12.345.678-9")
      // não é detectado por aqui. Quando o número for de uma parte, o gazetteer
      // da ficha o pega; de terceiro sem âncora, não.
      tipo: "RG",
      dv: false,
      re: /\b(?:RG|R\.G\.|registro\s+geral|identidade|c[ée]dula\s+de\s+identidade)\b\s*(?:n?[.º°]?\s*)?:?\s*\d{1,2}[.\s]?\d{3}[.\s]?\d{3}[-\s]?[\dxX]?(?!\d)/gi,
      valida: () => true,
    },
    {
      // \p{L}, e NÃO [A-Za-z]: com a classe ASCII, "joão@exemplo.com" casa só a
      // partir do "o" e a máscara sai PELA METADE — `joã[EMAIL_1]`, com o
      // pedaço do nome em claro. Máscara parcial é pior que máscara nenhuma:
      // ela parece resolvida. Nome com acento no e-mail é o caso comum aqui,
      // não a exceção.
      tipo: "EMAIL",
      dv: false,
      re: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/gu,
      valida: () => true,
    },
    {
      // Telefone brasileiro com DDD. Exige o DDD para não casar qualquer
      // sequência de oito dígitos — número de protocolo tem esse formato.
      tipo: "TELEFONE",
      dv: false,
      re: /(?<!\d)(?:\+?55\s?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}(?!\d)/g,
      valida: (m) => {
        const d = soDigitos(m[0]);
        return d.length === 10 || d.length === 11 || d.length === 12 || d.length === 13;
      },
    },
  ];

  // CEP só com ÂNCORA DE CONTEXTO. "62755-000" sozinho é indistinguível de um
  // intervalo numérico qualquer, e mascarar todos encheria o documento de ruído.
  const RE_CEP = /(?<!\d)\d{5}-\d{3}(?!\d)/g;
  // O `\b` de fechamento exige caractere de PALAVRA depois, e `av.` termina em
  // ponto — então `\bav\.\b` NUNCA casa "Av. Brasil", e a abreviação mais comum
  // de logradouro em endereço brasileiro não ancorava nada. Medido: "Av. Brasil,
  // 62755-000" não detectava o CEP; "Avenida Brasil, 62755-000" detectava.
  // A alternativa terminada em pontuação sai do grupo ancorado — é a mesma
  // regra que o CLAUDE.md já registra para a `RE_RUIDO` do painel ("toda
  // alternativa precisa terminar em palavra COMPLETA").
  const RE_ANCORA_CEP =
    /\b(?:cep|endere[çc]o|rua|avenida|travessa|logradouro|bairro|quadra|lote)\b|\bav\.|\br\./i;

  // --------------------------------------------------------------- deny list
  // Carregada de arquivo pelo chamador (fetch em `chrome.runtime.getURL`) e
  // passada aqui. Formato: {"*": [...], "PERSON": [...], "ORGANIZATION": [...],
  // "LOCATION": [...]} — o mesmo do TecJustiça Sigilo, para as duas listas
  // poderem ser mantidas juntas.
  function prepararDeny(bruto) {
    const norm = (s) => normalizarComIndice(s).alvo.trim();
    const geral = new Set((bruto && bruto["*"] ? bruto["*"] : []).map(norm));
    const porTipo = new Map();
    for (const k of Object.keys(bruto || {})) {
      if (k === "*") continue;
      porTipo.set(k.toUpperCase(), new Set((bruto[k] || []).map(norm)));
    }
    // Os nomes do modelo são PESSOA/ORGANIZACAO/LOCAL; os da lista são
    // PERSON/ORGANIZATION/LOCATION. Um alias evita manter duas listas.
    const ALIAS = { PESSOA: "PERSON", ORGANIZACAO: "ORGANIZATION", LOCAL: "LOCATION" };
    return function negado(tipo, valor) {
      const v = norm(valor);
      if (!v) return true;
      if (geral.has(v)) return true;
      const t = ALIAS[String(tipo).toUpperCase()] || String(tipo).toUpperCase();
      const s = porTipo.get(t);
      return !!(s && s.has(v));
    };
  }

  // --------------------------------------------------------------- gazetteer
  // Constrói a lista de valores literais deste processo a partir da ficha.
  // `ficha` é o que `PJE.lerCabecalhoProcesso()` devolve.
  //
  // O tipo do titular sai do documento: quem tem CNPJ é ORGANIZACAO, quem tem
  // CPF é PESSOA. Sem documento, o padrão é PESSOA — errar para o lado de
  // mascarar um nome de empresa custa legibilidade; errar para o outro lado
  // deixa o nome de uma pessoa sair.
  function gazetteerDaFicha(ficha) {
    const itens = [];
    const põe = (tipo, valor) => {
      const v = String(valor == null ? "" : valor).trim();
      if (v.length >= 3) itens.push({ tipo: tipo, valor: v });
    };
    if (!ficha) return itens;
    if (ficha.numero) põe("CNJ", ficha.numero);
    for (const polo of [ficha.poloAtivo, ficha.poloPassivo]) {
      for (const parte of polo || []) {
        const ehPJ = String(parte.tipoDocumento || "").toUpperCase() === "CNPJ";
        põe(ehPJ ? "ORGANIZACAO" : "PESSOA", parte.nome);
        if (parte.documento) põe(ehPJ ? "CNPJ" : "CPF", parte.documento);
        if (parte.oab) põe("OAB", parte.oab);
        for (const rep of parte.representantes || []) {
          põe("PESSOA", rep.nome);
          if (rep.documento) põe(rep.tipoDocumento === "CNPJ" ? "CNPJ" : "CPF", rep.documento);
          if (rep.oab) põe("OAB", rep.oab);
        }
      }
    }
    return itens;
  }

  // Acha as ocorrências literais do gazetteer no texto, sem acento e sem caixa,
  // com fronteira de palavra dos dois lados — a mesma regra da trava, e pelo
  // mesmo motivo: uma parte chamada "Ana" não pode mascarar "Fernanda".
  function acharGazetteer(texto, itens) {
    const { alvo, idx } = normalizarComIndice(texto);
    const out = [];
    for (const it of itens || []) {
      const agulha = normalizarComIndice(it.valor).alvo.trim();
      if (agulha.replace(/[^\p{L}\p{N}]/gu, "").length < 3) continue;
      let de = alvo.indexOf(agulha);
      while (de !== -1) {
        const ate = de + agulha.length;
        if (!ehLetraOuDigito(alvo[de - 1]) && !ehLetraOuDigito(alvo[ate])) {
          out.push({ tipo: it.tipo, ini: idx[de], fim: idx[ate], score: 1, origem: "ficha" });
        }
        de = alvo.indexOf(agulha, de + 1);
      }
    }
    return out;
  }

  // --------------------------------------------------------------- política
  // O modelo devolve seis categorias e NEM TODAS se mascara. Três delas
  // mascaradas destruiriam o documento:
  //   TEMPO         -> prazo, prescrição e a linha do tempo são o eixo do produto
  //   LEGISLACAO    -> "art. 5º da CF" é a fundamentação
  //   JURISPRUDENCIA-> idem
  // LOCAL fica opcional: endereço identifica, comarca não.
  const POLITICA_PADRAO = {
    PESSOA: true,
    ORGANIZACAO: true,
    LOCAL: false,
    TEMPO: false,
    LEGISLACAO: false,
    JURISPRUDENCIA: false,
    CPF: true,
    CNPJ: true,
    CNJ: true,
    OAB: true,
    EMAIL: true,
    TELEFONE: true,
    CEP: true,
    NIT: true,
    RG: true,
  };

  // A política é CONFERIDA contra o id2label do modelo: rótulo novo numa versão
  // futura do modelo vira recusa explícita, não um mapa silenciosamente errado.
  // É o mesmo `conferir()` do app irmão, com a mesma justificativa: duplicação
  // envelhece, e a defesa não é lembrar de sincronizar.
  function conferirPolitica(politica, id2label) {
    const faltando = [];
    for (const k of Object.keys(id2label || {})) {
      const rot = String(id2label[k] || "").replace(/^[BI]-/, "");
      if (!rot || rot === "O") continue;
      if (!(rot in politica)) faltando.push(rot);
    }
    if (faltando.length) {
      throw new Error(
        "o modelo devolve rótulos que a política não conhece (" +
          [...new Set(faltando)].join(", ") +
          "): decida mascarar ou preservar cada um antes de usar este modelo"
      );
    }
    return true;
  }

  // ------------------------------------------------------------------ detectar
  // `opts`: {ficha, negado, politica, comCep}
  // Devolve [{tipo, ini, fim, score, origem}] SEM resolver sobreposição — quem
  // resolve é `PSEUD._resolverSobreposicao`, no momento de mascarar, porque a
  // regra de desempate é a mesma para o que vem daqui e o que vem do NER.
  function detectar(texto, opts) {
    const o = opts || {};
    const s = String(texto == null ? "" : texto);
    const politica = o.politica || POLITICA_PADRAO;
    const negado = o.negado || (() => false);
    const out = [];

    for (const p of PADROES) {
      if (politica[p.tipo] === false) continue;
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(s)) !== null) {
        if (m[0].length === 0) {
          p.re.lastIndex++;
          continue;
        }
        if (!p.valida(m)) continue;
        if (negado(p.tipo, m[0])) continue;
        out.push({
          tipo: p.tipo,
          ini: m.index,
          fim: m.index + m[0].length,
          // O DV é o que separa "casou o formato" de "é este dado mesmo": só
          // quem passou por dígito verificador ganha 0,98. E-mail e OAB casam
          // formato e mais nada, então ficam em 0,9 e perdem para o NER num
          // empate de intervalo. (`p.valida` existe em TODOS os padrões, então
          // testá-lo não distinguia nada — era um marcador que não marcava.)
          score: p.dv ? 0.98 : 0.9,
          origem: "regex",
        });
      }
    }

    // CEP só com âncora de contexto na vizinhança.
    if (politica.CEP !== false) {
      RE_CEP.lastIndex = 0;
      let m;
      while ((m = RE_CEP.exec(s)) !== null) {
        const janela = s.slice(Math.max(0, m.index - 60), m.index + 60);
        if (!RE_ANCORA_CEP.test(janela)) continue;
        out.push({ tipo: "CEP", ini: m.index, fim: m.index + m[0].length, score: 0.85, origem: "regex" });
      }
    }

    // Gazetteer da ficha — literal, e o de maior confiança que existe aqui.
    for (const g of acharGazetteer(s, gazetteerDaFicha(o.ficha))) {
      if (politica[g.tipo] === false) continue;
      if (negado(g.tipo, s.slice(g.ini, g.fim))) continue;
      out.push(g);
    }

    return out;
  }

  // Funde o que veio do NER com o que veio daqui. O NER chega como
  // [{tipo, ini, fim, score}]; a política e a deny list valem para os dois.
  //
  // Uma detecção com DV válido PREVALECE sobre um rótulo genérico do NER no
  // mesmo intervalo — é a regra do guia (§34.3), e ela cai fora de graça:
  // o score do regex validado (0,98) vence o do NER na resolução por empate,
  // e o intervalo do regex costuma ser o mais longo.
  function fundir(doNer, doRegex, opts) {
    const o = opts || {};
    const politica = o.politica || POLITICA_PADRAO;
    const negado = o.negado || (() => false);
    const texto = o.texto || "";
    const out = [];
    for (const e of doNer || []) {
      if (politica[e.tipo] === false) continue;
      if (negado(e.tipo, texto.slice(e.ini, e.fim))) continue;
      out.push(Object.assign({ origem: "ner", score: 0.5 }, e));
    }
    for (const e of doRegex || []) out.push(e);
    return out;
  }

  const api = {
    normalizarComIndice: normalizarComIndice,
    cpfValido: cpfValido,
    cnpjValido: cnpjValido,
    pisValido: pisValido,
    detectar: detectar,
    fundir: fundir,
    gazetteerDaFicha: gazetteerDaFicha,
    acharGazetteer: acharGazetteer,
    prepararDeny: prepararDeny,
    conferirPolitica: conferirPolitica,
    POLITICA_PADRAO: POLITICA_PADRAO,
    _cnjValido: cnjValido,
    _PADROES: PADROES,
  };

  if (typeof globalThis !== "undefined") globalThis.ANON = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
