// Memória de caso: o banco que faz a extensão lembrar de um processo entre
// sessões. Sem ele, fechar a aba joga fora o `docsCache` inteiro — e reabrir o
// mesmo processo custa de novo a fila serializada do PJe (~5,6 s por peça,
// dezenas de minutos num processo grande).
//
// POR QUE ISTO VIVE NO WORKER, e não no content script (é a decisão que sustenta
// o arquivo): content scripts rodam na ORIGEM DA PÁGINA. Um indexedDB.open() em
// content.js abriria o banco de `pje.tjce.jus.br` — os autos ficariam legíveis
// por qualquer script da própria página do tribunal e sumiriam quando o usuário
// limpasse os dados do site. Aqui o banco é da extensão (chrome-extension://) e
// o content script chega por RPC, como já faz para upload e countTokens.
//
// POR QUE IndexedDB, e não chrome.storage.local:
//  (a) COTA. O `chrome.storage.local` tem teto de 10 MB, e ele já hospeda a
//      configuração, as minutas (`minuta:*`) e os modelos de peça (`modelo:*`) —
//      estourar esse teto faz o `set` de uma minuta FALHAR. O IndexedDB segue a
//      cota normal do navegador por origem, que é uma fração do disco livre.
//      (A permissão `unlimitedStorage` existe e NÃO gera aviso de instalação,
//      mas também não é necessária: o teto de 20 casos de texto fica na casa
//      dos poucos MB. O que ela daria de útil é isenção de *eviction* — sem
//      ela o Chrome pode descartar o banco sob pressão de disco. Aceito: a
//      memória é comodidade, e perdê-la só devolve o comportamento antigo.)
//  (b) STRUCTURED CLONE. O histórico do Gemini guarda `{type:"x-gemini-item",
//      raw: step}` que precisa voltar byte a byte no reenvio; o IDB preserva o
//      que um round-trip por JSON deformaria.
//  (c) ESCRITA GRANULAR por peça — as peças são gravadas UMA A UMA conforme
//      baixam, e num store único cada download reescreveria o caso inteiro.
//
// O que NÃO entra aqui: o base64 dos PDFs e das imagens. São os autos inteiros
// no disco, e o valor que se quer (não re-baixar) vem do `fileId` da Files API,
// não dos bytes — `montarBlocos` prefere o fileId e nem toca no b64 quando ele
// existe. Peça de texto (HTML/RTF) guarda o texto porque ELE é o conteúdo que
// vai ao modelo.

const DB_NOME = "pje-casos";
// v2 acrescentou o índice `porAtualizacao`; v3, o store `conversas`. O
// `onupgradeneeded` cria só o que falta, então subir a versão é seguro para
// quem já tem o banco de uma versão anterior.
const DB_VERSAO = 3;
const CASOS = "casos";
const PECAS = "pecas";
const CONVERSAS = "conversas";

// Poda: mesma política das minutas (7 dias/10) e dos mapas (5), calibrada para
// o volume maior de um caso. São tetos de HIGIENE, não de cota — o disco
// aguentaria muito mais, mas trecho de autos guardado além do uso é risco sem
// contrapartida.
export const MAX_CASOS = 20;
export const MAX_DIAS = 14;
// Conversas guardadas POR PROCESSO. Um processo trabalhado a sério rende umas
// poucas linhas de investigação ("e a prescrição?", "monte a linha do tempo");
// acima disso a lista deixa de ajudar a escolher e vira arquivo morto.
export const MAX_CONVERSAS = 12;

// Teto de sanidade do texto de UMA peça. Acima disso grava só os metadados e a
// peça re-baixa quando for usada. NÃO cortar aqui pelo teto de envio
// (`tetoTextoChars` em content.js): quem reporta o truncamento ao usuário é
// `pecasTruncadas`, que mede o texto REAL — gravar já cortado faria o aviso
// aparecer e sumir entre sessões. E o teto de envio agora acompanha a JANELA do
// modelo, então o mesmo texto gravado pode entrar inteiro depois de uma troca
// de modelo: guardar o corte de hoje congelaria a decisão de ontem.
const MAX_CHARS_PECA = 2_000_000;

// A conexão é memoizada, mas o memo é DESCARTÁVEL: o worker MV3 é morto a
// qualquer momento e leva a conexão junto, e um `versionchange` de outra aba
// fecharia o banco debaixo de uma operação em voo. Sem soltar o memo nesses
// eventos, toda chamada seguinte falharia com InvalidStateError até o worker
// reiniciar.
let dbPromise = null;

function abrir() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, DB_VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      const tx = req.transaction;
      const casos = db.objectStoreNames.contains(CASOS)
        ? tx.objectStore(CASOS)
        : db.createObjectStore(CASOS, { keyPath: "chave" });
      // Índice sobre `atualizadoEm`: é o que permite podar lendo só os
      // TIMESTAMPS, por `openKeyCursor`, sem desserializar as conversas. Sem
      // ele a poda fazia `getAll()` — trazia o histórico inteiro de todos os
      // casos para a memória do worker, a cada gravação.
      if (!casos.indexNames.contains("porAtualizacao")) {
        casos.createIndex("porAtualizacao", "atualizadoEm", { unique: false });
      }
      if (!db.objectStoreNames.contains(PECAS)) {
        // Chave composta: a mesma peça (mesmo id) pode existir em processos
        // diferentes, e o índice por caso é o que permite ler/apagar um
        // processo inteiro sem varrer o store.
        const st = db.createObjectStore(PECAS, { keyPath: ["chave", "id"] });
        st.createIndex("porCaso", "chave", { unique: false });
      }
      // Store próprio para as CONVERSAS, e não um array dentro do caso: a
      // conversa aberta é reescrita a cada turno, e guardá-las juntas faria
      // cada gravação reserializar TODAS as conversas do processo. É a mesma
      // razão que separou as peças.
      if (!db.objectStoreNames.contains(CONVERSAS)) {
        const st = db.createObjectStore(CONVERSAS, { keyPath: ["chave", "convId"] });
        st.createIndex("porCaso", "chave", { unique: false });

        // MIGRAÇÃO v2→v3. Na v2 a conversa vivia INLINE no caso (um caso, uma
        // conversa). Quem já usou aquela versão tem trabalho gravado ali, e uma
        // atualização não pode fazê-lo sumir — move-se para o store novo em vez
        // de abandonar os campos. `openCursor` aqui é aceitável: roda UMA vez,
        // na atualização, e não no caminho quente.
        const cur = casos.openCursor();
        cur.onsuccess = () => {
          const c = cur.result;
          if (!c) return;
          const v = c.value;
          if (Array.isArray(v.conversation) && v.conversation.length) {
            const convId = crypto.randomUUID();
            st.put({
              chave: v.chave,
              convId,
              titulo: tituloDaConversa(v.transcript),
              criadoEm: v.criadoEm || v.atualizadoEm || 0,
              atualizadoEm: v.atualizadoEm || 0,
              conversation: v.conversation,
              transcript: v.transcript || [],
              pecasNaConversa: v.pecasNaConversa || [],
              selecao: v.selecao || [],
              custoConversaUsd: v.custoConversaUsd || 0,
              conversaProvider: v.conversaProvider || null,
              buscaNaConversa: !!v.buscaNaConversa,
              ultimoTotalExato: v.ultimoTotalExato || 0,
            });
            v.convAtual = convId;
          }
          // Os campos inline saem do caso: deixá-los seria uma segunda fonte de
          // verdade para o mesmo dado, e a próxima leitura não saberia qual vale.
          for (const campo of CAMPOS_DE_SESSAO) delete v[campo];
          c.update(v);
          c.continue();
        };
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => {
        dbPromise = null;
      };
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error || new Error("não foi possível abrir a memória de casos"));
    };
  });
  // Rejeição também solta o memo: sem isto, uma falha transitória na abertura
  // (disco cheio, perfil recém-criado) ficaria memoizada para sempre.
  return dbPromise.catch((e) => {
    dbPromise = null;
    throw e;
  });
}

// Envelopa uma transação numa promessa. O `oncomplete` é o único sinal de que a
// escrita foi ao disco — resolver no `onsuccess` do request devolveria controle
// antes de a transação fechar, e um erro posterior (quota) se perderia.
function transacao(db, stores, modo, fn) {
  return new Promise((resolve, reject) => {
    let saida;
    const tx = db.transaction(stores, modo);
    tx.oncomplete = () => resolve(saida);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("transação abortada"));
    try {
      saida = fn(tx);
    } catch (e) {
      try {
        tx.abort();
      } catch {
        /* já abortada */
      }
      reject(e);
    }
  });
}

function pedir(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Título de uma conversa: a PRIMEIRA pergunta do usuário, encurtada. É o que
// ele reconhece na lista — "e a prescrição?" diz mais do que qualquer data. Sem
// pergunta nenhuma (conversa só com minuta/mapa), cai num rótulo neutro que o
// chamador substitui se souber mais.
export function tituloDaConversa(transcript) {
  const t = (transcript || []).find((e) => e && e.role === "user" && e.text);
  if (!t) return "Conversa sem pergunta";
  const txt = String(t.text).replace(/\s+/g, " ").trim();
  return txt.length > 70 ? txt.slice(0, 70).replace(/\s\S*$/, "") + "…" : txt;
}

// ---------------------------------------------------------------- leitura

// Lê o caso e TODAS as suas peças de uma vez: a hidratação precisa dos dois
// juntos e duas viagens de RPC dobrariam a latência do boot sem ganho nenhum.
export async function lerCaso(chave) {
  if (!chave) return null;
  const db = await abrir();
  const tx = db.transaction([CASOS, PECAS, CONVERSAS], "readonly");
  const caso = await pedir(tx.objectStore(CASOS).get(chave));
  if (!caso) return null;
  const pecas = await pedir(tx.objectStore(PECAS).index("porCaso").getAll(chave));
  const todas = (await pedir(tx.objectStore(CONVERSAS).index("porCaso").getAll(chave))) || [];
  todas.sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0));
  // A conversa ATUAL vem inteira; das outras vem só o resumo que a lista mostra.
  // Carregar o histórico completo de 12 conversas para desenhar 12 linhas seria
  // desperdício no worker, que é o processo que o Chrome mata primeiro.
  const atual =
    todas.find((c) => c.convId === caso.convAtual) || todas[0] || null;
  return {
    ...caso,
    pecas: pecas || [],
    conversa: atual,
    conversas: todas.map((c) => ({
      convId: c.convId,
      titulo: c.titulo || tituloDaConversa(c.transcript),
      criadoEm: c.criadoEm || 0,
      atualizadoEm: c.atualizadoEm || 0,
      mensagens: (c.transcript || []).length,
      atual: !!atual && c.convId === atual.convId,
    })),
  };
}

// Uma conversa inteira, para quando o usuário troca de conversa na lista.
export async function lerConversa(chave, convId) {
  if (!chave || !convId) return null;
  const db = await abrir();
  const tx = db.transaction([CONVERSAS], "readonly");
  return (await pedir(tx.objectStore(CONVERSAS).get([chave, convId]))) || null;
}

// Lista os casos SEM as peças e SEM a conversa — é o que a tela de gestão
// mostra. Carregar o conteúdo de 20 casos para desenhar 20 linhas seria
// desperdício de memória no worker, que é justamente o processo que o Chrome
// mata primeiro.
export async function listarCasos() {
  const db = await abrir();
  const tx = db.transaction([CASOS, PECAS], "readonly");
  const casos = (await pedir(tx.objectStore(CASOS).getAll())) || [];
  const st = tx.objectStore(PECAS).index("porCaso");
  const out = [];
  for (const c of casos) {
    out.push({
      chave: c.chave,
      cnj: c.cnj || null,
      host: c.host || null,
      grau: c.grau || null,
      criadoEm: c.criadoEm || 0,
      atualizadoEm: c.atualizadoEm || 0,
      mensagens: Array.isArray(c.transcript) ? c.transcript.length : 0,
      pecas: await pedir(st.count(IDBKeyRange.only(c.chave))),
    });
  }
  out.sort((a, b) => b.atualizadoEm - a.atualizadoEm);
  return out;
}

// ---------------------------------------------------------------- escrita

// Grava o caso. `patch` é MESCLADO sobre o que já existe: o content script salva
// ora a conversa, ora só a seleção, ora só a grid, e um put cru apagaria os
// campos ausentes daquela chamada.
// Campos que ANTES viviam no caso (v2, uma conversa por processo) e hoje vivem
// no store `conversas`. A lista só sobrevive para a migração v2→v3 poder
// limpá-los do registro antigo — deixá-los seria uma segunda fonte de verdade
// para o mesmo dado.
const CAMPOS_DE_SESSAO = [
  "conversation", "transcript", "selecao", "custoConversaUsd",
  "conversaProvider", "buscaNaConversa", "ultimoTotalExato",
];

// O caso guarda só o que é do PROCESSO: ficha, grid e qual conversa está
// aberta. O que é de uma sessão de trabalho mora em `conversas`.
// `baseSigilo` é o `sigilo.rev` que esta aba leu. Quando vem definido e a
// revisão gravada mudou desde então, o campo `sigilo` do patch é DESCARTADO e a
// resposta traz `conflitoSigilo` mais o que está no disco — o chamador funde e
// tenta de novo. É compare-and-swap, e não merge aqui dentro, por um motivo
// que não é de gosto: a fusão depende da CHAVE CANÔNICA de um nome
// ("BANCO BRADESCO" e "Banco Bradesco S.A." são a mesma parte), e essa regra
// vive em `pseudonimos.js`, que é content script. Duplicá-la no worker criaria
// duas definições de identidade para divergirem — e o preço de divergir ali é
// uma pessoa com dois rótulos, ou dois rótulos com uma pessoa.
//
// A atomicidade vem da transação do IndexedDB, que é serializável, e o worker
// MV3 é ÚNICO para toda a extensão: duas abas do mesmo processo passam pela
// mesma fila. É isso que fecha a janela que o `hidratar`-só-no-boot deixava
// aberta a sessão inteira.
export async function salvarCaso(chave, patch, baseSigilo) {
  if (!chave) return null;
  const db = await abrir();
  const agora = Date.now();
  let carimbo = agora;
  let criado = false;
  let conflitoSigilo = false;
  let sigiloAtual = null;
  await transacao(db, [CASOS], "readwrite", (tx) => {
    const st = tx.objectStore(CASOS);
    const req = st.get(chave);
    req.onsuccess = () => {
      criado = !req.result;
      const antes = req.result || { chave, criadoEm: agora };
      let aplicar = patch;
      if (patch && patch.sigilo && baseSigilo !== undefined && baseSigilo !== null) {
        const revAtual = (antes.sigilo && antes.sigilo.rev) || 0;
        if (revAtual !== baseSigilo) {
          // Outra aba gravou entre a leitura desta e agora. O resto do patch
          // (peças, ficha) é ADITIVO e passa: perder o download de uma peça por
          // causa de um conflito de mapa seria trocar um problema por outro.
          conflitoSigilo = true;
          sigiloAtual = antes.sigilo || null;
          aplicar = { ...patch };
          delete aplicar.sigilo;
        }
      }
      // Carimbo ESTRITAMENTE monotônico, e não `Date.now()` cru: duas gravações
      // dentro do mesmo milissegundo deixariam `atualizadoEm` igual à base que
      // a outra aba tem em mãos, e a detecção de conflito passaria batida.
      carimbo = Math.max(agora, (antes.atualizadoEm || 0) + 1);
      st.put({ ...antes, ...aplicar, chave, atualizadoEm: carimbo });
    };
    return agora;
  });
  // A poda anda de carona na escrita, mas SÓ quando um caso NOVO nasce — e não
  // a cada gravação. Gravação há a cada 1,2 s de debounce enquanto se trabalha;
  // caso novo há uma vez por processo. Como só a criação faz o número de casos
  // crescer, é o único momento em que o teto de QUANTIDADE pode ser cruzado; a
  // poda por IDADE é coberta por aqui e pelo `onInstalled`. Falha dela nunca
  // derruba a gravação: o caso já está salvo.
  if (criado) {
    try {
      await podarCasos();
    } catch {
      /* faxina é best-effort */
    }
  }
  return { atualizadoEm: carimbo, conflitoSigilo, sigilo: sigiloAtual };
}

// Grava (ou cria) UMA conversa. `convId` novo nasce aqui — quem chama não
// precisa inventar id. Mescla, como o caso: o content script salva ora a
// conversa, ora só a seleção daquela conversa.
// `base` é o `atualizadoEm` que esta aba leu ao abrir a conversa. Se o registro
// mudou desde então, é outra aba trabalhando na MESMA conversa — e a gravação
// vai para uma conversa NOVA em vez de sobrescrever.
//
// Ramificar é melhor do que qualquer alternativa aqui: merge de conversas é
// impossível (são sequências de turnos com raciocínio assinado, e intercalá-las
// produz um histórico que nenhuma API aceita), e descartar o trabalho de uma das
// abas é justamente o que a memória existe para evitar. Com múltiplas conversas
// o conflito deixou de ser perda e virou um ramo — que aparece na lista.
export async function salvarConversa(chave, convId, patch, base) {
  if (!chave) return null;
  const db = await abrir();
  const agora = Date.now();
  let id = convId || crypto.randomUUID();
  let criada = false;
  let ramificou = false;
  await transacao(db, [CONVERSAS, CASOS], "readwrite", (tx) => {
    const st = tx.objectStore(CONVERSAS);
    const req = st.get([chave, id]);
    req.onsuccess = () => {
      if (base && req.result && (req.result.atualizadoEm || 0) > base) {
        ramificou = true;
        id = crypto.randomUUID();
      }
      const antes = ramificou ? { chave, convId: id, criadoEm: agora } : req.result || { chave, convId: id, criadoEm: agora };
      criada = ramificou || !req.result;
      const novo = { ...antes, ...patch, chave, convId: id, atualizadoEm: agora };
      // O título é derivado, não digitado: recalculado a cada gravação porque a
      // primeira pergunta só existe depois do primeiro turno — e uma conversa
      // que nasceu "sem pergunta" precisa ganhar nome quando ela chega.
      novo.titulo = tituloDaConversa(novo.transcript);
      st.put(novo);
    };
    // O caso aponta para a conversa aberta, e é isso que a próxima sessão
    // retoma. Vai na MESMA transação: um `convAtual` apontando para uma
    // conversa que não chegou a ser gravada deixaria o processo sem conversa.
    const stc = tx.objectStore(CASOS);
    const rc = stc.get(chave);
    rc.onsuccess = () => {
      const c = rc.result || { chave, criadoEm: agora };
      stc.put({ ...c, chave, convAtual: id, atualizadoEm: agora });
    };
  });
  if (criada) {
    try {
      await podarConversas(chave);
    } catch {
      /* faxina é best-effort */
    }
  }
  return { convId: id, atualizadoEm: agora, ramificou };
}

export async function apagarConversa(chave, convId) {
  if (!chave || !convId) return 0;
  const db = await abrir();
  await transacao(db, [CONVERSAS], "readwrite", (tx) => {
    tx.objectStore(CONVERSAS).delete([chave, convId]);
  });
  return 1;
}

// Mantém as MAX_CONVERSAS mais recentes de um processo. Usa `openKeyCursor` no
// índice pelo mesmo motivo da poda de casos — aqui o valor seria o histórico
// inteiro de cada conversa.
export async function podarConversas(chave, max = MAX_CONVERSAS) {
  const db = await abrir();
  const pares = await new Promise((resolve, reject) => {
    const tx = db.transaction([CONVERSAS], "readonly");
    const req = tx.objectStore(CONVERSAS).index("porCaso").openCursor(IDBKeyRange.only(chave));
    const out = [];
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return resolve(out);
      out.push({ convId: cur.value.convId, quando: cur.value.atualizadoEm || 0 });
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
  if (pares.length <= max) return 0;
  pares.sort((a, b) => b.quando - a.quando);
  const apagar = pares.slice(max);
  for (const p of apagar) await apagarConversa(chave, p.convId);
  return apagar.length;
}

// Grava um lote de peças. Cada peça é MESCLADA sobre a anterior pelo mesmo
// motivo do caso: o download traz `kind`/`pages`/`text` e o upload, minutos
// depois, traz só o `fileId` — um put cru no segundo apagaria o primeiro e a
// peça voltaria a precisar de download.
//
// `size` funciona como assinatura do conteúdo: quando a peça é substituída no
// PJe com o mesmo id, o tamanho muda e o fileId gravado deixa de valer (a
// cacheKey do upload também inclui o tamanho, então os dois lados concordam).
export async function salvarPecas(chave, lista) {
  if (!chave || !Array.isArray(lista) || !lista.length) return 0;
  const db = await abrir();
  return transacao(db, [PECAS], "readwrite", (tx) => {
    const st = tx.objectStore(PECAS);
    for (const p of lista) {
      if (!p || p.id == null) continue;
      const id = String(p.id);
      const req = st.get([chave, id]);
      req.onsuccess = () => {
        const antes = req.result || {};
        const novo = { ...antes, ...p, chave, id };
        // O b64 NUNCA vai ao disco, mesmo que o chamador o inclua por descuido:
        // esta é a última barreira e ela é barata.
        delete novo.b64;
        delete novo.semBytes;
        if (typeof novo.text === "string") {
          if (novo.text.length > MAX_CHARS_PECA) delete novo.text;
        }
        if (antes.size != null && p.size != null && antes.size !== p.size) {
          // conteúdo trocou no PJe: o upload antigo aponta para outro arquivo
          delete novo.fileId;
          delete novo.fileProvider;
          delete novo.fileExp;
          delete novo.chaveHash;
        }
        st.put(novo);
      };
    }
    return lista.length;
  });
}

// ---------------------------------------------------------------- remoção

export async function esquecerCaso(chave) {
  if (!chave) return 0;
  const db = await abrir();
  await transacao(db, [CASOS, PECAS, CONVERSAS], "readwrite", (tx) => {
    tx.objectStore(CASOS).delete(chave);
    // As conversas saem junto: esquecer o processo tem de ser completo, e um
    // registro órfão aqui ficaria invisível e ocuparia disco para sempre.
    const rc = tx.objectStore(CONVERSAS).index("porCaso").openKeyCursor(IDBKeyRange.only(chave));
    rc.onsuccess = () => {
      const cur = rc.result;
      if (!cur) return;
      tx.objectStore(CONVERSAS).delete(cur.primaryKey);
      cur.continue();
    };
    // Apagar por CURSOR no índice, não por range no keyPath: a chave composta é
    // ["chave", id] e um IDBKeyRange sobre ela dependeria da ordem lexicográfica
    // dos ids, que não é garantida para o que queremos.
    const req = tx.objectStore(PECAS).index("porCaso").openKeyCursor(IDBKeyRange.only(chave));
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return;
      tx.objectStore(PECAS).delete(cur.primaryKey);
      cur.continue();
    };
  });
  return 1;
}

// Devolve QUANTOS casos foram apagados — quem chama mostra isso ao usuário, e
// um `true` ali viraria "1 processo apagado" em qualquer situação.
export async function esquecerTudo() {
  const db = await abrir();
  const n = await new Promise((resolve, reject) => {
    const tx = db.transaction([CASOS], "readonly");
    const req = tx.objectStore(CASOS).count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => reject(req.error);
  });
  await transacao(db, [CASOS, PECAS, CONVERSAS], "readwrite", (tx) => {
    tx.objectStore(CASOS).clear();
    tx.objectStore(PECAS).clear();
    tx.objectStore(CONVERSAS).clear();
  });
  return n;
}

// Poda dupla, como a das minutas: por IDADE (o que não se usa há duas semanas
// não é mais o processo do momento) e por QUANTIDADE (teto duro, para uma
// semana intensa não virar um arquivo permanente dos autos de todo mundo).
export async function podarCasos(max = MAX_CASOS, dias = MAX_DIAS) {
  const db = await abrir();
  // `openKeyCursor` num ÍNDICE devolve só a chave indexada (`atualizadoEm`) e a
  // primaryKey (`chave`) — o VALOR do registro nunca é lido. É a diferença
  // entre percorrer 20 timestamps e desserializar 20 conversas inteiras, e a
  // poda roda a cada caso novo. O cursor vem em ordem crescente de
  // `atualizadoEm`, então os primeiros são os mais antigos.
  const pares = await new Promise((resolve, reject) => {
    const tx = db.transaction([CASOS], "readonly");
    const req = tx.objectStore(CASOS).index("porAtualizacao").openKeyCursor();
    const out = [];
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return resolve(out);
      out.push({ chave: cur.primaryKey, quando: cur.key || 0 });
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
  const limite = Date.now() - dias * 24 * 60 * 60 * 1000;
  const vivos = pares.filter((p) => p.quando >= limite);
  const apagar = pares
    .filter((p) => p.quando < limite) // por IDADE
    .concat(vivos.slice(0, Math.max(0, vivos.length - max))) // por QUANTIDADE
    .map((p) => p.chave);
  for (const chave of apagar) await esquecerCaso(chave);
  return apagar.length;
}

// Emergência de cota. O `salvarCaso` que tomar QuotaExceededError chama isto e
// tenta UMA vez; se falhar de novo, quem chamou desliga a gravação na sessão e
// avisa. Nunca derrubar o turno por causa de faxina.
export async function podarAgressivo() {
  const db = await abrir();
  // Mesmo motivo do `podarCasos`, e aqui ele é ainda mais forte: isto roda
  // DEPOIS de um QuotaExceededError, ou seja, exatamente quando carregar as
  // conversas todas para a memória é a última coisa que se deveria fazer.
  const chaves = await new Promise((resolve, reject) => {
    const tx = db.transaction([CASOS], "readonly");
    const req = tx.objectStore(CASOS).index("porAtualizacao").openKeyCursor();
    const out = [];
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return resolve(out);
      out.push(cur.primaryKey); // ordem crescente: os mais antigos primeiro
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
  const apagar = chaves.slice(0, Math.floor(chaves.length / 2));
  for (const chave of apagar) await esquecerCaso(chave);
  return apagar.length;
}
