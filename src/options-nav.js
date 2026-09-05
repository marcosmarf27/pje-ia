// Destaque da seção corrente na navegação lateral da página de configuração.
//
// POR QUE NÃO ENTRA NO `popup.js`: aquele arquivo é compartilhado com o popup,
// que não tem navegação nenhuma. A regra desta casa é que todo elemento
// exclusivo de uma das duas telas seja acessado sob `if (el)` — e um recurso
// inteiro que só existe aqui merece arquivo próprio, não mais um `if`.
//
// POR QUE NÃO É `IntersectionObserver` SOZINHO: ele responde "entrou/saiu da
// viewport", que não é a pergunta. Com uma barra fixa no topo e seções de
// alturas muito diferentes, várias ficam visíveis ao mesmo tempo e a resposta
// certa é "qual delas está sob o topo AGORA" — que se lê do `getBoundingClientRect`.
// O IO entra só como GATILHO barato, para o cálculo não rodar em toda rolagem.
(function () {
  "use strict";

  const nav = document.querySelector(".cfg-nav");
  if (!nav) return;

  const links = [...nav.querySelectorAll(".cfg-l[href^='#']")];
  const secoes = links
    .map((a) => ({ a, sec: document.getElementById(a.getAttribute("href").slice(1)) }))
    .filter((p) => p.sec);
  if (!secoes.length) return;

  // O limiar acompanha a barra: no estreito ela ganha a fileira de navegação
  // por baixo, e uma constante daria a seção errada em metade das larguras.
  function limiar() {
    const top = document.querySelector(".cfg-top");
    const h = top ? top.getBoundingClientRect().height : 64;
    const fileira = getComputedStyle(nav).flexDirection === "row"
      ? nav.getBoundingClientRect().height
      : 0;
    return h + fileira + 24;
  }

  let atual = null;
  function pintar() {
    const lim = limiar();
    // No FIM da página a última seção é a corrente, ainda que o topo dela nunca
    // chegue ao limiar: uma seção curta no rodapé jamais acenderia, e o mapa
    // ficaria mentindo justamente onde a rolagem para.
    const fim = window.innerHeight + window.scrollY >= document.body.scrollHeight - 4;
    let alvo = fim ? secoes[secoes.length - 1] : secoes[0];
    if (!fim) {
      for (const p of secoes) {
        if (p.sec.getBoundingClientRect().top <= lim) alvo = p;
        else break;
      }
    }
    if (alvo === atual) return;
    atual = alvo;
    for (const p of secoes) {
      if (p === alvo) p.a.setAttribute("aria-current", "true");
      else p.a.removeAttribute("aria-current");
    }
  }

  // Sem throttle por `requestAnimationFrame`, e o motivo é que ele não compra
  // nada aqui: o navegador já entrega o evento de scroll uma vez por quadro, e
  // `pintar` lê 7 retângulos sem escrever nada entre as leituras (o layout é
  // calculado uma vez) e sai na PRIMEIRA linha quando a seção corrente não
  // mudou — o caso de quase toda rolagem. De quebra, some a dependência de um
  // rAF que este projeto já viu congelar em contexto que não pinta (o primeiro
  // desenho do mapa mental e o `page.render()` do pdf.js).
  const agendar = pintar;

  // O IO observa as seções só para acordar o cálculo; quem decide é o `pintar`.
  // `rootMargin` generoso porque o interesse é o movimento, não a borda exata.
  if (typeof IntersectionObserver === "function") {
    const io = new IntersectionObserver(agendar, { rootMargin: "-10% 0px -70% 0px", threshold: [0, 1] });
    for (const p of secoes) io.observe(p.sec);
  }
  window.addEventListener("scroll", agendar, { passive: true });
  window.addEventListener("resize", agendar);

  // O clique marca NA HORA. Com rolagem suave o `scroll` só chega dezenas de
  // milissegundos depois, e um menu que demora a responder ao próprio clique
  // parece quebrado — a mesma razão do relógio da espera no painel.
  for (const p of secoes) {
    p.a.addEventListener("click", () => {
      atual = p;
      for (const q of secoes) {
        if (q === p) q.a.setAttribute("aria-current", "true");
        else q.a.removeAttribute("aria-current");
      }
    });
  }

  pintar();
})();
