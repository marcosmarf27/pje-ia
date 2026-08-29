const apiKeyEl = document.getElementById("apiKey");
const geminiKeyEl = document.getElementById("geminiApiKey");
const openaiKeyEl = document.getElementById("openaiApiKey");
const modelEl = document.getElementById("model");
const modeloMinutaEl = document.getElementById("modeloMinuta");
const effortEl = document.getElementById("effort");
const customEl = document.getElementById("customPrompt");
// Só existe na página de opções (o popup é o console rápido). Como todo
// elemento exclusivo de uma das duas telas, é acessado sempre sob `if (el)` —
// tocá-lo direto quebraria a outra página.
const memoriaEl = document.getElementById("memoriaCaso");
const limparMemBtn = document.getElementById("limparMemoria");
// Exclusivos da página de opções: no popup eles não existem, e ler `.textContent`
// de `null` quebraria a tela inteira. A regra vale para todo elemento que só
// existe numa das duas telas servidas por este mesmo arquivo.
const remedirOcrBtn = document.getElementById("remedirOcr");
const ocrStatus = document.getElementById("ocrStatus");
const memStatus = document.getElementById("memStatus");

// Apagar TODA a memória. Em dois cliques, como toda exclusão da extensão —
// nunca `confirm()` nativo. Diz QUANTOS processos foram apagados: "pronto"
// sozinho não distingue "apagou 12" de "não havia nada".
// Apaga a decisão de backend do OCR para que a próxima extração meça de novo.
// NÃO é exclusão em dois cliques como a memória de caso: aqui não se perde
// nada — o que se apaga é uma medição, e o pior caso de errar o clique é uma
// primeira página mais lenta na extração seguinte.
if (remedirOcrBtn) {
  remedirOcrBtn.addEventListener("click", () => {
    remedirOcrBtn.disabled = true;
    chrome.storage.local.get("ocrBackend", (o) => {
      void chrome.runtime.lastError;
      const antes = o && o.ocrBackend;
      chrome.storage.local.remove("ocrBackend", () => {
        void chrome.runtime.lastError;
        remedirOcrBtn.disabled = false;
        if (!ocrStatus) return;
        // Dizer o que estava valendo é o que torna o botão inteligível: sem
        // isso ninguém sabe se havia o que refazer, nem o que mudou.
        ocrStatus.textContent = antes
          ? "Estava usando " + nomeBackendOcr(antes) + ". A próxima extração vai medir de novo."
          : "Ainda não havia medição. A próxima extração vai medir.";
      });
    });
  });
}

function nomeBackendOcr(d) {
  const nome = d.escolha === "webgpu" ? "a placa de vídeo" : "o processador";
  const ms = d.ms && (d.escolha === "webgpu" ? d.ms.webgpu : d.ms.wasm);
  return nome + (ms ? " (" + (ms / 1000).toFixed(1) + " s por página na medição)" : "");
}

if (limparMemBtn) {
  let armado = false;
  limparMemBtn.addEventListener("click", () => {
    if (!armado) {
      armado = true;
      limparMemBtn.textContent = "Apagar tudo?";
      limparMemBtn.classList.add("btn-erro");
      if (memStatus) memStatus.textContent = "Isto não tem volta.";
      setTimeout(() => {
        if (!armado) return;
        armado = false;
        limparMemBtn.textContent = "Apagar a memória de todos os processos";
        limparMemBtn.classList.remove("btn-erro");
        if (memStatus) memStatus.textContent = "";
      }, 5000);
      return;
    }
    armado = false;
    limparMemBtn.disabled = true;
    limparMemBtn.textContent = "Apagando…";
    limparMemBtn.classList.remove("btn-erro");
    chrome.runtime.sendMessage({ type: "casoEsquecer", chave: null }, (r) => {
      void chrome.runtime.lastError;
      limparMemBtn.disabled = false;
      limparMemBtn.textContent = "Apagar a memória de todos os processos";
      if (!memStatus) return;
      const n = (r && r.n) || 0;
      memStatus.textContent = n
        ? n + " processo(s) apagados deste computador."
        : "Não havia nada guardado.";
      memStatus.className = "mem-status ok";
      setTimeout(() => {
        memStatus.textContent = "";
        memStatus.className = "mem-status";
      }, 6000);
    });
  });
}
const saveBtn = document.getElementById("save");
const saveStatus = document.getElementById("saveStatus");
const chip = document.getElementById("chip");
const chipText = document.getElementById("chipText");
const togglePw = document.getElementById("togglePw");
const togglePwG = document.getElementById("togglePwG");
const togglePwO = document.getElementById("togglePwO");
// Elementos só do layout novo — este script é COMPARTILHADO por popup.html e
// options.html, então tudo o que uma página tem e a outra não é opcional.
const kstateA = document.getElementById("kstateA");
const kstateG = document.getElementById("kstateG");
const kstateO = document.getElementById("kstateO");
const firstRun = document.getElementById("firstRun");
// Só existe no popup (a página de opções tem a caixa `.apoio` completa, sempre
// visível): como todo elemento exclusivo de uma das duas telas, é opcional.
const apoiarBox = document.getElementById("apoiarBox");
// O espelho do #firstRun: os passos aparecem SÓ enquanto não há chave salva, e o
// pedido de apoio SÓ depois que há. Quem ainda está configurando não usou a
// ferramenta — pedir antes de entregar valor é o pior momento possível.
function mostrarApoio(temChave) {
  if (apoiarBox) apoiarBox.hidden = !temChave;
}
const abrirOpcoes = document.getElementById("abrirOpcoes");
// Layout "provedor em primeiro plano"
const provCount = document.getElementById("provCount");
const testKey = document.getElementById("testKey");
const effortHint = document.getElementById("effortHint");
const perfilHint = document.getElementById("perfilHint");
const provs = [...document.querySelectorAll(".prov")];
const keySecs = [...document.querySelectorAll(".pc-sec[data-prov]")];
const personas = [...document.querySelectorAll(".persona")];

const PROVS = ["anthropic", "gemini", "openai"];
const NOME_PROVEDOR = { anthropic: "Anthropic", gemini: "Google", openai: "OpenAI" };
// Primeiro modelo de cada provedor = o recomendado. Clicar num cartão troca
// para ele; o provedor NÃO é gravado no storage — continua derivado do `model`.
const PADRAO = { anthropic: "claude-haiku-4-5", gemini: "gemini-3.7-flash", openai: "gpt-5.6-luna" };
// Modelo usado quando NADA foi salvo ainda. Precisa ser byte a byte o default
// do `getCfg` em background.js: sem `model` no storage o worker chama o
// GPT-5.6 Luna, e enquanto o <select> mostrava o PRIMEIRO <option> do HTML (o
// Haiku) a primeira instalação pedia a chave da Anthropic para uma extensão
// que ia falar com outro provedor, com o selo do painel contradizendo a tela
// de configuração. Não dá para importar a constante do worker (este script é
// clássico e aquele é ES module), então a duplicação é deliberada, anotada nos
// dois lados e coberta por teste. Defesa a mais: o Luna é também o PRIMEIRO
// <option> do <select> nas duas telas, então mesmo o fallback do navegador
// (quando `value` não casa nenhum id) cai no mesmo modelo que o worker usa.
const MODELO_PADRAO = "gpt-5.6-luna";

// Para QUE serve cada modelo. Espelho do campo `perfil` do MODEL_CAPS
// (background.js) — mesma duplicação deliberada do MODELO_PADRAO acima e pela
// mesma razão: este script é clássico e aquele é ES module. Coberta por teste
// que extrai as duas tabelas dos fontes e exige que batam.
// O eixo não é "modelo bom/ruim": analisar autos é dominado pelo INPUT
// (centenas de páginas entram, poucos milhares de tokens saem) e redigir é
// dominado pelo OUTPUT — por isso o mais barato para varrer costuma ser o mais
// fraco para escrever. Só `gpt-5.6-luna` e `gemini-3.7-flash` foram MEDIDOS em
// uso real; o resto é inferência do tier. É o dado mais perecível daqui.
const PERFIS = {
  "gpt-5.6-luna": "analise",
  "gpt-5.6-terra": "ambos",
  "gpt-5.6-sol": "ambos",
  "claude-haiku-4-5": "analise",
  "claude-sonnet-5": "ambos",
  "claude-opus-4-8": "ambos",
  "claude-fable-5": "redacao",
  "gemini-3.7-flash": "redacao",
  "gemini-3.6-flash": "redacao",
  "gemini-3.5-flash-lite": "analise",
};

// Qual modelo sugerir a quem escolheu um de perfil `analise`. Varre os
// <option> do MESMO provedor na ordem em que aparecem e pega o primeiro que
// serve para redigir — deliberadamente do mesmo provedor, porque mandar quem
// usa a OpenAI trocar para o Google é pedir outra conta e outra chave só para
// seguir um conselho. Sai do DOM, e não de uma tabela de preços duplicada
// aqui; o teste confere que a escolha bate com a do worker (`sugestaoRedacao`).
function sugestaoDeRedacao() {
  const atual = String(modelEl.value || "");
  if (PERFIS[atual] !== "analise") return null;
  const grupo = modelEl.selectedOptions && modelEl.selectedOptions[0]
    ? modelEl.selectedOptions[0].parentElement
    : null;
  if (!grupo) return null;
  for (const op of grupo.querySelectorAll("option")) {
    if (PERFIS[op.value] && PERFIS[op.value] !== "analise") {
      return op.textContent.split(" (")[0].trim();
    }
  }
  return null;
}

// O seletor "Modelo para minutas". Os <option> são CLONADOS do #model: manter
// uma segunda lista no HTML criaria mais um lugar para divergir dos ids reais
// (o mesmo motivo pelo qual o teste extrai tudo dos fontes).
//
// O primeiro item é o AUTOMÁTICO, e ele nomeia o modelo resolvido. Um item só
// escrito "Automático" obriga o usuário a adivinhar o que vai acontecer, que é
// justamente a dúvida que este campo existe para tirar.
function montarModeloMinuta() {
  if (!modeloMinutaEl) return;
  const escolhido = modeloMinutaEl.value;
  modeloMinutaEl.textContent = "";
  const auto = document.createElement("option");
  auto.value = "";
  modeloMinutaEl.appendChild(auto);
  // SÓ o provedor do modelo do chat. O worker recusa um override de outro
  // provedor (as peças já subiram à Files API do provedor ativo, e um file_id
  // trocado vira 400) — oferecer aqui o que lá é ignorado faria a tela mostrar
  // uma escolha que não acontece. Filtrando, a UI passa a espelhar a verdade: o
  // que sobra é exatamente o que pode valer.
  const prov = provedorDoModelo();
  for (const g of modelEl.querySelectorAll('optgroup[data-prov="' + prov + '"]')) {
    const c = g.cloneNode(true);
    // Só o NOME do modelo aqui. Os rótulos do #model trazem o detalhe de
    // janela/páginas e, no caso do Luna, a palavra "(padrão)" — que neste campo
    // seria falsa: o padrão daqui é o "Automático" do topo. Mesmo corte de
    // `nomeDoModelo()`, no primeiro " (".
    for (const op of c.querySelectorAll("option")) {
      op.textContent = op.textContent.split(" (")[0].trim();
    }
    modeloMinutaEl.appendChild(c);
  }
  // Id que não está entre os <option> — porque saiu da tabela OU porque é de
  // outro provedor — deixa o campo vazio, e vazio AQUI significa automático.
  // É a MESMA decisão que o worker toma (modeloDaMinuta), então a tela e o
  // comportamento não têm como divergir.
  modeloMinutaEl.value = escolhido;
  pintarAutoMinuta();
}

function pintarAutoMinuta() {
  const auto = modeloMinutaEl && modeloMinutaEl.options[0];
  if (!auto) return;
  const sug = sugestaoDeRedacao();
  auto.textContent = sug
    ? "Automático — " + sug
    : "Automático — o mesmo do chat (" + nomeDoModelo() + ")";
}

// A linha de indicação abaixo do <select>. É AJUDA, não regra: nenhum modelo é
// impedido de nada — a extensão só diz o que a experiência de uso mostrou.
function pintarPerfil() {
  if (!perfilHint) return;
  const perfil = PERFIS[String(modelEl.value || "")];
  if (!perfil) {
    perfilHint.textContent = "";
    perfilHint.hidden = true;
    return;
  }
  let txt;
  if (perfil === "redacao") {
    txt = "Indicado para redigir expedientes — minuta, despacho, ofício.";
  } else if (perfil === "ambos") {
    txt = "Serve tanto para analisar os autos quanto para redigir expedientes.";
  } else {
    const sug = sugestaoDeRedacao();
    txt =
      "Indicado para ler, explorar e triar os autos" +
      (sug
        ? ". Para redigir expedientes, o " + sug + " costuma render melhor."
        : ". Para redigir expedientes, prefira um modelo voltado a texto.");
  }
  perfilHint.textContent = txt;
  perfilHint.className = "perfil-hint " + perfil;
  perfilHint.hidden = false;
}

// O chip reflete a chave do PROVEDOR do modelo selecionado: escolher um modelo
// de um provedor sem a chave dele avisa na hora, antes mesmo de salvar. O
// provedor sai do prefixo do id (mesma regra do background.js/content.js).
function provedorDoModelo() {
  const m = String(modelEl.value || "");
  if (m.startsWith("gemini-")) return "gemini";
  if (m.startsWith("gpt-")) return "openai";
  return "anthropic";
}
function campoDoProvedor(p) {
  return p === "gemini" ? geminiKeyEl : p === "openai" ? openaiKeyEl : apiKeyEl;
}
// Nome curto do modelo escolhido ("Claude Haiku 4.5"), tirado do próprio
// <option> — sem duplicar aqui a tabela de nomes que já está no HTML.
function nomeDoModelo() {
  const op = modelEl.selectedOptions && modelEl.selectedOptions[0];
  return op ? op.textContent.split(" (")[0].trim() : modelEl.value;
}
function temChaveDigitada(el) {
  return !!(el && el.value.trim());
}

// O nível de raciocínio é um SEGMENTED nas duas páginas (os <input type=radio>
// vivem fora da tela e continuam sendo a fonte de verdade). Não há mais o
// caminho de <select> que existia enquanto options.html tinha layout próprio.
function getEffort() {
  if (!effortEl) return "high";
  const m = effortEl.querySelector("input:checked");
  return m ? m.value : "high";
}
function setEffort(v) {
  if (!effortEl || !v) return;
  const alvo = effortEl.querySelector('input[value="' + v + '"]');
  if (alvo) alvo.checked = true;
}
const EFFORT_TXT = {
  low: "Baixo — mais rápido e barato",
  medium: "Médio — equilíbrio",
  high: "Alto (recomendado)",
};
function setChip() {
  const prov = provedorDoModelo();
  const temChave = temChaveDigitada(campoDoProvedor(prov));
  chip.className = "status-chip " + (temChave ? "ok" : "warn");
  chipText.textContent = temChave
    ? "Pronto para usar — " + nomeDoModelo()
    : "Falta a chave da " + NOME_PROVEDOR[prov] + " para este modelo";
  // estado de cada chave, independente do modelo ativo
  marcarChave(kstateA, apiKeyEl.value);
  marcarChave(kstateG, geminiKeyEl.value);
  marcarChave(kstateO, openaiKeyEl && openaiKeyEl.value);
  if (provCount) {
    const n = PROVS.filter((p) => temChaveDigitada(campoDoProvedor(p))).length;
    provCount.textContent = n + " de 3 configurados";
  }
  if (effortHint) effortHint.textContent = EFFORT_TXT[getEffort()] || "";
  pintarPerfil();
  pintarProvedores(prov);
}
function marcarChave(el, valor) {
  if (!el) return;
  const tem = !!String(valor || "").trim();
  el.className = "kstate" + (tem ? " on" : "");
  el.textContent = tem ? "configurada" : "não configurada";
}

// Só a chave do provedor ATIVO fica visível, e o <select> de modelo mostra só
// os modelos dele. É o que troca três acordeões concorrentes por uma escolha.
function pintarProvedores(prov) {
  provs.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.prov === prov)));
  keySecs.forEach((s) => (s.hidden = s.dataset.prov !== prov));
  if (modelEl && provs.length) {
    for (const g of modelEl.querySelectorAll("optgroup")) {
      const pg = g.dataset.prov || "";
      if (pg) g.hidden = pg !== prov;
    }
  }
}

// Chave já salva vira linha mascarada: a chave inteira nunca volta à tela.
function mascarar(v) {
  const s = String(v || "").trim();
  if (s.length <= 10) return "••••••••";
  return s.slice(0, 4) + "••••••••••••" + s.slice(-4);
}
function pintarMascara(sec, valor) {
  if (!sec) return;
  const mask = sec.querySelector(".keymask");
  const row = sec.querySelector(".pw-row");
  const hint = sec.querySelector(".hint");
  const trocar = sec.querySelector(".pc-trocar");
  const tem = !!String(valor || "").trim();
  if (!mask || !row) return;
  mask.hidden = !tem;
  row.hidden = tem;
  if (hint) hint.hidden = tem;
  if (trocar) trocar.hidden = !tem;
  if (tem) mask.querySelector(".km-v").textContent = mascarar(valor);
}
function pintarMascaras() {
  pintarMascara(document.getElementById("keyA"), apiKeyEl.value);
  pintarMascara(document.getElementById("keyG"), geminiKeyEl.value);
  pintarMascara(document.getElementById("keyO"), openaiKeyEl && openaiKeyEl.value);
}

// A função `abrirChaveQueFalta` foi removida com o layout de acordeão: ela abria
// os `<details>` boxA/boxG/boxO, que não existem mais em nenhuma das duas telas.
// Como todos os acessos eram guardados por `if (box…)`, ela já era um no-op
// chamado a cada troca de modelo — e o comentário dela descrevia um layout
// inexistente. Quem mostra a chave do provedor ativo agora é `pintarProvedores`.

chrome.storage.local.get(
  [
    "apiKey",
    "geminiApiKey",
    "openaiApiKey",
    "model",
    "effort",
    "customPrompt",
    "memoriaCaso",
    "modeloMinuta",
  ],
  (v) => {
    if (v.apiKey) apiKeyEl.value = v.apiKey;
    if (v.geminiApiKey) geminiKeyEl.value = v.geminiApiKey;
    if (openaiKeyEl && v.openaiApiKey) openaiKeyEl.value = v.openaiApiKey;
    modelEl.value = v.model || MODELO_PADRAO;
    // `select.value` com um id que não existe entre os <option> deixa o campo
    // SEM seleção (value vira ""), e daí o chip cairia no provedor errado e um
    // "Salvar" gravaria modelo vazio. Acontece com config de uma versão que
    // oferecia outro modelo — o padrão atual é a saída correta.
    if (!modelEl.value) modelEl.value = MODELO_PADRAO;
    // Depois de `modelEl.value`: o rótulo do "Automático" é calculado a partir
    // do modelo do chat, então montar antes mostraria a sugestão do modelo errado.
    montarModeloMinuta();
    if (modeloMinutaEl) modeloMinutaEl.value = v.modeloMinuta || "";
    if (v.effort) setEffort(v.effort);
    if (customEl && v.customPrompt) customEl.value = v.customPrompt;
    // Default LIGADO, e por isso o teste é `!== false`: quem nunca abriu esta
    // tela não tem a chave no storage, e `v.memoriaCaso` vem `undefined`.
    if (memoriaEl) memoriaEl.checked = v.memoriaCaso !== false;
    pintarMascaras();
    setChip();
    // Os passos "Como usar" só existem enquanto NENHUMA chave foi salva: é
    // quando eles servem, e é o que faz o popup caber sem rolagem depois.
    // O critério é o que está SALVO (não o que está sendo digitado) — sumir no
    // meio da digitação seria um salto de layout no meio da tarefa.
    if (firstRun && (v.apiKey || v.geminiApiKey || v.openaiApiKey)) firstRun.hidden = true;
    mostrarApoio(!!(v.apiKey || v.geminiApiKey || v.openaiApiKey));
  }
);

function ligarToggle(btn, input) {
  if (!btn || !input) return;
  btn.addEventListener("click", () => {
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    btn.textContent = showing ? "mostrar" : "ocultar";
  });
}
ligarToggle(togglePw, apiKeyEl);
ligarToggle(togglePwG, geminiKeyEl);
ligarToggle(togglePwO, openaiKeyEl);

// Clicar num cartão de provedor troca o modelo para o recomendado dele. Não
// grava nada: o provedor segue derivado do `model` no próximo carregamento.
provs.forEach((b) => {
  b.addEventListener("click", () => {
    const p = b.dataset.prov;
    if (provedorDoModelo() !== p) modelEl.value = PADRAO[p];
    setChip();
  });
});
// "Trocar": devolve o campo editável e limpa o valor — quem troca digita
// outra chave, não edita a atual (que nunca é exibida por inteiro).
document.querySelectorAll(".pc-trocar").forEach((b) => {
  b.addEventListener("click", () => {
    const alvo = document.getElementById(b.dataset.alvo);
    if (!alvo) return;
    alvo.value = "";
    pintarMascaras();
    setChip();
    alvo.focus();
  });
});
personas.forEach((b) => {
  b.addEventListener("click", () => {
    if (!customEl) return;
    const t = b.dataset.txt || "";
    customEl.value = customEl.value.trim() ? customEl.value.trim() + "\n" + t : t;
    customEl.focus();
  });
});

modelEl.addEventListener("change", () => {
  // setChip → pintarProvedores já revela a chave do provedor recém-escolhido.
  setChip();
  // Trocar o modelo do chat pode trocar o PROVEDOR, e a lista de minutas é só
  // do provedor ativo — remontar (e não apenas repintar o rótulo do automático)
  // é o que impede o campo de continuar oferecendo a família anterior.
  montarModeloMinuta();
});
apiKeyEl.addEventListener("input", setChip);
geminiKeyEl.addEventListener("input", setChip);
if (openaiKeyEl) openaiKeyEl.addEventListener("input", setChip);
if (effortEl) effortEl.addEventListener("change", setChip);

// "Testar chave": lista os modelos do provedor (GET), que valida a credencial
// SEM consumir tokens. Roda no worker, que já sabe escolher a chave por
// provedor — e assim a chave não passa por mais um contexto do que precisa.
if (testKey) {
  testKey.addEventListener("click", () => {
    const prov = provedorDoModelo();
    const chave = campoDoProvedor(prov).value.trim();
    if (!chave) {
      saveStatus.textContent = "Digite a chave da " + NOME_PROVEDOR[prov] + " primeiro.";
      setTimeout(() => (saveStatus.textContent = ""), 2500);
      return;
    }
    testKey.disabled = true;
    saveStatus.textContent = "Testando…";
    chrome.runtime.sendMessage({ type: "testarChave", provider: prov, key: chave }, (r) => {
      testKey.disabled = false;
      saveStatus.textContent = chrome.runtime.lastError
        ? "Não foi possível testar agora."
        : r && r.ok
          ? "Chave válida."
          : "Chave recusada: " + ((r && r.erro) || "verifique e tente de novo.");
      setTimeout(() => (saveStatus.textContent = ""), 4000);
    });
  });
}

// "Configuração completa" (só no popup): a página de opções tem as mesmas
// preferências com as explicações longas e espaço para escrever as instruções
// personalizadas com calma.
if (abrirOpcoes) {
  abrirOpcoes.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
    window.close(); // o popup fecharia sozinho ao perder o foco; fechar aqui evita a piscada
  });
}

// -----------------------------------------------------------------------------
// "Alterações não salvas"
//
// O botão fica no fim de uma tela que passa do teto de 600px do popup do Chrome,
// e os controles que mais mudam (modelo, nível de raciocínio, cartão do
// provedor) estão bem acima dele. O usuário mexia, fechava e perdia a mudança
// sem nada na tela ter avisado que havia uma pendência.
//
// A DETECÇÃO É POR DELEGAÇÃO (`input`/`change` no container), e não campo a
// campo: a lista de campos desta tela já mudou três vezes — chave da OpenAI,
// effort, memória de caso — e um registro manual esquece exatamente o campo
// novo, falhando em silêncio para o recurso mais recente.
//
// Atribuir `.value` por JavaScript NÃO dispara `input`, então a carga inicial
// (`storage.local.get`) nunca acende o aviso. O outro lado da moeda: os três
// pontos em que o próprio popup escreve num campo — cartão de provedor,
// "Trocar" e as personas — precisam avisar À MÃO, e são mudanças reais que o
// usuário precisa salvar.
// A classe vive na `.save-row` (e não no aviso) porque a revelação é um grid
// `0fr→1fr` no filho — o pai precisa ser quem manda no estado.
const saveRow = document.querySelector(".save-row");
function marcarPendente() {
  if (saveRow) saveRow.classList.add("pendente");
}
function limparPendente() {
  if (saveRow) saveRow.classList.remove("pendente");
}

// Estado "grudado": enquanto o sentinela — que vem logo DEPOIS da faixa — está
// fora da tela, há conteúdo passando por baixo dela e a sombra faz sentido.
// Existe só no popup; na página de opções não há sticky nem sentinela.
const sentinela = document.querySelector(".save-sentinela");
if (saveRow && sentinela && "IntersectionObserver" in window) {
  new IntersectionObserver(([e]) => {
    saveRow.classList.toggle("grudado", !e.isIntersecting);
  }).observe(sentinela);
}
const formBox = document.querySelector(".body") || document.body;
formBox.addEventListener("input", marcarPendente);
formBox.addEventListener("change", marcarPendente);
provs.forEach((b) => b.addEventListener("click", marcarPendente));
document.querySelectorAll(".pc-trocar").forEach((b) => b.addEventListener("click", marcarPendente));
personas.forEach((b) => b.addEventListener("click", marcarPendente));

saveBtn.addEventListener("click", () => {
  const apiKey = apiKeyEl.value.trim();
  const geminiApiKey = geminiKeyEl.value.trim();
  const openaiApiKey = openaiKeyEl ? openaiKeyEl.value.trim() : "";
  const cfg = { apiKey, geminiApiKey, openaiApiKey, model: modelEl.value };
  // "" = automático. Gravado SEMPRE que o campo existe, para desfazer uma
  // escolha anterior ser possível voltando ao automático.
  if (modeloMinutaEl) cfg.modeloMinuta = modeloMinutaEl.value;
  if (effortEl) cfg.effort = getEffort();
  if (customEl) cfg.customPrompt = customEl.value.trim();
  if (memoriaEl) cfg.memoriaCaso = memoriaEl.checked;
  chrome.storage.local.set(cfg, () => {
    // DESLIGAR tem de apagar o que já existe, na hora. Um interruptor que só
    // impede gravações futuras deixaria no disco exatamente o material que o
    // usuário acabou de dizer que não quer guardado — e ele não teria como
    // saber que continua lá.
    if (memoriaEl && !memoriaEl.checked) {
      chrome.runtime.sendMessage({ type: "casoEsquecer", chave: null }, () => {
        void chrome.runtime.lastError;
      });
    }
    pintarMascaras();
    setChip();
    // `pintarMascaras` reescreve campos de chave por JS; se algum dia isso
    // passar a disparar `input`, o aviso reacenderia logo após salvar. Limpar
    // DEPOIS dele é o que mantém a ordem à prova disso.
    limparPendente();
    // salvou a primeira chave: os passos de primeiro uso cumpriram seu papel
    if (firstRun && (apiKey || geminiApiKey || openaiApiKey)) firstRun.hidden = true;
    mostrarApoio(!!(apiKey || geminiApiKey || openaiApiKey));
    const temChaveDoModelo = temChaveDigitada(campoDoProvedor(provedorDoModelo()));
    saveStatus.textContent = temChaveDoModelo
      ? "Configuração salva ✓"
      : "Salvo — falta a chave do provedor do modelo escolhido.";
    setTimeout(() => (saveStatus.textContent = ""), 2500);
  });
});


// ---------------------------------------------------------------------------
// Faixa de novidades (só existe no popup — na página de opções os elementos não
// estão no DOM, e como todo elemento exclusivo de uma tela ele é OPCIONAL).
//
// O badge do ícone é apagado assim que o popup abre: ele já fez o trabalho de
// chamar a atenção e foi atendido. O AVISO, não — ele sobrevive até ser lido ou
// dispensado, porque quem abriu o popup para trocar de modelo pode não ter
// olhado a faixa, e um aviso que se apaga sozinho na primeira abertura some
// justamente para quem veio fazer outra coisa.
// ---------------------------------------------------------------------------
(function novidades() {
  const cx = document.getElementById("avisoNov");
  if (!cx) return;
  try {
    chrome.action.setBadgeText({ text: "" });
  } catch {
    /* best-effort: falhar em apagar um badge não pode quebrar o popup */
  }
  const txt = document.getElementById("avisoNovTxt");
  const link = document.getElementById("avisoNovLink");
  const fechar = document.getElementById("avisoNovX");
  function esquecer() {
    cx.hidden = true;
    try {
      chrome.storage.local.remove("avisoNovidades", () => void chrome.runtime.lastError);
    } catch {
      /* idem */
    }
  }
  try {
    chrome.storage.local.get("avisoNovidades", (v) => {
      if (chrome.runtime.lastError) return;
      const a = v && v.avisoNovidades;
      if (!a || !a.para) return;
      txt.textContent = "Atualizada para a versão " + a.para + ".";
      cx.hidden = false;
    });
  } catch {
    /* sem storage: a faixa simplesmente não aparece */
  }
  if (link) link.addEventListener("click", esquecer);
  if (fechar) fechar.addEventListener("click", esquecer);
})();