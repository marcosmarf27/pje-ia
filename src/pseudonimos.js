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

    // A CHAVE de uma pessoa ou organização é CANÔNICA, não a string normalizada
    // crua. "BANCO BRADESCO", "Banco Bradesco S.A." e "BANCO BRADESCO S/A" são
    // a mesma parte; "MARIA JOSÉ DA SILVA" e "Maria Jose Silva" são a mesma
    // pessoa. Com uma chave por forma, cada uma ganhava um rótulo — e o modelo,
    // vendo [ORGANIZACAO_13], [_15], [_23] e [_36], concluía que eram QUATRO
    // requeridas e escrevia isso na resposta (aconteceu). Sufixo societário e
    // palavras de ligação saem da chave; o VALOR guardado continua sendo a
    // primeira forma vista, e as outras formas ficam em `formas` para a guarda
    // e o gazetteer conhecerem todas.
    const RE_SUFIXO_SOC = /\s+(s\s*\.?\s*a\.?|s\/a|ltda\.?|me|epp|eireli|cia\.?|companhia|s\s*\.?\s*s\.?)$/;
    const STOP = new Set(["de", "da", "do", "das", "dos", "e", "di", "del", "della", "von", "van"]);
    function chaveDe(rot, valor) {
      let c = normalizar(valor).trim();
      if (rot !== "PESSOA" && rot !== "ORGANIZACAO") return c;
      c = c.replace(/[.,;:()"'“”«»]/g, " ").replace(/\s+/g, " ").trim();
      if (rot === "ORGANIZACAO") {
        let antes;
        do {
          antes = c;
          c = c.replace(RE_SUFIXO_SOC, "").trim();
        } while (c !== antes && c.length);
      }
      const toks = c.split(" ").filter((t) => t && !STOP.has(t));
      return toks.join(" ");
    }

    // Uma pessoa citada só pelo sobrenome composto ("JOSÉ DA SILVA") depois do
    // nome completo ("MARIA JOSÉ DA SILVA") é a mesma pessoa — desde que só
    // UMA entrada do mapa contenha esse trecho. Dois tokens no mínimo dos dois
    // lados: um nome sozinho ("Maria") casa qualquer Maria e não decide nada.
    // Ambíguo (duas candidatas) vira rótulo novo: errar para o lado de
    // separar custa legibilidade; fundir duas pessoas custa a resposta.
    function procurarVariante(rot, chave) {
      if (rot !== "PESSOA" && rot !== "ORGANIZACAO") return null;
      const tabela = porTipo.get(rot);
      if (!tabela) return null;
      const toks = chave.split(" ");
      if (toks.length < 2) return null;
      const agulha = " " + chave + " ";
      let achado = null;
      let quantos = 0;
      for (const [k, reg] of tabela) {
        if (k.split(" ").length < 2) continue;
        const palheiro = " " + k + " ";
        if (palheiro.includes(agulha) || agulha.includes(palheiro)) {
          quantos++;
          achado = reg;
          if (quantos > 1) return null;
        }
      }
      return achado;
    }

    function anotar(rot, chave, n, valor) {
      let tabela = porTipo.get(rot);
      if (!tabela) {
        tabela = new Map();
        porTipo.set(rot, tabela);
      }
      // O VALOR guardado é o PRIMEIRO que apareceu, em caixa original — é ele
      // que a reidentificação devolve. Guardar o normalizado devolveria
      // "joao da silva" para o PJe.
      const reg = { n: n, valor: String(valor), liberado: false, formas: new Set([String(valor)]) };
      tabela.set(chave, reg);
      porRotulo.set(rot + "_" + n, { tipo: rot, valor: reg.valor, reg: reg });
      if (n >= (proximo.get(rot) || 1)) proximo.set(rot, n + 1);
      return reg;
    }

    function rotular(tipo, valor) {
      const rot = rotuloDe(tipo);
      const chave = chaveDe(rot, valor);
      if (!chave) return null;
      const tabela = porTipo.get(rot);
      let reg = tabela && tabela.get(chave);
      if (!reg) reg = procurarVariante(rot, chave);
      // LIBERADO sai em claro em QUALQUER forma. Sem esta linha, o NER achava
      // "Banco Bradesco S.A." na peça seguinte, a chave canônica caía no
      // registro liberado e o texto saía com um rótulo que a guarda já não
      // procura — uma forma em claro e outra mascarada, para a mesma parte.
      // `mascarar` pula a ocorrência cujo rótulo é null.
      if (reg && reg.liberado) return null;
      if (!reg) reg = anotar(rot, chave, proximo.get(rot) || 1, valor);
      else reg.formas.add(String(valor));
      return "[" + rot + "_" + reg.n + "]";
    }

    // Só `hidratar` chama: restaura o número EXATO que foi gravado, em vez de
    // atribuir um novo. Renumerar na volta faz o `[PESSOA_3]` de um texto JÁ
    // MASCARADO apontar para outra pessoa — e esse texto não pode ser
    // reescrito, ele já saiu. Medido antes da correção: um mapa {1, 3} voltava
    // como {1, 2}, `[PESSOA_3]` deixava de resolver e `[PESSOA_2]`, que nunca
    // existiu, passava a devolver o nome de quem era o 3.
    function restaurar(tipo, n, valor, liberado, formas) {
      const rot = rotuloDe(tipo);
      const chave = chaveDe(rot, valor);
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
      if (!Number.isInteger(n) || n < 1) {
        const rotNovo = rotular(tipo, valor);
        if (rotNovo && liberado) liberar(rotNovo);
        return rotNovo;
      }
      const reg = anotar(rot, chave, n, valor);
      if (liberado) reg.liberado = true;
      for (const f of Array.isArray(formas) ? formas : []) if (f) reg.formas.add(String(f));
      return "[" + rot + "_" + n + "]";
    }

    function paraValor(rotulo) {
      const r = porRotulo.get(String(rotulo).replace(/^\[|\]$/g, ""));
      return r ? r.valor : null;
    }

    // A lista que alimenta a TRAVA. Devolve o valor ORIGINAL de cada coisa
    // mascarada: é o que não pode aparecer no que sai.
    // Cada item leva também o RÓTULO ([PESSOA_1]). É por ele que a trava, ao
    // bloquear, consegue dizer QUAL valor apareceu sem escrever o valor no erro
    // — o rótulo não é o dado, e é o que permite ao content resolver
    // `paraValor(rotulo)` e oferecer ao usuário decidir se aquilo é sigiloso.
    // Só o que NÃO foi liberado: o liberado pode sair em claro por decisão do
    // usuário, então a guarda não o procura e o gazetteer do mapa não o mascara.
    // UMA entrada por FORMA vista: a guarda e o gazetteer procuram literais, e
    // "Banco Bradesco S.A." não é substring de "BANCO BRADESCO".
    function proibidos() {
      const out = [];
      for (const [tipo, tabela] of porTipo) {
        for (const reg of tabela.values()) {
          if (reg.liberado) continue;
          const rotulo = "[" + tipo + "_" + reg.n + "]";
          for (const f of reg.formas) out.push({ tipo: tipo, valor: f, rotulo: rotulo });
        }
      }
      return out;
    }

    // LIBERA um rótulo e devolve o valor que ele designa (ou null). É a saída
    // do "isto não é dado pessoal": o usuário decidiu que "Tribunal de Justiça
    // do Estado do Ceará" pode sair em claro.
    //
    // O item NÃO é apagado — é MARCADO. Uma minuta gerada antes da liberação
    // ainda carrega `[ORGANIZACAO_1]`, e o botão de restaurar nomes do editor
    // precisa continuar resolvendo esse rótulo (`paraValor`/`reidentificar`);
    // apagar o item deixaria a marca órfã num texto já produzido — a mesma
    // família do defeito "hidratar renumerava", mais branda. O que muda com a
    // marca: sai de `proibidos()` (a guarda deixa de procurá-lo), sai de
    // `quantos()` (a tarja conta o que está PROTEGIDO) e aparece na tabela da
    // auditoria como liberado. A numeração continua fechada: `rotular` usa
    // maior + 1, então o número nunca é reaproveitado por outra pessoa.
    function liberar(rotulo) {
      const chaveRot = String(rotulo || "").replace(/^\[|\]$/g, "");
      const r = porRotulo.get(chaveRot);
      if (!r) return null;
      r.reg.liberado = true;
      return r.valor;
    }

    // Todas as formas já vistas de um rótulo (a canônica inclusive). É o que
    // `liberarRotulo` põe no `negado`: liberar "BANCO BRADESCO" tem de liberar
    // "Banco Bradesco S.A." junto, senão a variante volta pelo detector.
    function formasDe(rotulo) {
      const r = porRotulo.get(String(rotulo || "").replace(/^\[|\]$/g, ""));
      return r ? [...r.reg.formas] : [];
    }

    // A tabela que a caixa de auditoria mostra e que o editor usa para
    // restaurar. Ordenada por tipo e depois por número, para a leitura ser
    // estável entre aberturas.
    function tabela() {
      const out = [];
      for (const [tipo, tab] of porTipo) {
        for (const reg of tab.values()) {
          out.push({
            rotulo: "[" + tipo + "_" + reg.n + "]",
            tipo: tipo,
            n: reg.n,
            valor: reg.valor,
            liberado: !!reg.liberado,
            formas: [...reg.formas].filter((f) => f !== reg.valor),
          });
        }
      }
      out.sort((a, b) => (a.tipo === b.tipo ? a.n - b.n : a.tipo < b.tipo ? -1 : 1));
      return out;
    }

    // Conta o que está PROTEGIDO: item liberado sai em claro e não conta.
    function quantos() {
      let n = 0;
      for (const tab of porTipo.values()) for (const reg of tab.values()) if (!reg.liberado) n++;
      return n;
    }

    return {
      processo: processo || null,
      rotular: rotular,
      restaurar: restaurar,
      paraValor: paraValor,
      proibidos: proibidos,
      liberar: liberar,
      formasDe: formasDe,
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
    for (const it of ordenados) m.restaurar(it.tipo, it.n, it.valor, !!it.liberado, it.formas);
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
  //
  // A busca exige FRONTEIRA DE PALAVRA dos dois lados — a MESMA regra da trava
  // (`verificarSaida`) e do gazetteer (`acharGazetteer`). Sem ela esta
  // conferência era mais dura que as outras duas: uma parte chamada "Ana"
  // fazia a peça inteira ser DESCARTADA por causa de uma "Fernanda" no texto,
  // e o usuário via "a anonimização desta peça não ficou completa" sobre um
  // texto que estava completo. Três verificadores, uma regra.
  function conferir(mascarado, mapa) {
    const alvo = normalizar(mascarado);
    for (const p of mapa.proibidos()) {
      const agulha = normalizar(p.valor).trim();
      if (agulha.replace(/[^\p{L}\p{N}]/gu, "").length < 3) continue;
      let de = alvo.indexOf(agulha);
      while (de !== -1) {
        const ate = de + agulha.length;
        if (!ehLetraOuDigito(alvo[de - 1]) && !ehLetraOuDigito(alvo[ate])) {
          return { ok: false, tipo: p.tipo, rotulo: p.rotulo };
        }
        de = alvo.indexOf(agulha, de + 1);
      }
    }
    return { ok: true };
  }

  function ehLetraOuDigito(c) {
    return c !== undefined && /[\p{L}\p{N}]/u.test(c);
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
