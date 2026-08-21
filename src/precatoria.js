// PACOTE DE INSTRUÇÃO DE CARTA PRECATÓRIA — heurística PURA.
//
// Monta, para cada carta precatória EXPEDIDA no processo, o conjunto de peças
// que instrui o ato: a própria carta, a peça de ORIGEM da ação (denúncia,
// queixa ou petição inicial) e a DECISÃO que a fundamenta. É o que o servidor
// precisa enviar pelo malote digital, e é um conjunto definido por norma
// (CPC art. 260, II; CPP art. 354), não por julgamento — daí ser regra, e não
// um pedido ao modelo.
//
// Este arquivo é PURO como o `exportar.js`: não conhece DOM, `PJE`, `docsCache`
// nem o painel. Recebe os eventos já lidos (`PJE.lerEventos()`) e devolve os
// pacotes. É o que permite testá-lo fora do navegador com os dados reais
// coletados de processos de verdade.
//
// POR QUE O MOVIMENTO, E NÃO O TÍTULO DA PEÇA
// Medido no processo P1 (103 eventos, 113 peças):
//   por TÍTULO  (/carta precatória/) → 6 peças, 3 delas FALSAS
//   por MOVIMENTO (EXPEDIÇÃO DE …)  → 3 peças, todas certas
// As três falsas eram a precatória DEVOLVIDA, juntada de volta sob o movimento
// "DOCUMENTO" e partida em `Cartas Precatórias / 1`, `/ 2`, `/ 3`. Pelo título
// são indistinguíveis da expedida; pelo movimento somem sozinhas. O movimento é
// vocabulário CNJ — controlado —, enquanto o título costuma ser o nome do
// arquivo que alguém subiu.
(function () {
  "use strict";

  // Sem acentos e em minúsculas — as tabelas abaixo são todas escritas assim.
  function norm(s) {
    return (s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  }

  // EXPEDIÇÃO da carta. `expedicao|expedida|expedido` cobre as redações vistas
  // ("EXPEDIÇÃO DE CARTA PRECATÓRIA.", "MOV. [61] - EXPEDIÇÃO DE CARTA
  // PRECATÓRIA"). NÃO pode casar devolução/cumprimento: é justamente o que
  // separa a carta que vai do malote da que já voltou.
  const RE_MOV_PRECATORIA = /\bexpedi(?:cao|da|do|dos|das)\b[^|]{0,40}\bcarta[s]? precatoria/;
  // Devolvida/cumprida/juntada de volta — veto explícito, para o caso de um
  // tribunal redigir o movimento de devolução começando por "expedição".
  const RE_MOV_DEVOLVIDA = /\b(devolvid|cumprid|juntada da carta|baixa da carta|carta precatoria devolvida)/;
  // Fallback por TÍTULO, usado só quando o movimento não existe (timeline de
  // tribunal com layout diferente). Menos confiável — quem usa marca `frouxo`.
  const RE_TIT_PRECATORIA = /\bcarta[s]? precatoria/;
  const RE_TIT_DEVOLVIDA = /\bdevolvid|\bcumprid/;

  // PEÇA DE ORIGEM da ação, em ordem de preferência. Não classificamos o rito
  // em "criminal × cível" para escolher UMA regra: o processo real
  // processo P2 é uma QUEIXA-CRIME cuja peça inicial se chama
  // "Petição Inicial" — uma classificação binária mandaria procurar "Denúncia"
  // e não acharia nada. Tenta-se a lista inteira, e o rito só REORDENA os
  // candidatos. Assim o acerto não depende de a ficha do processo existir.
  const ORIGENS = [
    { chave: "denuncia", rotulo: "Denúncia", re: /\bdenuncia\b/, criminal: true },
    { chave: "queixa", rotulo: "Queixa-crime", re: /\bqueixa[- ]?crime\b/, criminal: true },
    { chave: "inicial", rotulo: "Petição inicial", re: /\bpeticao inicial\b/, criminal: false },
  ];
  // Duas armadilhas que só apareceram nos autos de verdade, e as duas eram
  // falso positivo GRAVE — a peça errada iria no malote sem ninguém notar:
  //
  // (a) `\binicial\b` solto: em processo migrado do SAJ, TODO título carrega o
  //     sufixo "| Pág. Inicial SAJ 177". A regra casaria a lista inteira e a
  //     "peça de origem" seria uma certidão qualquer. Daí só `peticao inicial`,
  //     que o sufixo não satisfaz. E o veto NÃO pode conter "pag. inicial": a
  //     própria denúncia se chama "Denúncia (Outras) (Denúncia | Pág. Inicial
  //     SAJ 1)" e seria descartada por ele.
  // (b) `\bqueixa\b` solto: no processo P2 existe "Petição (queixa fulano de
  //     tal para protocolar )" — um rascunho — que venceria a verdadeira
  //     "Petição Inicial". Só `queixa-crime` fechado.
  //
  // O veto que sobra cobre peças que FALAM da inicial sem serem a inicial: o
  // ato que a recebe ou rejeita é decisão, e o aditamento não é a origem.
  const RE_ORIGEM_VETO =
    /\brecebimento\b|\brecebida\b|\bdespacho inicial\b|\balegacoes iniciais\b|\bemenda\b|\baditamento\b|\bindeferimento\b|\brejeicao\b/;

  // DECISÃO / DESPACHO. Cobre o movimento e o título, e a cobertura do título
  // precisa incluir `interlocutoria`: em processo migrado do SAJ a peça se
  // chama "Interlocutória (Decisões Interlocutórias | Pág. Inicial SAJ 177)" —
  // uma regra com apenas `decisao|despacho|sentenca` não pega NENHUMA decisão
  // desses processos, que são exatamente os mais antigos e mais precatoriados.
  const RE_DECISAO = /\b(decisao|decisoes|decisorio|interlocutoria|despacho|sentenca|sentencas|homologa(?:cao|torio|do)?|recebimento da denuncia|proferid[ao])\b/;
  // Conclusão e intimação NÃO são o ato decisório. "CONCLUSOS PARA DESPACHO"
  // aparece imediatamente antes do despacho e casaria `despacho`; a certidão de
  // intimação da sentença casaria `sentenca`. Os dois são vetados, e a exigência
  // de a decisão TER peça anexada já barra a maior parte do resto.
  const RE_DECISAO_VETO = /\bconclus|\bintimac|\bcertidao de intimacao|\bpublicad|\bdisponibilizad|\bdecurso\b|\bcertificad/;

  const RE_CLASSE_CRIMINAL = /\bacao penal\b|\bpenal\b|\bcriminal\b|\bqueixa[- ]?crime\b|\binquerito\b|\bexecucao penal\b/;

  // "Este processo é criminal?" — usado só para REORDENAR os candidatos a peça
  // de origem. Erro aqui não perde a peça, só troca a ordem em que ela é
  // procurada; por isso o `null` (sem ficha) é um desfecho aceitável.
  function detectarRito(ficha) {
    if (!ficha || !ficha.campos) return null;
    for (const k of Object.keys(ficha.campos)) {
      if (!/classe|assunto/i.test(k)) continue;
      if (RE_CLASSE_CRIMINAL.test(norm(ficha.campos[k]))) return "criminal";
    }
    return "civel";
  }

  function textoEvento(ev) {
    return norm(ev.mov) + " \u0000 " + ev.pecas.map((p) => norm(p.titulo)).join(" \u0000 ");
  }

  // As cartas EXPEDIDAS, da mais recente para a mais antiga (a ordem em que a
  // timeline as entrega). Cada uma leva o índice do evento — é por ele que a
  // decisão anterior é localizada.
  function acharPrecatorias(eventos) {
    const porMov = [];
    for (let i = 0; i < eventos.length; i++) {
      const ev = eventos[i];
      const m = norm(ev.mov);
      if (!m || !RE_MOV_PRECATORIA.test(m) || RE_MOV_DEVOLVIDA.test(m)) continue;
      if (!ev.pecas.length) continue;
      porMov.push({ i, data: ev.data || null, pecas: ev.pecas.slice(), fonte: "movimento" });
    }
    if (porMov.length) return porMov;
    // Nenhuma pelo movimento: cai para o título, marcando a confiança menor.
    const porTit = [];
    for (let i = 0; i < eventos.length; i++) {
      const ev = eventos[i];
      const alvo = ev.pecas.filter(
        (p) => RE_TIT_PRECATORIA.test(norm(p.titulo)) && !RE_TIT_DEVOLVIDA.test(norm(p.titulo))
      );
      if (!alvo.length) continue;
      if (RE_MOV_DEVOLVIDA.test(norm(ev.mov))) continue;
      porTit.push({ i, data: ev.data || null, pecas: alvo, fonte: "titulo" });
    }
    return porTit;
  }

  // A peça de origem da ação. Varre do FIM para o começo (a timeline vem do mais
  // recente ao mais antigo, então o fim é o início do processo) — a inicial e a
  // denúncia são, por definição, as peças mais antigas, e começar por elas evita
  // casar uma petição do meio dos autos.
  function acharOrigem(eventos, rito) {
    const ordem = ORIGENS.slice().sort((a, b) => {
      const cr = rito === "criminal";
      return (cr ? b.criminal - a.criminal : a.criminal - b.criminal) || 0;
    });
    for (const cand of ordem) {
      for (let i = eventos.length - 1; i >= 0; i--) {
        const ev = eventos[i];
        for (const p of ev.pecas) {
          const t = norm(p.titulo);
          if (!cand.re.test(t) || RE_ORIGEM_VETO.test(t)) continue;
          return { i, data: ev.data || null, peca: p, tipo: cand.chave, rotulo: cand.rotulo };
        }
      }
    }
    return null;
  }

  // A decisão/despacho mais recente ANTERIOR à expedição desta carta — e não a
  // mais recente do processo. É ela que fundamenta o ato deprecado; quando a
  // precatória não é o último ato dos autos, as duas divergem, e mandar a última
  // do processo instruiria a carta com uma decisão que veio DEPOIS dela.
  //
  // "Anterior" é índice MAIOR: a timeline entrega do mais recente ao mais antigo.
  function decisaoAnterior(eventos, idxPrecatoria) {
    for (let i = idxPrecatoria + 1; i < eventos.length; i++) {
      const ev = eventos[i];
      if (!ev.pecas.length) continue; // decisão sem peça não pode ser baixada
      const m = norm(ev.mov);
      if (m && RE_DECISAO_VETO.test(m)) continue;
      const peca = ev.pecas.find((p) => {
        const t = norm(p.titulo);
        return RE_DECISAO.test(t) && !RE_DECISAO_VETO.test(t);
      });
      if (peca) return { i, data: ev.data || null, peca };
      // O movimento pode anunciar a decisão sem que o título da peça a nomeie
      // ("OUTRAS DECISÕES" → "Anexo de movimentação"). Vale, mas só quando o
      // evento tem uma peça só — com várias não há como saber qual é o ato.
      if (m && RE_DECISAO.test(m) && ev.pecas.length === 1) {
        return { i, data: ev.data || null, peca: ev.pecas[0], porMovimento: true };
      }
    }
    return null;
  }

  // Um pacote por carta. A peça de origem é a MESMA nas várias cartas e vai
  // repetida de propósito: cada pasta precisa sair completa do zip, porque cada
  // uma vira um envio de malote independente.
  function montarPacotes(eventos, opts) {
    const o = opts || {};
    const rito = o.rito || detectarRito(o.ficha);
    const origem = acharOrigem(eventos, rito);
    const cartas = acharPrecatorias(eventos);
    const pacotes = cartas.map((c, n) => {
      const dec = decisaoAnterior(eventos, c.i);
      const faltas = [];
      if (!origem) faltas.push(rito === "criminal" ? "denúncia" : "petição inicial");
      if (!dec) faltas.push("decisão anterior à expedição");
      return {
        n: n + 1,
        indice: c.i,
        data: c.data,
        fonte: c.fonte,
        carta: c.pecas,
        origem: origem ? origem.peca : null,
        origemRotulo: origem ? origem.rotulo : null,
        decisao: dec ? dec.peca : null,
        decisaoData: dec ? dec.data : null,
        decisaoPorMovimento: !!(dec && dec.porMovimento),
        faltas,
      };
    });
    const avisos = [];
    if (!cartas.length) avisos.push("nenhuma carta precatória expedida foi encontrada na lista de peças");
    else if (cartas[0].fonte === "titulo")
      avisos.push(
        "as cartas foram identificadas pelo TÍTULO da peça, não pelo movimento processual — " +
          "confira se alguma delas é uma precatória devolvida, e não expedida"
      );
    if (!origem && cartas.length)
      avisos.push(
        "a peça de origem da ação (denúncia, queixa ou petição inicial) não foi localizada — " +
          "confirme se a lista de peças está completa"
      );
    return { pacotes, avisos, rito, origem };
  }

  // Todos os ids de um pacote, na ordem em que devem entrar na pasta: a carta
  // primeiro (é o ato), depois a origem, depois a decisão.
  function idsDoPacote(p) {
    const ids = p.carta.map((x) => x.id);
    if (p.origem) ids.push(p.origem.id);
    if (p.decisao) ids.push(p.decisao.id);
    return [...new Set(ids)];
  }

  const api = {
    montarPacotes,
    detectarRito,
    acharPrecatorias,
    acharOrigem,
    decisaoAnterior,
    idsDoPacote,
    norm,
    textoEvento,
  };

  if (typeof window !== "undefined") window.PjePrecatoria = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
