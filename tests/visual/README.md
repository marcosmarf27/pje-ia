# Rede de segurança visual

Duas ferramentas que medem coisas diferentes e não se substituem.

```bash
# as TELAS SATÉLITES (popup, opções, ajuda, editor, modelos, novidades)
node tests/visual/telas.mjs tests/visual/capturas-telas 8981

# a impressão digital: para CADA elemento da árvore sombra, 11 propriedades de cor
node tests/visual/impressao.mjs tests/visual/base-v0.59.json 8901      # grava
node tests/visual/impressao.mjs /dev/null 8901 tests/visual/base-v0.59.json  # compara

# a captura de pixel: um PNG por tema e por estado do modo sigiloso
node tests/visual/capturar.mjs tests/visual/capturas 8911
```

Linha de base em 05/09/2026, na v0.59.0: **3.338 elementos × 11 propriedades =
36.718**, em seis retratos (largo/estreito × normal/sigilo, mais os dois do
estado vazio). Determinística: duas execuções seguidas dão **zero** diferenças.

## `telas.mjs` — as satélites

O `capturar.mjs` fotografa o PAINEL, que vive em Shadow DOM. As demais telas são
páginas de extensão comuns e compartilham a paleta por `ui.css` — o que
significa que um token trocado no `panel.css` e não espelhado ali produz **duas
identidades visuais no mesmo produto**, sem nenhum teste acusando.

Elas recebem um stub de `chrome` por `Page.addScriptToEvaluateOnNewDocument`,
que roda ANTES de qualquer script da página; um `<script>` injetado depois
chegaria tarde e o `popup.js` morreria no primeiro `storage.get`, produzindo uma
captura pela metade — pior que captura nenhuma, porque parece defeito de layout.

## Por que DUAS

- **`impressao.mjs`** responde *"alguma cor mudou onde não devia?"*. É o que
  torna o redesign da v0.60 verificável: o tema `institucional` recebe os ~130
  tokens do padrão de hoje, e se a impressão bater com esta baseline, o visual
  antigo sobreviveu **por construção** — inspecionar um diff de cinquenta
  substituições à mão não prova nada.
- **`capturar.mjs`** responde *"a tela está certa?"*, que é outra pergunta.
  `getComputedStyle` reporta regra viva e correta em todos os casos abaixo, e
  nenhum deles aparece numa comparação de propriedades:
  sombra `inset` pintada abaixo dos filhos; caixa 0×0 que não desenha
  `box-shadow`; item que foi parar numa terceira linha do cabeçalho; e o defeito
  que esta pasta encontrou no primeiro dia (ver `achados/`).

## O que a impressão digital NÃO pode afirmar

**Ela mede o tema que você mandar medir, e mais nada.** Foi assim que a v0.58.0
publicou o tema Rosa sem uma linha de CSS com o teste de temas verde: ele media
o mecanismo, nunca o conteúdo. Prova de NÃO-REGRESSÃO não é prova de que a coisa
nova funciona — quem responde por isso é o `t-temas-contraste`, que calcula o
contraste resultante, e a captura.

E, na v0.60, ela **não** dará "zero diferenças" contra o Institucional. Duas
classes de diferença são ESPERADAS e ficam enumeradas aqui; qualquer outra é
regressão:

1. `panel.css` tem `.wrap[data-tema] .panel { color: var(--text) }`, que **não
   casa** no padrão de hoje (sem atributo) e **casa** no Institucional. Tudo que
   herda `color` de `.panel` sai `rgb(0, 0, 0)` na baseline e `rgb(14, 50, 63)`
   no tema.
2. Elementos que só existem de um dos lados (as abas e os cartões do estado
   vazio nascem na v0.60 e valem para todos os temas).

## Armadilhas do arnês

1. **`Emulation`, não `Emulator`.** O domínio CDP correto é `Emulation.setDeviceMetricsOverride`;
   com o nome errado o comando é ignorado em silêncio e a captura sai no tamanho
   padrão do headless, cortada.
2. **`--force-prefers-reduced-motion=no-preference` NÃO funciona** neste Chrome —
   medido: `matchMedia("(prefers-reduced-motion: reduce)").matches` continua
   `true` com a flag. Quem manda é `Emulation.setEmulatedMedia`. Sem isso
   mede-se sempre o ramo reduzido, que é **outro layout**.
3. **O modo é trocado clicando no botão real**, nunca pondo a classe na mão:
   pôr a classe pula o `aplicarModo()`, que é quem centra a janela, limpa a
   geometria inline do modo livre e faz o FLIP.
4. **O `panel.css` chega por `fetch` assíncrono** — daí o `window.__pronto`, que
   espera a folha ter mais de 5.000 caracteres. Medir antes mede uma árvore sem
   estilo, em que um `<button>` é `inline-block`.
5. **`document.getAnimations()` não alcança a árvore sombra**; `elemento.getAnimations()`
   alcança. Já produziu um falso negativo convincente.

## `painel.html`

É o painel de VERDADE, pilotado pela API pública (`PjePanel.mount()`), com um
stub mínimo de `chrome.storage`. Expõe cinco ganchos para o arnês:
`__pronto`, `__modo`, `__tema`, `__cena` (estados do modo sigiloso) e `__vazio`.

Ele carrega `prompts.js` e `panel.js`, e **não** carrega `modelos.js` — o
`panel.js` trata o `MLIB` como opcional, então o botão "Modelos" não aparece nas
capturas. É fiel ao contrato, não um defeito.

## `achados/`

O primeiro achado da pasta, no dia em que ela nasceu:
**`mov-reduzido-ANTES.png` / `mov-reduzido-DEPOIS.png`**.

Dentro do `@media (prefers-reduced-motion: reduce)`, a regra
`.panel, .wrap.open .panel { transform: none }` existe para tirar o
**deslocamento de entrada**. Por vir depois no arquivo, ela também apagava o
`translate(-50%, -50%)` que **centra** a janela no modo expandido: quem pede
menos movimento recebia o painel com o canto superior esquerdo no MEIO da tela,
metade dele fora da janela — sem ✕, sem Enviar e sem a coluna de peças
alcançáveis. Estava em produção, e nada acusava.

A lição vale para a folha inteira: **`transform` de LAYOUT e `transform` de
ANIMAÇÃO são a mesma propriedade.** Desligar a segunda apaga a primeira, e quem
pediu menos movimento não pediu menos interface.
