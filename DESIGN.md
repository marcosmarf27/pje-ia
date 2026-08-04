# DESIGN.md — sistema visual da extensão

> **Leia este arquivo antes de qualquer mudança de frontend.** Ele é a fonte de
> verdade do visual: cores, tipografia, espaçamento, raios, sombras e o
> comportamento dos componentes. Se uma mudança precisar de um valor que não
> está aqui, o certo é acrescentá-lo aqui primeiro — literais soltos no CSS são
> exatamente o que faz a interface "parecer poluída" mesmo com cada tela
> individualmente correta.

**Origem**: sistema desenhado no Claude Design (projeto *Três larguras de painel
melhoradas*, arquivo `Assistente dos Autos.dc.html` → componente `Panel`) e
implementado a partir do handoff. O protótipo é a referência visual; o código
aqui é a implementação real, não uma cópia da estrutura do protótipo.

---

## 1. Onde os tokens vivem

Não há build step: os tokens são **variáveis CSS declaradas em dois lugares**,
que precisam ficar espelhados.

| Arquivo | Seletor | Cobre |
|---|---|---|
| `src/panel.css` | `.wrap` | O painel dentro do PJe (Shadow DOM) |
| `src/ui.css` | `:root` | popup, options, help |
| `src/editor.css` | `:root` | editor de minutas (+ tokens próprios de folha A4) |
| `src/modelos-page.css` | `:root` | página de modelos |
| `src/mapa.css` | `:root` | mapa mental |

O painel **não** pode importar `ui.css`: ele vive em Shadow DOM e carrega o
próprio CSS via `web_accessible_resources`. Por isso a duplicação é deliberada —
mas os **valores** têm de bater. Ao mudar um token, mude nos dois.

---

## 2. Cor

### Marca / ação

| Token | Valor | Uso |
|---|---|---|
| `--pje` | `#12729f` | Primária: botões de ação, links, foco, badges, dots ativos |
| `--pje-2` | `#0f5f85` | Hover da primária, texto de link sobre branco |
| `--pje-3` | `#0d5b80` | Hover de link, estados pressionados |
| `--hd-de` / `--hd-para` | `#0f4d72` → `#1a6d9c` | Gradiente do cabeçalho, **96deg** |

O gradiente diagonal do cabeçalho é assinatura do produto: `linear-gradient(96deg,
var(--hd-de) 0%, var(--hd-para) 100%)`. Não substituir por cor chapada.

### Texto

| Token | Valor | Uso |
|---|---|---|
| `--ink` | `#0f3346` | Títulos serifados |
| `--text` | `#123240` | Corpo de texto |
| `--text-2` | `#1b3d4f` | Itens de lista |
| `--text-3` | `#2b566d` | Rótulos de botão secundário |
| `--muted` | `#6b8494` | Texto de apoio, descrições |
| `--muted-2` | `#7e97a8` | Meta-informação, contadores |
| `--muted-3` | `#93a9b8` | Placeholders, ícones inativos |

### Superfícies

| Token | Valor | Uso |
|---|---|---|
| `--surface` | `#ffffff` | Painel, cartões, lista |
| `--surface-2` | `#fbfdfe` | Campos de entrada, rodapé da lista |
| `--surface-3` | `#f5f9fc` | Fundo da área de conversa |
| `--hover` | `#f3f8fb` | Hover de linha da lista |
| `--hover-2` | `#f2f9fd` | Hover de chip/ação |
| `--accent-bg` | `#e8f2f8` | Badge, pill de contagem, número dos passos |
| `--canvas` | `#e9eef3` | Fundo atrás de páginas (editor, modelos) |

### Linhas

| Token | Valor | Uso |
|---|---|---|
| `--line` | `#e1ebf2` | Divisórias, bordas de rodapé |
| `--line-2` | `#e8eff5` | Divisória suave dentro de blocos |
| `--line-card` | `#e3edf3` | Borda de cartão |
| `--line-input` | `#dbe6ee` | Borda de campo |
| `--line-strong` | `#cadcea` | Borda de botão com contorno |
| `--line-check` | `#c2d3de` | Checkbox |

### Categorias de peça

São **semânticas** — a cor identifica a espécie do documento na lista, nos chips,
no popup `@` e no mapa mental. Não reutilizar para outros fins.

| Token | Valor | Espécie |
|---|---|---|
| `--cat-decisao` | `#dd8b2c` | Decisões, sentenças, despachos |
| `--cat-audiencia` | `#1f9d6b` | Atas e audiências |
| `--cat-peticao` | `#6b57c8` | Petições das partes |
| `--cat-prova` | `#b8479c` | Laudos, perícias, provas |
| `--cat-outro` | `#b7c8d4` | Demais documentos (neutro) |

> **Por que petições deixou de ser azul**: azul é a cor de *ação* do sistema
> (`--pje`). Uma categoria azul na lista competia com botões e links, e o usuário
> não conseguia dizer se o azul significava "petição" ou "clicável". Petições
> passou a roxo e provas a magenta, mantendo dourado/verde onde já estavam.

### Estados

| Token | Valor | Uso |
|---|---|---|
| `--ok` | `#1f9d6b` | Sucesso, salvo |
| `--ok-bg` | `#eaf5ee` | Fundo de confirmação suave (marca da peça em texto) |
| `--warn` | `#dd8b2c` | Alerta, contexto quase cheio |
| `--warn-bg` | `#fbf1dc` | Fundo de aviso suave |
| `--warn-line` | `#eeddba` | Borda de aviso suave |
| `--warn-ink` | `#8a5a12` | Texto sobre aviso suave |
| `--erro` | `#a5301f` | Erro, exclusão armada |
| `--erro-hd` | `rgba(220,80,80,0.85)` | Hover do ✕ no cabeçalho |

> **Aviso suave × `.alertbar`.** O trio `--warn-*` veste o que **informa sem
> impedir de continuar**: o relatório de peças que não baixaram, a nota de
> download lento, o estado "voltar ao documento". A `.alertbar` é o contrário —
> ela aparece quando algo **bloqueia** o envio (contexto cheio, troca de
> provedor) e usa vermelho-tijolo, mais forte de propósito. Não trocar um pelo
> outro: se tudo alerta com a mesma intensidade, nada alerta.

---

## 3. Tipografia

```css
--ff-sans:  "Source Sans 3", "Segoe UI", system-ui, sans-serif;
--ff-serif: "Source Serif 4", Georgia, "Times New Roman", serif;
--ff-mono:  "IBM Plex Mono", "Cascadia Mono", Consolas, monospace;
```

- **Sans** para interface.
- **Serif** para títulos — "Peças do processo", "Como posso ajudar?", nomes de
  página. É o que dá o tom forense sem recorrer a ornamento.
- **Mono** para **numerais que o usuário compara ou copia**: o id da peça na
  lista. Tabular, alinha na vertical e não se confunde com o nome.

> **As fontes NÃO são carregadas do Google Fonts.** O painel roda dentro da
> página do tribunal: um `<link>` para `fonts.googleapis.com` seria barrado pela
> CSP de vários tribunais e, pior, faria uma requisição a um servidor externo a
> partir da tela dos autos — vazamento que a extensão não pode causar. Usamos a
> stack com fallback: quem tiver as fontes instaladas vê o desenho original; os
> demais veem Segoe UI/Georgia, que sustentam o mesmo tom. Para fidelidade total,
> o caminho é vendorizar os `.woff2` (Source Sans 3, Source Serif 4 e IBM Plex
> Mono são SIL OFL) em `vendor/fontes/` e declarar `@font-face` — some ~200 KB ao
> pacote e exige `web_accessible_resources` para o painel.

### Escala

Sete degraus inteiros. **Não introduzir literais de `font-size` em px** fora
desta escala (`em` relativos no markdown das mensagens seguem corretos).

| Token | px | Uso |
|---|---|---|
| `--fs-nano` | 10 | id da peça, `kbd`, sobrescrito de citação |
| `--fs-micro` | 11 | rótulos, legendas, meta |
| `--fs-meta` | 12 | chips, dicas, controles secundários |
| `--fs-ui` | 13 | lista de peças, formulários, botões |
| `--fs-body` | 14 | mensagens, campo de entrada |
| `--fs-lg` | 15 | título do painel, título da lista |
| `--fs-lead` | 17 | "Como posso ajudar?" no painel estreito |
| `--fs-hero` | 26 | "Como posso ajudar?" nos modos largos |

**Eyebrow**: rótulo acima de um título — `--fs-micro`, peso 600,
`letter-spacing: 1.4px`, `text-transform: uppercase`, cor `--muted-2`.

---

## 4. Espaço, raio, sombra

```css
--sp-1: 4px;  --sp-2: 6px;  --sp-3: 10px;  --sp-4: 14px;  --sp-5: 20px;  --sp-6: 28px;

--r-xs: 4px;   /* checkbox */
--r-sm: 7px;   /* botão pequeno, segmented */
--r-md: 8px;   /* botão, campo de busca, item de lista */
--r-lg: 11px;  /* cartão */
--r-xl: 12px;  /* caixa de entrada */
--r-2xl: 14px; /* moldura externa do painel */
--r-pill: 999px;

--sh-card: 0 1px 2px rgba(16, 60, 85, 0.04);
--sh-btn:  0 1px 2px rgba(16, 60, 85, 0.18);
--sh-pop:  0 8px 28px -8px rgba(16, 60, 85, 0.35);
--sh-panel: 0 12px 30px rgba(16, 60, 85, 0.12);
```

Transições: `140ms ease` para cor/borda/fundo; `120ms ease` para hover de lista.
Nunca animar `width`/`height` de container com conteúdo (reflow visível).

---

## 5. Componentes

### Cabeçalho do painel
Altura mínima 54px, gradiente 96deg, texto branco. À esquerda: marca 30×30 com
`background: rgba(255,255,255,0.16)` e borda `rgba(255,255,255,0.22)`, seguida de
**duas linhas** — nome do produto (`--fs-body`, peso 600) e, abaixo, o **número
CNJ do processo** em `--fs-nano`, uppercase, `rgba(255,255,255,0.62)`. À direita,
botões 30×30 transparentes com hover `rgba(255,255,255,0.18)`; separador vertical
de 1px antes do ✕, cujo hover é `--erro-hd`.

> Mostrar o CNJ no cabeçalho não é decoração: o usuário costuma ter vários
> processos abertos em abas, e era impossível saber a qual deles o painel se
> referia sem olhar a página atrás.

### Lista de peças
Cabeçalho com título serifado + badge de contagem (pill `--accent-bg`) + botão
recolher «. Busca com glifo ⌕ à esquerda. **Segmented control** `principais |
todas`: dois botões de largura igual, o ativo com `background: var(--pje)` e
texto branco, o inativo branco com borda `--line-input`. Legenda de categorias
com dots de 7px. Itens: checkbox 15px (raio `--r-xs`) + dot 7px da categoria +
nome (`--fs-meta`, peso 500, truncado) + **id em `--ff-mono`**, `--fs-nano`, cor
`--muted-3`. Rodapé com "Mostrando N de M" e o botão ↻ Carregar todas.

A faixa abaixo da lista (`.docs-tip`) hospeda as ações que valem para a **lista
inteira** — hoje `⟳ Carregar todas as peças`, `⬇ Baixar .zip`, `⌁ Extrair texto`
e `⬇ Texto (.zip)`. Elas compartilham a MESMA regra de estilo
(`.tip-load, .tip-zip, .tip-zipt, .tip-txtx`) de propósito: são pares, e regras
separadas divergiriam com o tempo. Ação nova de escopo "lista toda" entra aqui,
não na `.toolbar` — aquela linha já vive no limite em 484px.

Os rótulos dizem o CONTEÚDO, não o formato: `⬇ Documentos (.zip)` são os
arquivos originais e `⬇ Texto (.zip)` é o texto extraído. Com "⬇ Baixar .zip" e
"⬇ Texto (.zip)" lado a lado ninguém sabia se o primeiro também extraía.

### Linha de status da seleção (`.extrai-bar`)

Ocupa a linha inteira abaixo dos botões (`order: 5`) e é **um componente**, não
um parágrafo solto com um botão órfão embaixo — foi assim que a faixa chegou a
quebrar em quatro linhas em 460px. Estrutura: ícone · retrato da seleção ·
botão de ação.

```
⌁  8 de 12 ainda em documento · ≈ US$ 0,28                   [⌁ Extrair 8]
```

**Duas versões no DOM** (`.eb-full`/`.eb-short`), como o medidor de contexto —
mas pelo critério **inverso** ao dele. No `.expanded`/`.livre-wide` o painel é
largo, porém a lista de peças vira uma **coluna de ~310px**, e a forma longa
truncava exatamente no custo (`… · ≈ US…`). Custo cortado é pior que custo
abreviado: é o número que decide se vale extrair.

```
expandido:   ⌁  8 em documento · US$ 0,28    [⌁ Extrair 8]
```

Três estados, e a distinção é semântica, não decorativa:

| Estado | Quando | Veste |
|---|---|---|
| convite | só peças com texto próprio a extrair (grátis) | `--accent-bg` + `--line-strong` |
| aviso (`.tem-ocr`) | há peça digitalizada — vai ser mal lida, e resolver custa | `--warn-bg` + `--warn-line` |
| pronto (`.tudo-pronto`) | nada pendente; o botão some | `--surface-2` + `--line` |

**Ela nunca some enquanto houver peça marcada.** A primeira versão calculava só
sobre peças já baixadas, então marcar "todas" fazia a opção de extrair
desaparecer — o oposto do esperado, e a maior fonte de confusão do recurso. Peça
não baixada é candidata como qualquer outra; o tipo dela só se conhece depois, e
isso vai no `title`, não na tela.

O detalhamento (quantas por leitura local, quantas por OCR, quantas ainda não
medidas, e o veredito de custo do modelo ativo) mora no `title`. Em 420px,
mostrá-lo custaria a segunda linha que este desenho existe para eliminar.

**Peça indisponível não é trabalho pendente.** A que devolve 404 no PJe, ou é
digitalizada sem chave de OCR, sai da fila e aparece como `· 1 indisponível`.
Contá-la como pendente fazia a faixa prometer para sempre algo que nunca ia
acontecer — cada clique reproduzindo o mesmo erro.

As ações **por peça** seguem outro padrão: `.d-ver` e `.d-extrai` dividem uma
regra só, pela mesma razão. Duas exceções ao "só no hover", ambas por descoberta:
o `.d-extrai` fica em `opacity: .4` nas rows **marcadas** (invisível até o hover,
ninguém o descobria, e a extração parecia existir só em lote), e o `.d-emtexto`
é **permanente** — é a única confirmação de que a extração daquela peça funcionou.

### Marca da peça em texto (`.d-emtexto`)

Verde `--ok` sobre `--ok-bg`, 18×16px, irmã de `.d-t` com `flex: none` (dentro
dele roubaria a elipse do nome). É o **único** estado que vira marca permanente
na lista, porque é o único que muda o que o modelo recebe.

Ela chegou a ser removida — num processo com 43 de 44 peças extraídas, o mesmo
glifo em toda linha vira o muro que a lista existe para evitar — e **voltou**:
sem ela, terminar a extração de uma peça não mudava nada na tela. Muro honesto
vence estado invisível. Não usa `--cat-*` (semântica de espécie) nem azul (cor
de ação), e o itálico que a acompanhava saiu: repetia o sinal cobrando
legibilidade de títulos que já são truncados.

O par dela é o **desfazer**, com ícone próprio (`SVG.voltarDoc`) e no hover.
Reusar o glifo de extrair fazia o botão parecer oferecer a mesma ação de novo —
e um segundo ícone permanente na mesma linha seria ruído sobre estado resolvido.

### Confirmação com saída segura (`.cb-alt`)

`confirmarVisual` aceita uma **segunda ação**, subordinada à primária. Numa
decisão em bloco sobre conjunto misto, "sim ou não" é escolha falsa: o que se
quer quase sempre é *"faça na parte que não perde nada"*. A recomendada sobe
para linha própria em largura total (`order: -1; flex-basis: 100%`) e a arriscada
fica ao lado do Cancelar — três botões enfileirados em 292px não caberiam, e a
opção certa não pode disputar espaço com a que destrói informação.

### Relatório de operação longa no chat (`.extrai-rel`)

Operação que leva minutos e pode custar dinheiro **não termina no `.status`**,
que é transitório, nem no card de progresso, que some. Vai para o chat como
`<details>`, irmão do `.falhas`: `--accent-bg` com barra `--ok` à esquerda
quando deu tudo certo (é confirmação, não aviso), trocando para o trio
`--warn-*` e abrindo sozinho quando alguma peça falhou. Presta contas **por
via** — o que foi grátis, o que foi pago e quanto, o que já estava pronto e não
precisou de nada.

### Card de progresso: `baixando` ≠ `loading`

`.prep-ic.baixando` (spinner cinza) e `.prep-ic.loading` (spinner azul) são
etapas com custos MUITO diferentes: baixar do PJe leva ~5,6 s por peça, porque o
servidor serializa; ler o texto localmente leva menos de meio segundo. Rotular a
espera do tribunal como "extraindo" faz o usuário culpar a extração — foi
exatamente o que aconteceu no primeiro teste real. Nenhum dos dois avança o
contador: só `done` e `erro`.

### Aviso dentro do card de progresso (`.prep-nota`)
Nota em aviso suave abaixo da barra, usada quando o download passa de 12 s por
peça. Aparece **durante** a espera, que é quando a informação vale: o gargalo
real do produto é a entrega serializada do PJe, e sem isso a extensão parece
travada quando na verdade está esperando o tribunal. Ver `#rede` no `help.html`.

### Estado vazio da conversa
Eyebrow + título serifado centrado; grade de 3 cartões de passo (número em
círculo `--accent-bg`/`--pje`); bloco "Comece por aqui" com chips pill que
**preenchem** o campo (nunca enviam); linha final com o guia completo.

### Rodapé de entrada
Faixa de ações com dot colorido por função (Jurisprudência `--pje`, Minutar
`--cat-decisao`, Mapa `--cat-prova`, Prompts `--cat-peticao`) e, à direita, o
selo do modelo ativo como pill com dot. Caixa de entrada com raio `--r-xl`,
borda `--line-input`, foco `--pje`; botão Enviar sólido. Abaixo, dicas de teclado
em `--fs-micro`.

### Larguras (do protótipo)
| Modo | Largura | Corpo | Coluna de peças | Cartões |
|---|---|---|---|---|
| Lateral | 460px | `column` | faixa de 390px no topo | 1 coluna |
| Modal | 1128px | `row` | 300px | 3 colunas |
| Tela cheia | 1536px | `row` | 340px | 3 colunas |

O ponto de virada é a **largura do painel**, não a da viewport — media query mede
a janela e erra no modo livre. Use `ResizeObserver` (já existe:
`atualizarLivreLargo`).

---

## 6. Restrições da plataforma

1. **`[hidden] { display: none !important }`** em todo CSS de página: qualquer
   regra de autor com `display` vence o atributo `hidden`, e o bloco "escondido"
   reaparece. Vale para `panel.css`, `ui.css`, `mapa.css`, `editor.css`,
   `modelos-page.css`.
2. **Nada de recurso externo** — sem CDN, sem Google Fonts, sem imagem remota. O
   painel roda na página do tribunal; as demais páginas têm CSP `script-src 'self'`.
3. **Conteúdo dos autos é hostil**: todo texto vindo de peça passa por
   `escapeHtml` antes de virar HTML. `renderMd` escapa **primeiro** e formata
   depois — essa ordem não pode inverter.
4. **Nunca `confirm()`/`alert()` nativos**: o diálogo vive fora do Shadow DOM e
   congela a extensão. Confirmação destrutiva é sempre em **dois cliques**.
5. **Nada de nome de arquivo ou pasta iniciado por `_`** na árvore da extensão: o
   prefixo é reservado (`_locales`, `_metadata`) e o Chrome recusa carregar tudo.

---

## 7. Checklist antes de mexer no frontend

- [ ] Li este arquivo e usei tokens, não literais.
- [ ] Se criei um token, adicionei-o à tabela acima **e** aos dois arquivos de
      variáveis (`panel.css` e o `:root` da página em questão).
- [ ] Não introduzi `font-size` fora da escala.
- [ ] Texto vindo dos autos está escapado.
- [ ] Testei o estado **vazio**, não só o preenchido.
- [ ] Testei no painel estreito (460px), não só no expandido.
- [ ] `[hidden]` continua funcionando nos blocos que criei.
