// Integração REAL contra o catálogo público do OpenRouter (sem chave).
const { capsDoCatalogoOpenRouter } = await import(new URL("../src/openrouter.js", import.meta.url).href);
const curados = [
  "or:openai/gpt-5.6-luna",
  "or:google/gemini-3.7-flash",
  "or:anthropic/claude-sonnet-5",
  "or:anthropic/claude-opus-5",
  "or:x-ai/grok-4.6",
];
let falhas = 0;
for (const id of curados) {
  try {
    const c = await capsDoCatalogoOpenRouter(id);
    const okPdf = c.aceitaPdf ? "le PDF" : "SEM PDF NATIVO";
    console.log(
      (id + "                                   ").slice(0, 32) +
      " ctx=" + String(c.contextTokens).padEnd(8) +
      " maxPags=" + String(c.maxPages).padEnd(4) +
      " $" + c.preco.in + "/$" + c.preco.out +
      " effort=" + c.effort + " " + okPdf + " | " + c.nome
    );
    if (!c.contextTokens || !c.nome) { falhas++; console.log("  ^ caps incompletas"); }
  } catch (e) {
    falhas++;
    console.log(id + " FALHOU: " + e.message);
  }
}
// slug inexistente precisa dar a mensagem que orienta
try {
  await capsDoCatalogoOpenRouter("or:fulano/modelo-que-nao-existe-123");
  console.log("FALHOU: slug inexistente deveria lançar");
  falhas++;
} catch (e) {
  console.log("\nslug inexistente -> " + e.message);
}
console.log(falhas ? "\n" + falhas + " FALHAS" : "\nTodos os modelos curados existem e devolvem caps completas");
process.exit(falhas ? 1 : 0);
