// src/trava.js — a última barreira antes da rede.
//
// PORTE de electron/trava.ts do TecJustiça Sigilo. O cabeçalho de lá diz o
// desenho inteiro e vale repetido:
//
//   "Todo o resto do desenho impede que dado pessoal chegue ao corpo da
//    requisição. Isto aqui não confia em nada disso. Recebe o corpo JÁ
//    SERIALIZADO, do jeito exato que sairia pelo fio, e procura os valores que
//    não podem estar lá. Se achar, ninguém envia. A diferença entre esta
//    verificação e as outras camadas é que ela MEDE O RESULTADO em vez de
//    garantir o processo."
//
// POR QUE ISSO IMPORTA MAIS AQUI DO QUE LÁ: o payload desta extensão tem TREZE
// canais que carregam PII — o conteúdo da peça, o `title` de cada bloco, o CNJ,
// a ficha (que manda os titulares de cada polo no system, em TODO turno), o
// inventário das não marcadas, as datas das peças, a linha do tempo (cujo
// `textoFinalExterno` traz nomes), o texto digitado, a tese da minuta, o
// customPrompt, a biblioteca de prompts, as peças-modelo (que são peças REAIS
// de outros processos) e os anexos. Filtrar treze canais é uma LISTA, e lista
// envelhece: o décimo quarto que alguém acrescentar em 2027 vaza em silêncio.
// Uma pós-condição sobre o corpo serializado não envelhece.
//
// UMA REGRA QUE NÃO PODE SER QUEBRADA: **a mensagem de erro nunca mostra o
// valor encontrado.** Uma defesa contra vazamento que escreve o dado vazado no
// log é um vazamento com outro nome. Reporta-se o TIPO e a posição aproximada.
//
// ONDE ISTO RODA, E POR QUE MUDOU. A primeira versão era um CARIMBO: quem
// enviasse chamaria `carimbar` e o envio exigiria a marca. O carimbo continua
// aqui (`estaCarimbado`) e continua testado, mas deixou de ser o mecanismo —
// porque ele dependia de CADA cliente de provedor lembrar de pedi-lo, e são
// quatro (`claude`, `gemini`, `openai`, `openrouter`). Quatro é uma lista, e o
// raciocínio que abre este arquivo vale contra ela também: o QUINTO cliente
// vaza em silêncio.
//
// Hoje quem chama é uma GUARDA NO `fetch` do worker (`instalarGuardaDeSaida`,
// em background.js), e ela é impossível de contornar de dentro dele: pega o
// chat, o `countTokens`, o `upload` e o cliente que ninguém escreveu ainda.
// O preço é que a guarda precisa saber DE QUAL PROCESSO é cada requisição —
// senão o turno normal de outra aba seria conferido contra a lista de um
// processo que não é o dele, e barrado. Daí o `CAB_CTX`: os clientes mandam a
// chave do caso num cabeçalho, a guarda a lê e a REMOVE antes do envio real.
// Requisição para host de provedor SEM o cabeçalho, com algum sigilo armado, é
// BLOQUEADA — a lista de clientes ainda pode envelhecer, mas agora ela
// envelhece para o lado da falha, nunca para o do vazamento.
(() => {
  "use strict";

  // Só quem está aqui dentro consegue pôr esta marca num objeto. É o
  // equivalente em JavaScript do tipo carimbado do irmão ("tornar a linha
  // errada impossível de escrever, em vez de pedir atenção a quem escreve"):
  // quem envia exige o carimbo, e o carimbo não se fabrica de fora.
  const CARIMBO = Symbol("trava.carimbo");

  // Abaixo disto não dá para verificar sem alarme falso constante. Um valor de
  // duas letras casa dentro de qualquer palavra e aparece sozinho em texto
  // normal o tempo todo.
  //
  // É um buraco, e vale dito em voz alta: um dado pessoal de um ou dois
  // caracteres não é pego por esta trava. Na prática não existe — nome, CPF,
  // CEP, OAB e telefone são todos bem maiores — mas a defesa é essa, e não outra.
  const MINIMO_VERIFICAVEL = 3;

  function ehLetraOuDigito(c) {
    return c !== undefined && /[\p{L}\p{N}]/u.test(c);
  }

  // O quanto de um valor conta para o mínimo: só letra e dígito. Um CPF
  // formatado tem 14 caracteres e 11 verificáveis; um "S.A." tem 4 e 2.
  function pesoVerificavel(valor) {
    return String(valor).replace(/[^\p{L}\p{N}]/gu, "").length;
  }

  // A normalização é a do `pseudonimos.js`, e ela tem UM dono de propósito: se
  // as duas divergirem, "JOÃO" no corpo escapa de "joão" na lista e a trava
  // vira carimbo. O irmão mantém uma cópia em cada arquivo com um comentário
  // pedindo que não divirjam — pedir não é garantir. Lida na CHAMADA, não no
  // carregamento, para não depender da ordem dos content scripts.
  function normalizador() {
    const p = typeof globalThis !== "undefined" ? globalThis.PSEUD : null;
    if (!p || typeof p.normalizar !== "function") {
      throw new Error(
        "trava: pseudonimos.js não está carregado — sem a normalização compartilhada " +
          "a verificação não vale, e passar em silêncio seria pior que falhar"
      );
    }
    return p.normalizar;
  }

  function VazamentoBloqueado(tipo, posicao) {
    const e = new Error(
      'um valor do tipo "' +
        tipo +
        '" apareceu no que seria enviado (posição ' +
        posicao +
        "); nada foi enviado"
    );
    e.name = "VazamentoBloqueadoError";
    e.tipo = tipo;
    e.posicao = posicao;
    e.vazamento = true;
    // EXPLICITO, e nao por `undefined` ser falsy: `executarTurno` re-tenta
    // 429/5xx e queda de rede, e re-tentar um bloqueio da trava e o mesmo
    // bloqueio com o custo do backoff -- o filtro e deterministico pelo
    // conteudo, entao a segunda tentativa daria exatamente igual.
    e.retryable = false;
    return e;
  }

  // As regiões do corpo que são texto CONSTANTE do próprio programa.
  //
  // Isto não é conveniência — é o que mantém a trava ligada. Basta o detector
  // rotular "Brasil", "Justiça" ou "Processo" como ORGANIZACAO ou LOCAL em
  // alguma peça (e ele rotula) para o valor entrar na lista de proibidos e a
  // trava o encontrar DENTRO DO NOSSO PRÓPRIO system prompt, que não veio do
  // usuário e não revela nada sobre ninguém. Foi exatamente o que aconteceu na
  // primeira conversa real do app irmão: bloqueio na posição 1066, num "Brasil"
  // escrito por ele mesmo.
  //
  // Isentar é seguro porque a região é definida pela ocorrência LITERAL de uma
  // constante do programa: nada que o usuário forneça cai dentro dela.
  function localizarIsentas(alvo, isentas, norm) {
    const trechos = [];
    for (const isenta of isentas || []) {
      const agulha = norm(isenta).trim();
      if (!agulha) continue;
      let de = alvo.indexOf(agulha);
      while (de !== -1) {
        trechos.push([de, de + agulha.length]);
        de = alvo.indexOf(agulha, de + agulha.length);
      }
    }
    return trechos;
  }

  function dentroDeAlguma(de, ate, trechos) {
    for (const t of trechos) if (de >= t[0] && ate <= t[1]) return true;
    return false;
  }

  // Recusa se algum valor proibido estiver no corpo.
  //
  // A busca exige FRONTEIRA DE PALAVRA dos dois lados. Sem isso, uma parte
  // chamada "Ana" bloquearia qualquer corpo que contivesse "Fernanda" — e uma
  // trava que dispara sempre é desligada na primeira semana.
  function verificarSaida(corpo, proibidos, isentas) {
    const norm = normalizador();
    const alvo = norm(corpo);
    const trechosIsentos = localizarIsentas(alvo, isentas, norm);

    for (const p of proibidos || []) {
      const agulha = norm(p && p.valor).trim();
      if (pesoVerificavel(agulha) < MINIMO_VERIFICAVEL) continue;

      let de = alvo.indexOf(agulha);
      while (de !== -1) {
        const ate = de + agulha.length;
        if (
          !ehLetraOuDigito(alvo[de - 1]) &&
          !ehLetraOuDigito(alvo[ate]) &&
          !dentroDeAlguma(de, ate, trechosIsentos)
        ) {
          throw VazamentoBloqueado(p.tipo || "desconhecido", de);
        }
        de = alvo.indexOf(agulha, de + 1);
      }
    }
  }

  // Recusa ESTRUTURAL, antes da textual. No modo sigiloso a peça viaja como
  // texto e o PDF não sai da máquina — então um bloco de arquivo, de base64 ou
  // de imagem no payload significa que o gancho a montante FALHOU. Melhor o
  // turno morrer com nome do que o arquivo sair.
  //
  // Ela é separada da verificação textual porque responde a outra pergunta:
  // "tem binário aqui?" não é "tem nome aqui?". Confundi-las faria um payload
  // sem nomes conhecidos passar com o PDF dentro.
  function recusarBinarios(payload) {
    const visto = { file: 0, base64: 0, imagem: 0 };
    (function anda(no) {
      if (!no || typeof no !== "object") return;
      if (Array.isArray(no)) {
        for (const x of no) anda(x);
        return;
      }
      if (no.type === "image") visto.imagem++;
      if (no.source && typeof no.source === "object") {
        if (no.source.type === "file") visto.file++;
        if (no.source.type === "base64") visto.base64++;
      }
      for (const k of Object.keys(no)) anda(no[k]);
    })(payload);
    if (visto.file || visto.base64 || visto.imagem) {
      const e = new Error(
        "o modo sigiloso monta o request só com texto mascarado, e este payload ainda " +
          "traz " +
          [
            visto.file ? visto.file + " referência(s) a arquivo já enviado" : "",
            visto.base64 ? visto.base64 + " bloco(s) em base64" : "",
            visto.imagem ? visto.imagem + " imagem(ns)" : "",
          ]
            .filter(Boolean)
            .join(", ") +
          "; nada foi enviado"
      );
      e.name = "BinarioNoSigiloError";
      e.vazamento = true;
      e.retryable = false;
      throw e;
    }
  }

  // Colhe TODA string do payload — valores e chaves —, recursivamente.
  //
  // POR QUE NÃO BASTA VARRER O JSON SERIALIZADO, que era o desenho da primeira
  // versão: `JSON.stringify` **escapa** quebra de linha, tabulação e aspas. No
  // corpo serializado, um nome partido por quebra de linha vira uma barra
  // invertida seguida da letra n — dois caracteres literais, e não espaço em
  // branco. A
  // `normalizar` colapsa espaço em branco, mas ali não há mais espaço nenhum, e
  // a agulha "elioneudo evaristo" não casa. Medido: dos quatro casos testados,
  // TRÊS passavam pela trava (quebra de linha, tabulação e aspas no nome).
  //
  // E o pior não é a existência do buraco, é COM QUEM ele é correlacionado: o
  // nome partido na quebra de linha é justamente o que o mascarador erra — é um
  // dos dois únicos escapes do gate de 819 páginas do TecJustiça Sigilo. A rede
  // de segurança falhava com a MESMA entrada que derruba a defesa principal,
  // que é o pior desenho possível para um backstop.
  //
  // Conferindo as strings DECODIFICADAS, o escape do JSON deixa de existir: a
  // quebra de linha volta a ser espaço em branco e a agulha casa.
  // Devolve {textos, chaves} SEPARADOS, e a separação não é organização: a
  // concatenação (abaixo) tem de ser só dos VALORES. Intercalando as chaves,
  // "Maria" e "Silva" em dois blocos vizinhos viram "c text Maria text Silva" —
  // e o nome partido, que é justamente o que a concatenação existe para pegar,
  // passa batido.
  function colherStrings(payload) {
    const textos = [];
    const chaves = [];
    const vistos = new Set();
    (function anda(no) {
      if (typeof no === "string") {
        textos.push(no);
        return;
      }
      if (!no || typeof no !== "object") return;
      if (vistos.has(no)) return; // ciclo: o payload não deveria ter, mas não travamos por isso
      vistos.add(no);
      if (Array.isArray(no)) {
        for (const x of no) anda(x);
        return;
      }
      for (const k of Object.keys(no)) {
        chaves.push(k);
        anda(no[k]);
      }
    })(payload);
    return { textos: textos, chaves: chaves };
  }

  // O cabeçalho de atribuição. Vai do cliente à guarda e NUNCA à API: a guarda
  // o remove antes do envio real. O nome tem prefixo próprio para não colidir
  // com nada que um provedor use.
  const CAB_CTX = "x-pje-ctx";

  // Confere TUDO e não devolve nada — é a forma que a guarda do `fetch` usa.
  // `carimbar` (abaixo) é ela mais o carimbo, preservado para os call sites e
  // os testes que já existiam.
  //
  // DUAS PASSADAS TEXTUAIS, e elas não são redundância boba:
  //  - as strings DECODIFICADAS pegam o valor que o escape do JSON esconderia;
  //  - o JSON CRU pega o que uma varredura de objeto possa não alcançar (um
  //    valor que não seja string, uma serialização customizada por `toJSON`).
  // Cada string é conferida SEPARADAMENTE, então um valor não casa por acidente
  // atravessando a fronteira entre dois campos.
  function verificar(payload, proibidos, opts) {
    const o = opts || {};
    recusarBinarios(payload);
    const { textos, chaves } = colherStrings(payload);
    for (const s of textos) verificarSaida(s, proibidos, o.isentas);
    for (const s of chaves) verificarSaida(s, proibidos, o.isentas);
    // TERCEIRA passada: a CONCATENAÇÃO das strings. Um valor proibido partido
    // entre dois campos vizinhos ("Maria" num bloco, "Silva" no seguinte) não é
    // substring de nenhum deles nem do JSON cru (o `","` fica no meio) — e a
    // API recebe as duas partes do mesmo jeito.
    verificarSaida(textos.join(" "), proibidos, o.isentas);
    const json = JSON.stringify(payload);
    verificarSaida(json, proibidos, o.isentas);
    return json;
  }

  // O ponto único de saída: confere as três coisas e carimba. Quem envia exige
  // o carimbo (`estaCarimbado`), então montar um objeto à mão e chamar a porta
  // direto deixa de funcionar.
  //
  // DUAS PASSADAS TEXTUAIS, e elas não são redundância boba:
  //  - as strings DECODIFICADAS pegam o valor que o escape do JSON esconderia;
  //  - o JSON CRU pega o que uma varredura de objeto possa não alcançar (um
  //    valor que não seja string, uma serialização customizada por `toJSON`).
  // Cada string é conferida SEPARADAMENTE, então um valor não casa por acidente
  // atravessando a fronteira entre dois campos.
  function carimbar(payload, proibidos, opts) {
    const json = verificar(payload, proibidos, opts);

    // O CARIMBO CARREGA O SNAPSHOT, NUNCA A REFERÊNCIA.
    //
    // A primeira versão devolvia `{payload}` — o MESMO objeto mutável que
    // acabara de ser verificado. Dava para carimbar um payload limpo, mutá-lo
    // depois e continuar com `estaCarimbado` verdadeiro; o corpo que sairia
    // pelo fio seria outro. Reatribuir `marcado.payload` produzia o mesmo
    // bypass. O cabeçalho deste arquivo cita o princípio — "tornar a linha
    // errada impossível de escrever, em vez de pedir atenção a quem escreve" —
    // e a implementação pedia atenção.
    //
    // Agora o que vale é `corpo`: a string exata que foi verificada. Quem envia
    // manda ESSA string, não uma nova serialização. `Object.freeze` fecha a
    // reatribuição.
    const marcado = { corpo: json, bytes: json.length };
    Object.defineProperty(marcado, CARIMBO, { value: true, enumerable: false });
    return Object.freeze(marcado);
  }

  function estaCarimbado(x) {
    return !!(x && x[CARIMBO] === true);
  }

  const api = {
    verificarSaida: verificarSaida,
    verificar: verificar,
    CAB_CTX: CAB_CTX,
    recusarBinarios: recusarBinarios,
    colherStrings: colherStrings,
    carimbar: carimbar,
    estaCarimbado: estaCarimbado,
    ehLetraOuDigito: ehLetraOuDigito,
    pesoVerificavel: pesoVerificavel,
    MINIMO_VERIFICAVEL: MINIMO_VERIFICAVEL,
  };

  if (typeof globalThis !== "undefined") globalThis.TRAVA = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
