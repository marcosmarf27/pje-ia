const apiKeyEl = document.getElementById("apiKey");
const geminiKeyEl = document.getElementById("geminiApiKey");
const openaiKeyEl = document.getElementById("openaiApiKey");
const modelEl = document.getElementById("model");
const effortEl = document.getElementById("effort");
const customEl = document.getElementById("customPrompt");
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
const abrirOpcoes = document.getElementById("abrirOpcoes");
const boxA = document.getElementById("boxA");
const boxG = document.getElementById("boxG");
const boxO = document.getElementById("boxO");

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
const NOME_PROVEDOR = { anthropic: "Anthropic", gemini: "Google", openai: "OpenAI" };
// Nome curto do modelo escolhido ("Claude Haiku 4.5"), tirado do próprio
// <option> — sem duplicar aqui a tabela de nomes que já está no HTML.
function nomeDoModelo() {
  const op = modelEl.selectedOptions && modelEl.selectedOptions[0];
  return op ? op.textContent.split(" (")[0].trim() : modelEl.value;
}
function temChaveDigitada(el) {
  return !!(el && el.value.trim());
}
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
}
function marcarChave(el, valor) {
  if (!el) return;
  const tem = !!String(valor || "").trim();
  el.className = "kstate" + (tem ? " on" : "");
  el.textContent = tem ? "configurada" : "não configurada";
}

// Abre a chave que FALTA para o modelo ativo — no carregamento E a cada troca
// de modelo: sem isto, escolher um modelo de um provedor sem chave mostrava o
// aviso com o campo recolhido, e a linha fechada não parece clicável para quem
// nunca a abriu. Só ABRE (as chaves nascem fechadas no HTML): fechar o que o
// usuário abriu na mão seria hostil.
function abrirChaveQueFalta() {
  const prov = provedorDoModelo();
  const faltaA = !apiKeyEl.value.trim();
  const faltaG = !geminiKeyEl.value.trim();
  const faltaO = !(openaiKeyEl && openaiKeyEl.value.trim());
  const primeiroUso = faltaA && faltaG && faltaO;
  if (boxA && faltaA && (primeiroUso || prov === "anthropic")) boxA.open = true;
  if (boxG && faltaG && (primeiroUso || prov === "gemini")) boxG.open = true;
  if (boxO && faltaO && (primeiroUso || prov === "openai")) boxO.open = true;
}

chrome.storage.local.get(
  ["apiKey", "geminiApiKey", "openaiApiKey", "model", "effort", "customPrompt"],
  (v) => {
    if (v.apiKey) apiKeyEl.value = v.apiKey;
    if (v.geminiApiKey) geminiKeyEl.value = v.geminiApiKey;
    if (openaiKeyEl && v.openaiApiKey) openaiKeyEl.value = v.openaiApiKey;
    if (v.model) modelEl.value = v.model;
    if (effortEl && v.effort) effortEl.value = v.effort;
    if (customEl && v.customPrompt) customEl.value = v.customPrompt;
    setChip();
    // Os passos "Como usar" só existem enquanto NENHUMA chave foi salva: é
    // quando eles servem, e é o que faz o popup caber sem rolagem depois.
    // O critério é o que está SALVO (não o que está sendo digitado) — sumir no
    // meio da digitação seria um salto de layout no meio da tarefa.
    if (firstRun && (v.apiKey || v.geminiApiKey || v.openaiApiKey)) firstRun.hidden = true;
    abrirChaveQueFalta();
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

modelEl.addEventListener("change", () => {
  setChip();
  abrirChaveQueFalta(); // trocou para um provedor sem chave: mostra o campo
});
apiKeyEl.addEventListener("input", setChip);
geminiKeyEl.addEventListener("input", setChip);
if (openaiKeyEl) openaiKeyEl.addEventListener("input", setChip);

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

saveBtn.addEventListener("click", () => {
  const apiKey = apiKeyEl.value.trim();
  const geminiApiKey = geminiKeyEl.value.trim();
  const openaiApiKey = openaiKeyEl ? openaiKeyEl.value.trim() : "";
  const cfg = { apiKey, geminiApiKey, openaiApiKey, model: modelEl.value };
  if (effortEl) cfg.effort = effortEl.value;
  if (customEl) cfg.customPrompt = customEl.value.trim();
  chrome.storage.local.set(cfg, () => {
    setChip();
    // salvou a primeira chave: os passos de primeiro uso cumpriram seu papel
    if (firstRun && (apiKey || geminiApiKey || openaiApiKey)) firstRun.hidden = true;
    const temChaveDoModelo = temChaveDigitada(campoDoProvedor(provedorDoModelo()));
    saveStatus.textContent = temChaveDoModelo
      ? "Configuração salva ✓"
      : "Salvo — falta a chave do provedor do modelo escolhido.";
    setTimeout(() => (saveStatus.textContent = ""), 2500);
  });
});
