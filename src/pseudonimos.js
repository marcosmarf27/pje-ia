// src/pseudonimos.js — o espaço de numeração de UM processo.
//
// PORTE de electron/pseudonimos.ts do TecJustiça Sigilo, com uma simplificação
// que a extensão pode fazer e ele não podia: lá o backend Python numerava POR
// DOCUMENTO e descartava o mascarador a cada chamada, então o módulo existia
// para traduzir rótulo para rótulo sem nunca ler o texto original. Aqui o
// mascarador é nosso, então numeramos direto contra o mapa do processo — a
// indireção some, o resto da lição fica.
//
// A LIÇÃO, que é a razão de este arquivo existir: `[PESSOA_1]` tem de ser a
// MESMA pessoa em todas as peças. Numerando por peça, juntar a inicial e a
// procuração entrega ao modelo um texto em que `[PESSOA_1]` designa duas
// pessoas diferentes — e ele responde com confiança sobre quem assinou o quê,
// trocando as pessoas. Nas palavras do irmão: **"é um erro que não parece erro:
// a resposta sai bem escrita e plausível."**
//
// DUAS PASSADAS, e fundi-las é o bug clássico. A numeração segue a ordem de
// LEITURA (para [PESSOA_1] ser a primeira pessoa que aparece, que é o que faz o
// texto se ler); a substituição vai de TRÁS PARA FRENTE (para não deslocar os
// offsets das ocorrências ainda não aplicadas). O irmão registra que a primeira
// versão do prepararPergunta errou isso mesmo com o aviso escrito no código, e
// quem pegou foi o teste das entidades coladas.
//
// ESTE ARQUIVO É A CHAVE DE REIDENTIFICAÇÃO. O mapa desfaz a anonimização — é o
// artefato mais sensível que a extensão passa a produzir. Onde ele pode viver
// está em PRIVACY.md; aqui basta a regra: nunca em chrome.storage.sync (sai da
// máquina pela conta Google) e nunca dentro de um request.
(() => {
  "use strict";

  // ------------------------------------------------------------- normalização
  // FORMA COMPARÁVEL — e ela é a MESMA que a trava usa. Se as duas divergirem,
  // "JOÃO" no corpo escapa de "joão" na lista, e a defesa vira carimbo. Por
  // isso a função mora AQUI, num dono só, e `trava.js` a lê daqui em vez de
  // ter a sua (o irmão mantém uma cópia em cada arquivo, com um comentário
  // pedindo que não divirjam — pedir não é garantir).
  //
  // NFKD e não NFD: a compatibilidade decompõe a LIGADURA. Sem ela, um OCR que
  // devolve "ﬁlipe" (o ﬁ tipográfico) não casa "filipe" no gazetteer e o
  // nome passa. Note que isto é o oposto da regra do `paraCanonico` do
  // tokenizador, que usa NFC de propósito: lá o objetivo é PRESERVAR o texto do
  // documento; aqui é só comparar.
  //
  // Aqui SIM se remove acento e se baixa a caixa, ao contrário do
  // `tokenizador.js`: são trabalhos opostos. Lá o objetivo é reproduzir o que o
  // modelo viu no treino; aqui é decidir se dois trechos designam a mesma
  // pessoa, e "JOSÉ", "Jose" e "josé" designam.
  function normalizar(texto) {
    return String(texto == null ? "" : texto)
      .normalize("NFKD")
      .replace(/\p{Mn}/gu, "")
      .toLowerCase()
      .replace(/\s+/gu, " ");
  }

  // ------------------------------------------------------------------ rótulos
  // O tipo que o detector devolve é técnico; o rótulo que vai ao modelo é lido
  // por ele e pelo usuário. PESSOA e ORGANIZACAO já vêm do id2label do modelo;
  // os demais vêm dos detectores determinísticos.
  const ROTULO = {
    PESSOA: "PESSOA",
    ORGANIZACAO: "ORGANIZACAO",
    LOCAL: "LOCAL",
    CPF: "CPF",
    CNPJ: "CNPJ",
    RG: "RG",
    OAB: "OAB",
    CNJ: "PROCESSO",
    EMAIL: "EMAIL",
    TELEFONE: "TELEFONE",
    CEP: "CEP",
    NIT: "NIT",
    CONTA: "CONTA",
  };

  function rotuloDe(tipo) {
    const t = String(tipo || "").toUpperCase();
    return ROTULO[t] || t.replace(/[^A-Z0-9]+/g, "") || "DADO";
  }

  // Casa `[PESSOA_1]`. O `+` no número existe porque um processo grande passa
  // de 9 pessoas com facilidade, e um `\d` sozinho pararia de casar no décimo.
  const RE_ROTULO = /\[([A-Z][A-Z0-9]*)_(\d+)\]/g;

  // ------------------------------------------------------------- MapaDeSessao
  // `processo` é a chave do caso (não o CNJ em claro — o CNJ é dado pessoal e é
  // uma das coisas que se mascara). Ele existe para a TRAVA do editor: restaurar
  // nomes com o mapa de outra conversa produz nomes trocados, que é exatamente
  // o defeito que este arquivo existe para impedir, com outro disfarce.
  function criarMapa(processo) {
    // tipo -> Map(valorNormalizado -> {n, valor})
    const porTipo = new Map();
    // "PESSOA_1" -> {tipo, valor}
    const porRotulo = new Map();
    // tipo -> próximo número livre, que é o MAIOR + 1 e nunca `tabela.size + 1`.
    //
    // A diferença só aparece quando a numeração tem LACUNA, e ela pode ter:
    // `hidratar` restaura o que está gravado, e um item pode ter sido apagado na
    // caixa de auditoria (ou o mapa ter vindo de uma versão que gravava outro
    // subconjunto). Num mapa restaurado {1, 3}, `size` é 2 e a próxima pessoa
    // nasceria como PESSOA_3 — o MESMO rótulo de quem já estava lá. Duas
    // pessoas sob um rótulo só é exatamente o defeito que este arquivo existe
    // para impedir, com outro disfarce.
    const proximo = new Map();

    function anotar(rot, chave, n, valor) {
      let tabela = porTipo.get(rot);
      if (!tabela) {
        tabela = new Map();
        porTipo.set(rot, tabela);
      }
      // O VALOR guardado é o PRIMEIRO que apareceu, em caixa original — é ele
      // que a reidentificação devolve. Guardar o normalizado devolveria
      // "joao da silva" para o PJe.
      const reg = { n: n, valor: String(valor) };
      tabela.set(chave, reg);
      porRotulo.set(rot + "_" + n, { tipo: rot, valor: reg.valor });
      if (n >= (proximo.get(rot) || 1)) proximo.set(rot, n + 1);
      return reg;
    }

    function rotular(tipo, valor) {
      const rot = rotuloDe(tipo);
      const chave = normalizar(valor).trim();
      if (!chave) return null;
      const tabela = porTipo.get(rot);
      const reg = (tabela && tabela.get(chave)) || anotar(rot, chave, proximo.get(rot) || 1, valor);
      return "[" + rot + "_" + reg.n + "]";
    }

    // Só `hidratar` chama: restaura o número EXATO que foi gravado, em vez de
    // atribuir um novo. Renumerar na volta faz o `[PESSOA_3]` de um texto JÁ
    // MASCARADO apontar para outra pessoa — e esse texto não pode ser
    // reescrito, ele já saiu. Medido antes da correção: um mapa {1, 3} voltava
    // como {1, 2}, `[PESSOA_3]` deixava de resolver e `[PESSOA_2]`, que nunca
    // existiu, passava a devolver o nome de quem era o 3.
    function restaurar(tipo, n, valor) {
      const rot = rotuloDe(tipo);
      const chave = normalizar(valor).trim();
      if (!chave) return null;
      // MESMO valor sob DOIS números (o arquivo traz {n:1,"JOSÉ"} e {n:4,"José"}):
      // vence o PRIMEIRO, e o segundo número deixa de resolver. Não acontece por
      // construção de `rotular` — só editando o JSON à mão —, e a alternativa
      // seria pior: dar dois rótulos ao mesmo valor faz o texto mascarado
      // sugerir duas pessoas onde há uma. Declarado aqui porque comportamento
      // em caso degenerado que ninguém escreveu é comportamento que alguém
      // descobre no pior momento.
      const tabela = porTipo.get(rot);
      if (tabela && tabela.has(chave)) return "[" + rot + "_" + tabela.get(chave).n + "]";
      // Número ausente ou inválido: cai na numeração normal em vez de descartar
      // o item — perder uma entrada do mapa é perder a chave de um nome.
      if (!Number.isInteger(n) || n < 1) return rotular(tipo, valor);
      anotar(rot, chave, n, valor);
      return "[" + rot + "_" + n + "]";
    }

    function paraValor(rotulo) {
      const r = porRotulo.get(String(rotulo).replace(/^\[|\]$/g, ""));
      return r ? r.valor : null;
    }

    // A lista que alimenta a TRAVA. Devolve o valor ORIGINAL de cada coisa
    // mascarada: é o que não pode aparecer no que sai.
    function proibidos() {
      const out = [];
      for (const [tipo, tabela] of porTipo) {
        for (const reg of tabela.values()) out.push({ tipo: tipo, valor: reg.valor });
      }
      return out;
    }

    // A tabela que a caixa de auditoria mostra e que o editor usa para
    // restaurar. Ordenada por tipo e depois por número, para a leitura ser
    // estável entre aberturas.
    function tabela() {
      const out = [];
      for (const [tipo, tab] of porTipo) {
        for (const reg of tab.values()) {
          out.push({ rotulo: "[" + tipo + "_" + reg.n + "]", tipo: tipo, n: reg.n, valor: reg.valor });
        }
      }
      out.sort((a, b) => (a.tipo === b.tipo ? a.n - b.n : a.tipo < b.tipo ? -1 : 1));
      return out;
    }

    function quantos() {
      let n = 0;
      for (const tab of porTipo.values()) n += tab.size;
      return n;
    }

    return {
      processo: processo || null,
      rotular: rotular,
      restaurar: restaurar,
      paraValor: paraValor,
      proibidos: proibidos,
      tabela: tabela,
      quantos: quantos,
      serializar: () => ({ processo: processo || null, itens: tabela() }),
    };
  }

  // Reconstrói um mapa gravado. Preserva a numeração — reconstruir numerando de
  // novo daria outros rótulos para o mesmo texto já mascarado, que é o pior
  // desfecho possível para uma tabela de reidentificação.
  function hidratar(bruto) {
    const m = criarMapa(bruto && bruto.processo);
    if (!bruto || !Array.isArray(bruto.itens)) return m;
    // PRESERVA o número gravado — nunca renumera. A versão anterior reinseria
    // com `rotular` e apostava que a numeração fosse densa; a aposta vale para
    // um mapa que só `rotular` construiu, e deixa de valer no instante em que
    // um item é apagado. A ordenação ficou só para a leitura sair estável.
    const ordenados = bruto.itens.slice().sort((a, b) => a.n - b.n);
    for (const it of ordenados) m.restaurar(it.tipo, it.n, it.valor);
    return m;
  }

  // ------------------------------------------------------------------ mascarar
  // `ocorrencias` são {tipo, ini, fim} sobre `texto`. Devolve o texto mascarado.
  //
  // AS DUAS PASSADAS ESTÃO AQUI, e a ordem de cada uma é o ponto:
  //   1) numerar na ordem de LEITURA (ini crescente);
  //   2) substituir de TRÁS PARA FRENTE (ini decrescente).
  // Fundir as duas inverte os números de duas entidades na mesma frase.
  //
  // Sobreposições são resolvidas ANTES: fica o intervalo mais LONGO; empate,
  // o de maior score. Nunca "o primeiro" — o primeiro pode ser o truncado pela
  // fronteira de uma janela.
  function mascarar(texto, ocorrencias, mapa) {
    const s = String(texto == null ? "" : texto);
    // FALHA FECHADA em offset inválido. `slice` é permissivo: com {ini:6,fim:2}
    // ele devolve string vazia, com {ini:50,fim:60} num texto de 11 caracteres
    // ele devolve vazio também — e nos dois casos a máscara simplesmente NÃO
    // ACONTECE, sem erro. Offset inválido significa que o detector está
    // quebrado, e um anonimizador que segue em frente com o detector quebrado
    // entrega documento não anonimizado com cara de anonimizado.
    for (const o of ocorrencias || []) {
      if (!o) continue;
      const bom =
        Number.isInteger(o.ini) &&
        Number.isInteger(o.fim) &&
        o.ini >= 0 &&
        o.fim > o.ini &&
        o.fim <= s.length;
      if (!bom) {
        // A mensagem carrega os NÚMEROS, nunca o trecho — mesma regra da trava.
        throw new Error(
          "ocorrência com intervalo inválido (" + o.ini + ", " + o.fim + ") num texto de " +
            s.length + " caracteres: a anonimização foi interrompida"
        );
      }
    }
    const oks = resolverSobreposicao(ocorrencias);

    // 1ª passada — ordem de leitura.
    const rotulos = new Map();
    for (const o of oks) {
      const r = mapa.rotular(o.tipo, s.slice(o.ini, o.fim));
      if (r) rotulos.set(o, r);
    }

    // 2ª passada — de trás para frente.
    let out = s;
    for (let i = oks.length - 1; i >= 0; i--) {
      const o = oks[i];
      const r = rotulos.get(o);
      if (!r) continue;
      out = out.slice(0, o.ini) + r + out.slice(o.fim);
    }
    return out;
  }

  // Mantém o conjunto máximo sem sobreposição, preferindo o intervalo mais
  // longo. Ordena por (ini, -tamanho) e varre uma vez.
  function resolverSobreposicao(ocorrencias) {
    const lista = (ocorrencias || [])
      .filter((o) => o && o.fim > o.ini)
      .slice()
      .sort((a, b) => (a.ini !== b.ini ? a.ini - b.ini : b.fim - a.fim));
    const out = [];
    for (const o of lista) {
      const ult = out[out.length - 1];
      if (!ult || o.ini >= ult.fim) {
        out.push(o);
        continue;
      }
      // Sobrepõe: o TIPO fica com o mais longo (empate, o de maior score), mas
      // o INTERVALO é a UNIÃO dos dois.
      //
      // A união não é preciosismo — sem ela a resolução DESCOBRE texto. Com
      // [0,10] e [6,20], trocar o primeiro pelo segundo deixa os caracteres 0..6
      // SEM MÁSCARA, em claro, num trecho que dois detectores já haviam
      // marcado. O sintoma é um nome pela metade no que sai, e o teste que só
      // olha "sobrou uma ocorrência" não vê.
      //
      // Sobre-mascarar é a direção segura aqui: o pior caso da união é um
      // rótulo cobrindo alguns caracteres a mais, visível na caixa de auditoria;
      // o pior caso de descobrir é dado pessoal saindo da máquina.
      const tamNovo = o.fim - o.ini;
      const tamUlt = ult.fim - ult.ini;
      const venceu =
        tamNovo > tamUlt || (tamNovo === tamUlt && (o.score || 0) > (ult.score || 0));
      const base = venceu ? o : ult;
      out[out.length - 1] = Object.assign({}, base, {
        ini: Math.min(o.ini, ult.ini),
        fim: Math.max(o.fim, ult.fim),
      });
    }
    return out;
  }

  // ------------------------------------------------------------ reidentificar
  // O caminho de volta: `[PESSOA_1]` vira "MARIA DA SILVA". É o botão
  // "Restaurar nomes reais" do editor de minutas.
  //
  // Rótulo que o mapa não conhece FICA COMO ESTÁ. Trocá-lo por vazio apagaria
  // texto do documento; trocá-lo por um palpite inventaria um nome numa peça
  // que vai ao PJe assinada. Quem chama conta os desconhecidos e avisa.
  function reidentificar(texto, mapa) {
    let trocados = 0;
    let desconhecidos = 0;
    const out = String(texto == null ? "" : texto).replace(RE_ROTULO, (inteiro, tipo, n) => {
      const v = mapa.paraValor(tipo + "_" + n);
      if (v == null) {
        desconhecidos++;
        return inteiro;
      }
      trocados++;
      return v;
    });
    return { texto: out, trocados: trocados, desconhecidos: desconhecidos };
  }

  // Pós-condição barata: o texto mascarado não pode conter nenhum dos valores
  // que acabaram de ser mascarados. É a mesma ideia da trava, no nível da peça
  // — medir o resultado em vez de confiar no processo. A trava do envio
  // continua existindo porque esta aqui não vê os outros doze canais.
  function conferir(mascarado, mapa) {
    const alvo = normalizar(mascarado);
    for (const p of mapa.proibidos()) {
      const agulha = normalizar(p.valor).trim();
      if (agulha.replace(/[^\p{L}\p{N}]/gu, "").length < 3) continue;
      if (alvo.includes(agulha)) return { ok: false, tipo: p.tipo };
    }
    return { ok: true };
  }

  const api = {
    normalizar: normalizar,
    rotuloDe: rotuloDe,
    criarMapa: criarMapa,
    hidratar: hidratar,
    mascarar: mascarar,
    reidentificar: reidentificar,
    conferir: conferir,
    ROTULO: ROTULO,
    RE_ROTULO: RE_ROTULO,
    _resolverSobreposicao: resolverSobreposicao,
  };

  // globalThis e nao `window`: o mesmo arquivo precisa valer no content script
  // (onde globalThis E o window), no documento offscreen, no Web Worker do NER
  // (onde e o self) e no node do teste. Tres contextos, um nome.
  if (typeof globalThis !== "undefined") globalThis.PSEUD = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
