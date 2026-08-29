# Bibliotecas de terceiros

Arquivos baixados dos pacotes oficiais e usados **sem qualquer modificação**, apenas nas
páginas próprias da extensão (`chrome-extension://`) — `src/mapa.html` (mapa mental),
`src/editor.html` (editor de minutas) e `src/ocr-offscreen.html` (extração de texto das
peças). **Não** são carregados nas páginas do PJe.

> **Exceção: as fontes em `fontes/` SÃO carregadas na página do tribunal** (é onde o
> painel roda). Ver a segunda tabela.

| Arquivo | Pacote | Versão | Página | Origem | Licença |
|---|---|---|---|---|---|
| `d3.min.js` | [d3](https://d3js.org) | 7.9.0 | mapa | `https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js` | ISC — © Mike Bostock |
| `markmap-view.js` | [markmap-view](https://markmap.js.org) | 0.18.12 | mapa | `https://cdn.jsdelivr.net/npm/markmap-view@0.18.12/dist/browser/index.js` | MIT — © Gerald Liu |
| `jodit.min.js` / `jodit.min.css` | [Jodit](https://xdsoft.net/jodit/) | 4.13.8 | editor | `https://cdn.jsdelivr.net/npm/jodit@4.13.8/es2021/jodit.min.{js,css}` | MIT — © Valeriy Chupurnov |
| `docx.iife.js` | [docx](https://docx.js.org) | 9.7.1 | editor | `https://cdn.jsdelivr.net/npm/docx@9.7.1/dist/index.iife.js` | MIT — © Dolan Miu |
| `pdf.min.mjs` / `pdf.worker.min.mjs` | [pdfjs-dist](https://mozilla.github.io/pdf.js/) | 6.2.108 | extração | `https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build/pdf.{min,worker.min}.mjs` | Apache-2.0 — © Mozilla Foundation |

`markmap-view.js` é um bundle IIFE que publica `window.markmap` e **consome `d3` global** —
por isso a ordem dos `<script>` em `mapa.html` importa (d3 primeiro).

`jodit.min.js` publica `window.Jodit` (editor WYSIWYG, zero dependências). `docx.iife.js`
publica `window.docx` (geração de `.docx` no navegador); `src/editor-docx.js` percorre o
HTML do editor e monta o documento com formatação forense. São independentes entre si —
o editor não depende de d3 nem de markmap.

O pacote `markmap-lib` (transformador de Markdown) **não** é usado: ele arrasta `katex`,
`highlight.js`, `prismjs` e `markdown-it` (~311 KB) e tenta buscar assets em CDN, o que a CSP
de páginas de extensão bloqueia. A conversão Markdown → árvore de nós é feita por
`mdParaArvore()` em `src/mapa.js`.

Para atualizar, baixe novamente a mesma URL com a versão nova, rode `node --check` no arquivo
e atualize a tabela acima.

## Fontes

Subset `latin` (U+0000–00FF, cobre toda a acentuação do português), baixado da API do
Google Fonts e servido **localmente** — nunca de CDN, porque o painel roda na página do
tribunal e um `<link>` externo seria barrado pela CSP de vários deles e vazaria uma
requisição a partir da tela dos autos. Declaradas em `src/fontes.css`; ver DESIGN.md §3.

| Arquivo | Família | Tipo | Licença |
|---|---|---|---|
| `fontes/newsreader.woff2` | [Newsreader](https://fonts.google.com/specimen/Newsreader) | variable, 400–600 | SIL OFL 1.1 — © Production Type |
| `fontes/newsreader-italic.woff2` | Newsreader | itálico 400 | SIL OFL 1.1 |
| `fontes/plexsans.woff2` | [IBM Plex Sans](https://fonts.google.com/specimen/IBM+Plex+Sans) | variable, 400–600 | SIL OFL 1.1 — © IBM |
| `fontes/plexmono-400.woff2` / `-500.woff2` | [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono) | estática | SIL OFL 1.1 — © IBM |

Newsreader e Plex Sans são **variable fonts**: um arquivo cobre 400, 500 e 600, e é por
isso que há um `.woff2` só para os três pesos (a API do Google devolve o mesmo arquivo
para cada peso pedido). Plex Mono é estática, daí os dois arquivos. Total ~264 KB, dos
quais ~188 KB no caminho comum — o itálico e o mono 500 só baixam quando usados.

## pdf.js — por que os DOIS arquivos, e por que não há alternativa menor

O parser (xref, filtros, criptografia, subsistema de fontes) mora no **worker**, e é por
isso que `pdf.worker.min.mjs` sozinho tem 1,2 MB. Não existe biblioteca em JS abaixo de
200 KB que leia a camada de texto de um PDF de tribunal com a mesma fidelidade.

Os diretórios opcionais **não** foram vendorizados: `cmaps/` (CJK), `standard_fonts/` e
`wasm/` só importam para **renderizar**, e `web/` é o viewer. Quando a rasterização das
páginas digitalizadas entrar (PP-OCRv6), reavaliar `standard_fonts/`.

Carregado por `import` em `src/ocr-offscreen.js` — **o único ES module fora do service
worker** —, com o worker apontado por `chrome.runtime.getURL`. A CSP de páginas de extensão
não permite `eval`, daí `isEvalSupported: false` no `getDocument`.
