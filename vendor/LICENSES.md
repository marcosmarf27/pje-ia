# Bibliotecas de terceiros

Arquivos baixados dos pacotes oficiais e usados **sem qualquer modificação**, apenas nas
páginas próprias da extensão (`chrome-extension://`) — `src/mapa.html` (mapa mental),
`src/editor.html` (editor de minutas) e `src/extrator.html` (extração de texto de PDF).
**Não** são carregados nas páginas do PJe.

| Arquivo | Pacote | Versão | Página | Origem | Licença |
|---|---|---|---|---|---|
| `d3.min.js` | [d3](https://d3js.org) | 7.9.0 | mapa | `https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js` | ISC — © Mike Bostock |
| `markmap-view.js` | [markmap-view](https://markmap.js.org) | 0.18.12 | mapa | `https://cdn.jsdelivr.net/npm/markmap-view@0.18.12/dist/browser/index.js` | MIT — © Gerald Liu |
| `jodit.min.js` / `jodit.min.css` | [Jodit](https://xdsoft.net/jodit/) | 4.13.8 | editor | `https://cdn.jsdelivr.net/npm/jodit@4.13.8/es2021/jodit.min.{js,css}` | MIT — © Valeriy Chupurnov |
| `docx.iife.js` | [docx](https://docx.js.org) | 9.7.1 | editor | `https://cdn.jsdelivr.net/npm/docx@9.7.1/dist/index.iife.js` | MIT — © Dolan Miu |
| `pdf.min.mjs` / `pdf.worker.min.mjs` | [pdf.js](https://mozilla.github.io/pdf.js/) | 6.2.108 | extrator | `https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build/pdf.{min,worker.min}.mjs` | Apache-2.0 — © Mozilla Foundation |

`pdf.min.mjs` + `pdf.worker.min.mjs` (1,64 MB somados) leem a **camada de texto** dos
PDFs das peças — `getDocument` + `page.getTextContent()`, nada de renderização. Vêm
os DOIS arquivos porque o worker é onde mora o parser (xref, filtros, criptografia e
todo o subsistema de fontes); é por isso que ele sozinho tem 1,2 MB, e é por isso que
não existe alternativa em JS abaixo de 200 KB que faça o mesmo com qualidade.

Os diretórios opcionais do pacote **não** são vendorizados, porque `getTextContent()`
não usa nenhum deles: `cmaps/` (CJK), `standard_fonts/` e `wasm/` só importam para
RENDERIZAR, e `web/` é o viewer.

`src/extrator.html` é uma página **oculta**, carregada num iframe pelo content script:
é o único contexto em que o pdf.js consegue abrir um `Worker` de verdade — no service
worker MV3 ele rodaria na própria thread e travaria em peça grande, e no content script
1,64 MB passariam a carregar em toda página `jus.br`.

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
