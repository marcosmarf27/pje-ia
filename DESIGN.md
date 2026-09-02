# DESIGN.md — sistema visual da extensão

> **Leia este arquivo antes de qualquer mudança de frontend.** Ele é a fonte de
> verdade do visual: cores, tipografia, espaçamento, raios, sombras e o
> comportamento dos componentes. Se uma mudança precisar de um valor que não
> está aqui, o certo é acrescentá-lo aqui primeiro — literais soltos no CSS são
> exatamente o que faz a interface "parecer poluída" mesmo com cada tela
> individualmente correta.

**Origem**: sistema desenhado no Claude Design (arquivo `Assistente dos Autos.dc.html`)
e implementado a partir do handoff. O protótipo é a referência visual; o código aqui
é a implementação real, não uma cópia da estrutura do protótipo.

A versão vigente é o **refinamento institucional** (v0.24): paleta petróleo
dessaturada, Newsreader + IBM Plex, ícones SVG e peso máximo 600. Ele **reverteu
duas decisões** do sistema anterior — o gradiente 96deg do cabeçalho (§2) e a
inversão de superfície entre lista e conversa (§2) —, ambas anotadas no ponto em
que aparecem. Ao encontrar código que ainda siga o desenho antigo, é código a
migrar, não um desvio a preservar.

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
| `--pje` | `#14607e` | Primária: links, foco, badges, ícones de ação, dots ativos |
| `--pje-2` | `#0e4459` | Hover da primária, texto de link sobre branco |
| `--pje-3` | `#0e4e69` | Hover de link, estados pressionados |
| `--hd` | `#0e4459` | Fundo do cabeçalho — **chapado** |
| `--mark-de` / `--mark-para` | `#2e7e9c` → `#175d79` | Quadrado da marca, **180deg** |
| `--btn-de` / `--btn-para` | `#1c6c8b` → `#125a78` | Botão primário (Enviar, Salvar), **180deg** |
| `--btn-de-h` / `--btn-para-h` | `#22789a` → `#0e4e69` | Hover do botão primário |
| `--line-focus` | `#6fa5b9` | Borda do campo em foco |
| `--ring` | `0 0 0 3px rgba(46,126,156,.13)` | Halo de foco, sempre junto de `--line-focus` |

> **A assinatura migrou do fundo para a marca.** Até a v0.23 o cabeçalho usava um
> gradiente diagonal de 96deg, e este documento proibia trocá-lo por cor chapada. O
> refinamento institucional inverteu a decisão: o cabeçalho é `--hd` **chapado**, e
> quem capta luz é o quadrado de 32px da marca (`--mark-de` → `--mark-para` em
> 180deg, com `inset 0 1px 0 rgba(255,255,255,.22)`). O motivo é posicional, não
> estético — o painel abre logo abaixo da barra do próprio PJe, que também é um azul
> largo; dois gradientes da mesma família empilhados liam como uma faixa só. Um
> realce de 32px não tem esse problema, e o botão primário passa a herdar o mesmo
> gradiente vertical, dando coerência a um elemento que antes era chapado.

### Texto

| Token | Valor | Uso |
|---|---|---|
| `--ink` | `#0e323f` | Títulos serifados, nome de peça em destaque |
| `--text` | `#0e323f` | Corpo de texto |
| `--text-2` | `#3e5561` | Itens de lista, rótulo de botão secundário |
| `--text-3` | `#234e5e` | Chip de exemplo, texto sobre superfície tingida |
| `--muted` | `#6b7c85` | Texto de apoio, descrições |
| `--muted-2` | `#74858e` | Meta-informação, contadores |
| `--muted-3` | `#93a3ac` | Placeholders, ícones inativos |
| `--eyebrow` | `#a0aeb6` | Eyebrow mono uppercase (ver §3) |

### Superfícies

| Token | Valor | Uso |
|---|---|---|
| `--surface` | `#ffffff` | Painel, cartões, campos |
| `--surface-2` | `#fafcfc` | **Coluna de peças**, rodapé de entrada |
| `--surface-3` | `#ffffff` | **Área de conversa** |
| `--surface-card` | `#fcfdfd` | Cartão de passo, acordeão de chave |
| `--surface-list-ft` | `#f4f8f9` | Rodapé da lista de peças (`.docs-tip`) |
| `--hover` | `#eff4f6` | Hover de linha da lista |
| `--hover-2` | `#f5fafc` | Hover de chip/ação |
| `--accent-bg` | `#dfeaee` | Badge e pill de contagem |
| `--accent-bg-2` | `#e4edf0` | Número dos passos |
| `--canvas` | `#e9eef3` | Fundo atrás de páginas (editor, modelos) |

> **A conversa é branca e a lista é que fica tingida** — até a v0.23 era o inverso
> (`--surface-3` valia `#f5f9fc` e a lista era branca). Inverter põe o peso visual
> onde está o trabalho, que é o texto da resposta, e tira a coluna de navegação da
> disputa por atenção com a leitura. Como os dois tokens trocaram de papel e não só
> de valor, conferir cada uso de `--surface-2`/`--surface-3` ao migrar.

### Linhas

| Token | Valor | Uso |
|---|---|---|
| `--line` | `#e2eaee` | Divisórias, bordas de rodapé |
| `--line-2` | `#edf1f3` | Divisória suave dentro de blocos |
| `--line-card` | `#e4ebee` | Borda de cartão |
| `--line-input` | `#dae3e8` | Borda de campo |
| `--line-strong` | `#d8e2e6` | Borda de botão com contorno |
| `--line-check` | `#c3cfd5` | Checkbox |

### Categorias de peça

São **semânticas** — a cor identifica a espécie do documento na lista, nos chips,
no popup `@` e no mapa mental. Não reutilizar para outros fins.

| Token | Valor | Espécie |
|---|---|---|
| `--cat-decisao` | `#de8b2c` | Decisões, sentenças, despachos |
| `--cat-audiencia` | `#2f9268` | Atas e audiências |
| `--cat-peticao` | `#6a62c0` | Petições das partes |
| `--cat-prova` | `#c1508a` | Laudos, perícias, provas |
| `--cat-outro` | `#b7c4cb` | Demais documentos (neutro) |

> **Por que petições deixou de ser azul**: azul é a cor de *ação* do sistema
> (`--pje`). Uma categoria azul na lista competia com botões e links, e o usuário
> não conseguia dizer se o azul significava "petição" ou "clicável". Petições
> passou a roxo e provas a magenta, mantendo dourado/verde onde já estavam.

### Estados

| Token | Valor | Uso |
|---|---|---|
| `--ok` | `#2f9268` | Sucesso, salvo, chave configurada |
| `--ok-bg` | `#eaf4ef` | Fundo de confirmação suave (marca da peça em texto) |
| `--ok-line` | `#cbe3d8` | Borda do banner de estado "Pronto para usar" |
| `--ok-ink` | `#1e5c44` | Texto sobre confirmação suave |
| `--sig-hd` | `#143f33` | Cabeçalho do painel no modo sigiloso |
| `--sig-mark-de` / `--sig-mark-para` | `#35946e` / `#1d6248` | Quadrado da marca no modo sigiloso |
| `--sig-btn-de` / `--sig-btn-para` | `#2f9268` / `#1f6a4b` | Botão primário e launcher no modo sigiloso (hover `#35a074` / `#1a5c41`) |
| `--sig-tarja` | `#a7d2bd` | Hachura da tarja do modo sigiloso |
| `--sig-halo` | `rgba(47,146,104,.28)` | Halo externo da janela e do campo em foco no modo sigiloso |
| `--sig-hd` | `#143f33` | Cabeçalho do painel no modo sigiloso |
| `--sig-mark-de` / `--sig-mark-para` | `#35946e` / `#1d6248` | Quadrado da marca no modo sigiloso |
| `--sig-btn-de` / `--sig-btn-para` | `#2f9268` / `#1f6a4b` | Botão primário e launcher no modo sigiloso (hover `#35a074` / `#1a5c41`) |
| `--sig-tarja` | `#a7d2bd` | Hachura da tarja do modo sigiloso |
| `--sig-halo` | `rgba(47,146,104,.28)` | Halo externo da janela e do campo em foco no modo sigiloso |
| `--warn` | `#de8b2c` | Alerta, contexto quase cheio |
| `--warn-bg` | `#fbead2` | Fundo de aviso suave |
| `--warn-line` | `#eeddba` | Borda de aviso suave |
| `--warn-ink` | `#a96b14` | Texto sobre aviso suave |
| `--erro` | `#a5301f` | Erro, exclusão armada |
| `--erro-hd` | `#b4402f` | Hover do ✕ no cabeçalho |

> **Aviso suave × `.alertbar`.** O trio `--warn-*` veste o que **informa sem
> impedir de continuar**: o relatório de peças que não baixaram, a nota de
> download lento, o estado "voltar ao documento". A `.alertbar` é o contrário —
> ela aparece quando algo **bloqueia** o envio (contexto cheio, troca de
> provedor) e usa vermelho-tijolo, mais forte de propósito. Não trocar um pelo
> outro: se tudo alerta com a mesma intensidade, nada alerta.

> **O trio `--alerta-*` vale também DENTRO da resposta** (o `[!ALERTA]` do
> `.callout`, §5). Ele deixou de significar só "a interface está bloqueada" e
> passou a significar **atenção máxima**, venha de onde vier — o bloqueio de um
> envio ou um risco apontado no conteúdo. É deliberado: a cor é a mesma para o
> usuário não precisar aprender duas escalas de gravidade na mesma tela.

### Temas

Cinco paletas, escolhidas pelo botão de aparência no cabeçalho do painel ou pelo
campo em Configurações. **Um tema é um bloco de OVERRIDES de token sobre o
`.wrap` — nenhuma regra de componente muda, nenhum seletor novo nasce.** É o
mesmo gesto que `.wrap.sigiloso` já fazia desde a v0.55 trocando
`--hd`/`--mark-*`/`--btn-*` pela família `--sig-*`; reconhecer esse molde é o
que fez os temas custarem um bloco de tokens em vez de uma arquitetura.

| Tema | `data-tema` | Chrome | O que ele é |
|---|---|---|---|
| Azul TecJustiça | *(ausente)* | `#0e4459` | O padrão. **Byte a byte o de sempre** |
| Noite | `noite` | `#0b161d` | Escuro tinta-petróleo, para o trabalho noturno ao lado da página branca do PJe |
| Papel | `papel` | `#eef3f6` | Chrome clara; só a marca fica saturada |
| Vidro | `vidro` | `rgba(10,50,68,.52)` | Placa fosca: a página do tribunal atravessa desfocada. Chrome TINGIDA — sobre papel branco, véu claro é véu invisível |
| Toga | `toga` | `#46202a` | Vinho na chrome; a **ação continua azul** |
| Rosa | `rosa` | `#a82c63` | Magenta-rosado; aqui a **ação acompanha** |

**ATRIBUTO, não classe.** A especificidade 0,2,0 de `[data-tema]` vence o
`.wrap` base sem depender da ordem no arquivo, e o tema não entra na mesma
dimensão das classes de MODO (`.sigiloso`, `.expanded`, `.estreito`), que se
combinam livremente com ele.

**O que varia e o que NÃO varia.** Variam superfície, tinta, linha, chrome, véus
e a família `--sig-*`. **Não varia o MATIZ dos tokens semânticos** — `--cat-*`,
`--ok`, `--warn`, `--alerta` —, porque ali a cor **é o dado**: um
`--cat-decisao` que mudasse de tema para tema quebraria a semântica de categoria
que este §2 estabeleceu. O que se ajusta neles é só a LUMINOSIDADE das variantes
`-bg`, `-line` e `-ink`, para o contraste sobreviver ao fundo escuro. A regra em
uma frase: **matiz constante, luminosidade ajustada.**

> **Toga tinge a chrome, nunca a AÇÃO.** Vermelho neste produto é `--alerta` — o
> que pode levar a erro de decisão. Um botão primário vinho ao lado de uma barra
> de alerta vermelha apagaria a fronteira entre "informa" e "impede" que este §2
> construiu. Por isso `--pje` e `--btn-*` continuam azuis no Toga.

> **O Vidro exigiu uma separação de token, e ela é a lição da rodada.** A
> primeira versão não era vidro: o `.panel` pintava `var(--surface)` — branco
> OPACO — e o cabeçalho é filho dele. `backdrop-filter` filtra o que está
> pintado ATRÁS do elemento, e atrás do cabeçalho estava o branco do próprio
> painel. Desfocar branco dá branco, e o resultado foi um cinza lavado.
> **Enquanto o fundo da JANELA e o fundo de um CARTÃO eram o mesmo token, vidro
> era impossível** — daí `--surface-painel`, idêntico a `--surface` no padrão e
> translúcido só aqui.

> **Uma placa de vidro, não cinco.** O desfoque mora no `.panel` e só nele:
> `backdrop-filter` aninhado refiltra o que o pai já filtrou e embarra. As
> superfícies de dentro são apenas VÉUS de cor sobre a mesma placa — é assim que
> vidro real se comporta. E **não** no `.wrap`: `backdrop-filter` cria bloco de
> contenção para descendentes `position: fixed`, e os popovers são filhos dele.

> **TRANSPARÊNCIA SÓ SE VÊ ONDE O VÉU DIFERE EM LUMINOSIDADE DO QUE ESTÁ
> ATRÁS** — é a regra do tema, e ela custou uma versão. A página do PJe é papel
> branco. Um véu quase-branco sobre papel branco é invisível em QUALQUER alfa:
> o desfoque não tem o que revelar, e o resultado é um painel branco. Por isso a
> chrome é `rgba(10,50,68,.52)`, tingida e mais escura que a página: aí o olho
> lê "estou olhando ATRAVÉS de algo" na primeira fixação, sem precisar procurar.

> **A receita corrente de glassmorphism ("superfície luminosa") pressupõe fundo
> escuro ou colorido.** Sobre papel de tribunal ela se inverte. Uma versão deste
> tema seguiu a receita, clareou a chrome e perdeu o efeito inteiro. Ao portar
> um padrão visual, conferir a premissa dele sobre o FUNDO — aqui o fundo é dado
> e não temos como escolhê-lo.

> **Vidro é moldura, não superfície de leitura.** As bolhas da resposta, o campo
> e os popovers ficam OPACOS (`--surface` intocado): cartões sólidos flutuando
> sobre a placa, que é a leitura de profundidade que se quer. A lista fica em
> 0,22 — subi-la a 0,62 para conter o texto do tribunal por baixo dos nomes
> apagava o efeito junto, e o ruído não aparece na medição. Em tela cheia não há
> nada atrás: o desfoque é desligado e o tema degrada para o institucional —
> comportamento correto, não falta.

> **Rosa é o único tema em que a AÇÃO acompanha a chrome.** O que impede o Toga
> de tingir o botão primário é o vinho ficar perto demais do vermelho-tijolo de
> `--alerta`; o rosa é magenta, fica a ~40° dele, e `--alerta` aparece como fundo
> claro com tinta escura, nunca como botão sólido. Um tema rosa com botão azul
> pareceria pela metade.

**Três tokens nasceram do saneamento que os temas exigiram**, e os três existiam
antes como literais espalhados pelas regras — onde nenhum tema os alcançava:

| Token | Era | Papel |
|---|---|---|
| `--on-hd-forte` | `color: #fff` em 12 regras | Tinta sobre o CABEÇALHO. Vira escura no Papel |
| `--on-acao` | `color: #fff` em 23 regras | Tinta sobre superfície de AÇÃO. Não muda em tema nenhum — o botão continua saturado —, mas fica explícita para a exceção ser decisão e não esquecimento |
| `--veu-1..3`, `--veu-borda`, `--veu-luz`, `--veu-pega` | `rgba(255,255,255,a)` no cabeçalho | As películas que dão relevo à chrome. **Invertem** para película escura no Papel |

E `background: #fff` em 29 regras virou `var(--surface)`: num tema escuro cada
uma delas era um cartão branco no meio da noite.

> **A cor de texto BASE do painel não existia.** `:host { all: initial }` deixa
> `canvastext` (preto), e a bolha da resposta não declara `color` — ela herda.
> Sobre a conversa branca isso sempre funcionou; num tema de superfície escura
> vira texto invisível (**medido: 1,3:1** na resposta do Noite). A declaração
> `color: var(--text)` existe agora, e **só para o painel tematizado**
> (`.wrap[data-tema] .panel`), para o tema padrão continuar idêntico — há teste
> que compara 25 mil propriedades computadas.

**Contraste conferido por medição, não por olho**: os oito pares tinta/superfície
que decidem a legibilidade passam o mínimo AA (4,5:1) nos cinco temas. Dois
pares ficam em 4,1–4,2 (`--muted` sobre superfície clara) — e **já ficavam no
tema padrão de hoje**: é dívida anterior, não regressão dos temas.

---

## 3. Tipografia

```css
--ff-sans:  "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
--ff-serif: "Newsreader", Georgia, "Times New Roman", serif;
--ff-mono:  "IBM Plex Mono", "Cascadia Mono", Consolas, monospace;
```

- **Sans** para interface. Plex Sans e Plex Mono são a mesma superfamília, então
  rótulo e numeral compartilham construção e não brigam lado a lado.
- **Serif** para títulos — "Peças do processo", "Como posso ajudar?", nomes de
  página, chips de exemplo. É o que dá o tom forense sem recorrer a ornamento.
- **Mono** para **numerais que o usuário compara ou copia** (o id da peça) e para
  **eyebrows** uppercase. Tabular, alinha na vertical, não se confunde com o nome.

> **As fontes são vendorizadas, nunca carregadas de CDN.** Um `<link>` para
> `fonts.googleapis.com` seria barrado pela CSP de vários tribunais e, pior, faria
> uma requisição a servidor externo a partir da tela dos autos — vazamento que a
> extensão não pode causar. Os `.woff2` (todos SIL OFL) vivem em `vendor/fontes/`,
> declarados num arquivo único: **`src/fontes.css`**.
>
> **O painel não pode declarar `@font-face` no próprio CSS**, por duas razões
> independentes e ambas fatais em silêncio:
> 1. `@font-face` dentro de shadow tree é **ignorado** pela spec de CSS Scoping, e
>    o Chrome cumpre — a família nunca seria registrada e tudo cairia no fallback,
>    sem erro no console.
> 2. `panel.css` é injetado como TEXTO, então uma `url()` relativa resolveria
>    contra o host do tribunal e daria 404 mudo.
>
> Por isso `injetarFontes()` em `panel.js` faz fetch de `fontes.css`, troca o
> prefixo `../vendor/fontes/` por `chrome.runtime.getURL(...)` e injeta o
> resultado num `<style id="pje-ia-fontes">` **no `document.head` da página**.
> Injetar só `@font-face` ali é inócuo: registra nomes, não altera estilo algum da
> página. As páginas da extensão usam o mesmo arquivo por `<link>` simples, onde o
> caminho relativo já resolve certo.
>
> As fontes estão em `web_accessible_resources`. A stack de fallback continua
> declarada: se algum tribunal barrar `font-src chrome-extension:`, o painel
> degrada para Segoe UI/Georgia sem quebrar layout.

### Peso

Três pesos, e **`700` não é um deles**. Até a v0.23 o painel usava 700 em 23
lugares; o sistema refinado distribui tudo entre 400/500/600. Peso é o eixo que
mais afeta a sensação de "densidade" da interface — 700 em rótulo de 12px lê como
ruído, não como ênfase.

| Peso | Uso |
|---|---|
| 400 | Corpo de texto, parágrafos, itens de lista não destacados |
| **500** | **O peso padrão dos controles**: rótulo de botão, segmented inativo, chip, meta, selo do modelo |
| 600 | Títulos serifados, nome de peça em destaque, rótulo de campo, segmented ativo, botão primário |
| ~~700~~ | **Não usar.** |

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

A escala vale nas **cinco** folhas, não só no painel: `ui.css`, `editor.css`,
`modelos-page.css`, `mapa.css` e o `<style>` inline do `help.html` também. Elas
ficaram para trás numa rodada e acumularam 71 literais — com 25 meios-pixels
(10,5 / 11,5 / 12,5 / 13,5 / 14,5) — que é exatamente a variação sem intenção
que a escala existe para impedir. Ao arredondar, o degrau é o **mais próximo** e
empate sobe (16 → `--fs-lead`).

> A tipografia forense da folha A4 (`.jodit-wysiwyg`: Times 12**pt**, 1,5,
> recuo 1,25cm) **não** é interface e fica fora da escala — ela precisa bater
> com `editor-docx.js`, que é o que se imprime.

---

## 4. Espaço, raio, sombra

```css
/* espaço — oito degraus. --sp-2b e --sp-3b entraram no refinamento: o sistema
   trabalha muito na faixa 6–12px, e saltar de 6 para 10 (+66%) se via. */
--sp-1: 4px;  --sp-2: 6px;  --sp-2b: 8px;  --sp-3: 10px;
--sp-3b: 12px;  --sp-4: 14px;  --sp-5: 20px;  --sp-6: 28px;

--r-xs: 4px;    /* checkbox */
--r-tight: 6px; /* botão de 24px, segmento dentro de segmented */
--r-sm: 7px;    /* botão do cabeçalho, cluster interno */
--r-md: 8px;    /* botão, item de lista, segmented externo */
--r-ctrl: 9px;  /* campo de busca, marca, cluster do cabeçalho, Enviar */
--r-box: 10px;  /* cartão de chave, botão de 44px, cartão de provedor */
--r-lg: 11px;   /* cartão de passo */
--r-xl: 12px;   /* caixa de entrada */
--r-2xl: 14px;  /* moldura externa do painel */
--r-pill: 20px; /* chip, badge, selo do modelo — NÃO 999px */

--sh-card:  0 1px 2px rgba(14, 50, 63, 0.04);
--sh-seg:   0 1px 2px rgba(14, 50, 63, 0.10);  /* pill ativo do segmented */
--sh-btn:   0 1px 2px rgba(14, 50, 63, 0.22), inset 0 1px 0 rgba(255,255,255,0.18);
--sh-pop:   0 1px 2px rgba(14, 50, 63, 0.10), 0 24px 60px -18px rgba(14, 50, 63, 0.34);
--sh-bar:   0 -10px 14px -10px rgba(14, 50, 63, 0.22);  /* faixa de ação grudada (popup) */
--sh-panel: 0 1px 2px rgba(14, 50, 63, 0.10), 0 24px 60px -18px rgba(14, 50, 63, 0.34);
```

**`--r-pill` é 20px, não `999px`.** Num chip de 26px de altura a diferença é
invisível; num selo de 30px o `999px` arredonda até virar cápsula, e a cápsula
destoa dos raios de 8–12px de tudo em volta. 20px mantém a família.

O `--sh-btn` do botão primário tem **duas camadas**: a sombra projetada e um
`inset` branco no topo. É o inset que faz o gradiente vertical parecer uma
superfície iluminada em vez de um degradê chapado — não removê-lo ao ajustar.

Transições: `140ms ease` para cor/borda/fundo; `120ms ease` para hover de lista.
Nunca animar `width`/`height` de container com conteúdo (reflow visível).

---

## 5. Componentes

### Cabeçalho do painel
Altura **60px** (64px nos modos largos), fundo `--hd` **chapado**, texto branco. À
esquerda: marca 32×32 com `--r-ctrl`, gradiente `--mark-de`→`--mark-para` (180deg) e
`inset 0 1px 0 rgba(255,255,255,0.22)`, seguida de **duas linhas** — nome do produto
em `--ff-serif` (`--fs-lead`, peso 500) e, abaixo, o **número CNJ** em `--ff-mono`,
`--fs-nano`, `letter-spacing: .03em`, cor `#93bacA`. Nos modos largos o CNJ ganha
uma segunda informação ao lado (classe e órgão julgador), separada por barra
vertical de 1px `rgba(255,255,255,0.22)`.

À direita, os botões vivem em **clusters** — não soltos: cada grupo é um
`background: rgba(255,255,255,0.07)`, `--r-ctrl`, `padding: 3px`, `gap: 2px`. São
três: `[baixar · conversas guardadas · nova conversa]`, `[modos de layout]` e `[✕]`
isolado. Botões 30×30 (32 nos largos), `--r-sm`, transparentes, hover
`rgba(255,255,255,0.16)`; o modo ativo fica com esse mesmo fundo fixo. O ✕ tem
hover `--erro-hd`.

> **A única exceção ao botão quadrado é o de conversas guardadas** (`.convs`):
> `width: auto` com o **contador** ao lado do ícone (`--ff-mono`, `--fs-nano`,
> num `<span>` próprio — `textContent` no botão apagaria o `<svg>`). O motivo é
> um relato de uso: listar e criar conversa eram dois desenhos de balão vizinhos
> e, a 15px, ninguém adivinhava qual era qual. Duas correções juntas — o ícone
> de **nova conversa** ganhou a CRUZ dentro do balão (o sinal universal de
> criar) e o de **lista** ganhou o número, que diz o que o desenho não conseguia
> dizer ("há 3 conversas aqui dentro"). Ícone só não basta quando dois ícones
> vizinhos pertencem à mesma família visual.

> **O cluster substituiu o separador de 1px** que ficava antes do ✕. Sete botões
> lado a lado exigiam um separador justamente porque não se lia onde um grupo
> terminava; agrupando por função, o agrupamento faz esse trabalho e ainda diz
> *quais* botões são parentes entre si — que o separador não dizia.

> Mostrar o CNJ no cabeçalho não é decoração: o usuário costuma ter vários
> processos abertos em abas, e era impossível saber a qual deles o painel se
> referia sem olhar a página atrás.

### Lista de peças
Fundo `--surface-2`. Cabeçalho com título serifado + badge de contagem (pill
`--accent-bg`, alinhado por **baseline**) + botão recolher «. Busca com **lupa SVG**
posicionada em `left: 11px`, foco `--line-focus` + `--ring`. **Segmented control**
`chave | principais | todas`: três botões, o ativo com fundo `--surface` + `--sh-seg`
e texto `--ink`, o inativo transparente com `--muted-2` e peso 500; moldura
`--r-md` sobre `#ebf1f3`. **À direita do segmented, o contador "N marcadas"** em
`--ff-mono`/`--fs-micro`/`--muted-3` — a contagem do que está selecionado é a
resposta à pergunta que o degrau acabou de gerar, e ficava longe demais no rodapé.
Legenda de categorias com dots de **6px**. Itens: checkbox 15px (`--r-xs`) + dot
6px da categoria + nome (`--fs-ui`, peso 600 se destacado / 400 se não) +
**id em `--ff-mono`**, `--fs-nano`, cor `--muted-3`. Rodapé `--surface-list-ft`.

> **O nome da peça manda na largura da linha, e pode ocupar mais de uma.**
> `-webkit-line-clamp` de **2 linhas**, **3** onde a lista é coluna (`.expanded`,
> `.full`, `.livre-wide`) — mesma lógica dos rótulos `.op-l`/`.op-s`: na coluna de
> 328px cabem ~24 caracteres por linha e o título médio do PJe passa dos 48 de duas
> linhas; na faixa de 420px são ~40, e ali cada linha extra custa uma peça a menos
> na gaveta. É teto, não altura fixa: "Sentença" continua em uma linha.
> A row alinha por `flex-start` (checkbox, dot, id e `.d-ver` acompanham a
> PRIMEIRA linha do nome, não o centro da row).
>
> **O `.d-ver` (ir para a peça na linha do tempo do PJe) é VISÍVEL em repouso**,
> em `--muted-2` a `opacity: .55` — não `opacity: 0` até o hover, como já foi.
> Ação que só aparece depois de um gesto que ninguém tem motivo para fazer é
> ação que ninguém descobre; foi a mesma falha das três affordances do "ocultar
> peças". Mostrá-lo sempre não polui porque ele ocupa a MESMA posição em toda
> row: o olho o lê como coluna. São três degraus — existe (repouso), é alvo
> (hover da row: `opacity: 1` + `--pje-2`), vai ser clicado (hover do botão:
> fundo `--accent-bg` + `scale(1.08)`, suprimido em `prefers-reduced-motion`).
> O ícone é o **crosshair** de 13px: "localizar", e não a seta ↗ de abrir —
> nada é aberto, a página que já está atrás do painel é que rola até a peça.
>
> **Nenhum outro campo divide a linha com o nome além do id.** Tipo oficial e data
> de juntada vivem no `title` da row. A data já esteve na linha, em coluna própria,
> e era o pior negócio da lista: ~60px dos 328px tirados do único campo por onde se
> escolhe a peça, para responder o que a ordem cronológica da lista já responde.
> Campo novo aqui entra no tooltip ou no preview — não na linha.

> **O `<input type=checkbox>` de cada segmento fica fora da tela**
> (`position:absolute; opacity:0`), nunca `display:none`: ele continua sendo a
> fonte de verdade do estado e o par `label`+`input` mantém a acessibilidade
> nativa (foco por teclado, espaço para alternar, leitor de tela). Isso exige
> `:has(input:focus-visible)` no `.all`, senão o anel de foco desaparece junto.
> Esconder o checkbox devolve ~18px por segmento — é o que faz os três caberem
> nos **292px** da coluna do modo expandido, que é o pior caso de largura, mais
> estreito que os 432px do modo flutuante.
>
> Os rótulos têm versão longa e curta (`.op-l`/`.op-s`), mesmo padrão do medidor
> (`.g-full`/`.g-short`), com a lógica invertida: encurtam nos modos LARGOS,
> porque lá a lista é uma coluna estreita, e não uma faixa larga.
>
> **`.sel-nota`** (linha própria abaixo do controle, ocupando 100% da largura):
> diz o que o clique fez e por que pode ter feito menos do que se esperava —
> nenhuma peça reconhecida no degrau, ou lista ainda sem o tipo oficial da grid.
> Usa o trio de aviso **suave** (`--warn-bg`/`--warn-line`/`--warn-ink`), nunca a
> `.alertbar`: informa sem impedir de continuar. Some no gesto seguinte.

A faixa abaixo da lista (`.docs-tip`) hospeda as ações que valem para a **lista
inteira** — hoje `⟳ Carregar tudo`, `✨ Escolher com IA` e `⬇ Baixar .zip`. As três
compartilham a MESMA regra de estilo (`.tip-load, .tip-zip, .tip-ia`) de propósito:
são irmãs, e regras separadas divergiriam com o tempo. Ação nova de escopo "lista
toda" entra aqui, não na `.toolbar` — aquela linha já vive no limite em 484px.

O `!` (`.tip-i`) **fecha a fileira à direita**, não a abre: ele é indicador de
ESTADO da lista, e ação vem antes de estado no eixo de leitura — a mesma anatomia
da `.metarow` do rodapé. Aberta pelo ícone, a faixa dava a primeira posição a um
aviso secundário.

> **A faixa é de UMA fileira, sempre — e isso é incondicional.** Quem cede
> quando falta espaço é o rótulo de `Carregar tudo` (ellipsis), nunca a linha; a
> única quebra permitida é a do texto do aviso, que ocupa a fileira inteira
> abaixo. Incondicional porque `wrap` + `margin-left: auto` põe o `!` **sozinho**
> numa segunda fileira quando falta um punhado de pixels.
>
> **O que é condicional é o RÓTULO**, e o gatilho é a lista ser estreita — o que
> acontece por DUAS vias independentes: painel abaixo de 520px (`.estreito`) e a
> **coluna** de 328/372px dos modos largos (`.expanded`, `.livre-wide`). A regra
> nasceu só dentro do bloco `.estreito` e por isso o pior caso ficava sem defesa
> nenhuma: no expandido o painel tem 1180px — nada dispara `.estreito` —, mas a
> coluna tem 328px e os três botões com rótulo somam ~416px, então a fileira
> quebrava em duas com um buraco à direita da primeira. É a mesma lógica dos
> rótulos `.op-l`/`.op-s` do segmented: encurtar nos modos LARGOS, porque lá a
> lista vira coluna. Por ser regra do COMPONENTE, e não de um modo, ela vive
> junto da `.docs-tip`. Fora dessas classes sobra um caso só — a janela livre
> entre 520 e 740px, onde a lista é faixa de até 712px e os três rótulos cabem
> com folga; escondê-los ali seria perder informação sem motivo.
>
> Cuidado com o seletor que libera a quebra quando o aviso aparece: os gatilhos
> são `.carregando` e hover/foco no ícone, os MESMOS três que revelam o
> `.tip-txt`. Testar `:has(.tip-txt:not([hidden]))` **casa sempre** — o
> `.tip-txt` nunca recebe o atributo `hidden`, quem o esconde é `display:none` —
> e, com especificidade maior, devolvia `flex-wrap: wrap` em repouso: a fileira
> única existia no papel e não na tela.

### Movimento: quatro durações, três curvas, e nada fora delas

`--dur-1` (140ms) para feedback e saídas curtas, `--dur-2` (220ms) para
ENTRADAS de interface e para a saída da janela, `--dur-3` (300ms) para mudanças
de layout (colapso da lista, backdrop) e `--dur-4` (380ms) para a JANELA —
abrir, e a troca de modo. `--ease-out` entra e assenta, `--ease-in` sai do
caminho, `--ease-move` liga dois estados.

**Os números subiram na v0.56, e a razão é uma medição.** A v0.55 tinha três
degraus de 120 a 240ms, com a janela abrindo de `scale(0.985)` e 6px. O usuário
relatou "nenhuma animação" numa máquina em que `prefers-reduced-motion` estava
DESLIGADO — conferido pelo Chrome dele — e o headless mostrou as transições
correndo com esses valores. Isto é: o CSS estava certo e era **invisível**.
Movimento que só um teste enxerga não comunica nada, e o objetivo de animar é
comunicar (de onde a janela veio, para onde a lista foi). Hoje a janela nasce
do botão a 72% e 20px, em 380ms; fecha em 220ms voltando para ele. Ainda sem
bounce — o teto de "acima de ~300ms parece lento" vale para feedback, não para
a única transição da tela que reposiciona 400×600px.

**A troca de modo é um FLIP** (`flipJanela` em panel.js): os modos trocam
`position`, tamanho, `top/left` e até o `transform` de centragem — nada disso
interpola entre `absolute` e `fixed` por transição CSS. Mede-se o retângulo
antes, aplica-se o modo, mede-se depois, e uma animação WAAPI no `transform`
leva do velho ao novo. Corre no compositor. A `transform` BASE do modo de
destino (o `translate(-50%, -50%)` do expandido) entra nos dois keyframes, lida
já em px do estilo computado — sem ela o primeiro frame perde a centragem.
Desligado sob `prefers-reduced-motion`.

**Cada modo largo tem o próprio estado FECHADO** (`.wrap.expanded:not(.open)
.panel` etc.). `.wrap.expanded .panel` fixa `transform: translate(-50%, -50%)`
com a mesma especificidade da regra de fechado e vinha depois no arquivo: no
expandido, no lateral e no livre a janela abria e fechava sem movimento nenhum,
só um corte de opacidade. O `:not(.open)` sobe a especificidade e dá a cada modo
uma partida coerente com a origem — o modal encolhe no centro, a lateral desliza
da borda direita, a janela livre encolhe onde está.

O limite é o mesmo da tipografia: sete degraus em vez de treze tamanhos com
meio-pixel. **Variação sem intenção é o que faz a interface parecer poluída
mesmo com cada peça correta** — e em movimento isso aparece como "cada coisa
aqui se mexe de um jeito". Acima de ~300ms a interface começa a parecer LENTA,
que é o oposto do que a animação existe para comunicar. **Nada de bounce**: isto
é ferramenta de trabalho jurídico.

A **direção** da curva carrega quase toda a informação, muito mais que a curva
exata: o que entra desacelera (chega e assenta), o que sai acelera (o usuário já
decidiu — segurá-lo é cobrar pedágio pelo próprio clique).

**Sem biblioteca de animação, e a regra que decide é a de sempre**: nenhum bundle
entra em página de tribunal. GSAP + Draggable custariam ~100 KB em TODA página
`jus.br` — inclusive as de login, onde o painel nem monta — para entregar o que
`@starting-style`, `transition-behavior: allow-discrete` e `linear()` fazem
nativamente. Medido no Chrome desta máquina: as três disponíveis, mais
`interpolate-size` e `calc-size()`. É o mesmo argumento que manteve o JSZip, o
`markmap-lib` e três bibliotecas de tour fora do projeto.

**E há um motivo próprio do produto para preferir CSS a JS**: as bibliotecas de
animação correm no `requestAnimationFrame`, que o Chrome CONGELA em aba de
segundo plano. Este projeto já foi mordido por isso TRÊS vezes (o primeiro
desenho do mapa mental, a primeira pintura do tour e o `render()` do pdf.js no
OCR), e abrir processos com Ctrl+clique em várias abas é o padrão de trabalho no
PJe. Transições correm na linha do tempo do documento e não têm esse modo de
falha.

**Onde há movimento hoje, e por quê**: a janela (abrir/fechar e a troca de
modo), o backdrop do modal (esmaece em `--dur-3`, com `allow-discrete`), o
launcher (volta crescendo de `scale(0.5)`), o painel erguido no arrasto, o
colapso da lista de peças, a tarja do modo sigiloso, as **bolhas do chat** e a
**barra de alerta**. As bolhas eram o elemento mais visto do produto e
o único sem movimento nenhum; elas SOBEM nos dois papéis, porque a do usuário vem
do campo e a do assistente vem do fim da conversa — as duas nascem de onde a
atenção já está. A `.alertbar` faz o contrário e CAI: ela é interrupção, e a
convenção de uma faixa que interrompe é vir de cima.

**A peça que a EXTENSÃO marca sozinha acende** (`.docrow.acesa`): o "Escolher com
IA" e o botão da peça citada como faltante mexem na seleção sem um clique na
linha, e sem sinal a lista simplesmente amanhece diferente. O realce some sozinho
— marca permanente viraria mais um estado a manter — e não tem override de
`prefers-reduced-motion`, porque um esmaecimento de cor não é movimento e aqui
ele É a informação.

**Antes de animar algo, conferir se já anima.** A `.minutabar`, a `.mapabar` e a
`.promptbar` já entravam por `animation: chip-in`, e `animation` vence
`transition` na mesma propriedade: uma transição declarada para elas seria código
morto com um comentário afirmando o contrário — e o `allow-discrete` junto lhes
daria uma SAÍDA de 120ms que elas não tinham, deixando a faixa presa na tela
depois de fechada. Medido: elas computam `scale(0.85)`, o `from` do `chip-in`.

**Entradas e saídas de elementos que somem do layout** usam `@starting-style` +
`transition-behavior: allow-discrete`, nunca um par animação-de-entrada +
`display:none` seco. É o que dá os DOIS sentidos com um par de regras — e o que
mantém o elemento visível durante a saída, apesar do `display: none`.

**`prefers-reduced-motion` não desliga: encurta.** As durações caem para 1ms e o
DESLOCAMENTO some; nada de `0s`, que pode fazer o navegador pular a transição
discreta e deixar um painel preso em `display:flex`. A regra do projeto é "menos
movimento, não menos informação" — a sombra do arrasto, por exemplo, permanece,
porque ela não é movimento, é profundidade.

### Modo sigiloso: o painel troca de cor (`.wrap.sigiloso`)

Um MODO que muda **o que sai da máquina** não pode viver só num botão. O botão
responde "eu liguei isto"; o que se precisa é "eu **estou** aqui" — e essa é a
diferença entre um controle e um ambiente. Por isso a classe veste o painel
INTEIRO, e não só o controle que a ligou.

**A chrome inteira muda de família, o conteúdo não.** A v0.55 apostou em
"moldura, nunca superfície" com uma borda de 1px, uma faixa clara e o campo
de mensagem — e o usuário leu aquilo como "uma coisinha verde", sem destaque e
sem mudar a janela. Estava certo: uma borda de 1px não anuncia um estado, e o
estado aqui é o que decide se o PDF sai da máquina. Hoje, com o modo ligado, o
**cabeçalho** troca o azul institucional pelo verde profundo (`--sig-hd`), o
quadrado da marca e o botão primário (Enviar, e o launcher com a janela
fechada) vão para o mesmo gradiente (`--sig-btn-*`), a janela ganha borda de
2px em `--ok` com um halo externo (`--sig-halo`), e o **carimbo** entra na linha
do número do processo, com a contagem do que está protegido. O toggle ligado é
sólido em `--ok`. O que continua intocado é a **conversa** — branca,
como o §2 decidiu, porque o peso visual segue no texto da resposta. A regra
virou: *a moldura pode ser ambiente; a superfície da leitura, não.*

Nos modos sem borda (tela cheia e lateral) a marca vai para a **aresta que
encosta na página** — `border-top` e `border-left` de 4px —, declaradas com a
classe do modo para vencer o `border: none` daquelas regras por
especificidade, e não por ordem no arquivo.

**O campo de mensagem fica na família do modo também no foco.** A primeira
versão voltava ao azul ao digitar, e o resultado era uma janela verde com um
campo azul — a "cor e borda horríveis" do relato. Foco é um halo mais forte da
MESMA cor (`--ok-ink` + `--sig-halo`).

**A tarja vem do mundo do assunto**, e não de um "estado verde" genérico: autos
em segredo de justiça levam uma tarja na CAPA — uma faixa de lado a lado, vista
antes de abrir o processo. Daí o hachurado (`--sig-tarja` sobre `--ok-bg`,
passo de 12px a −45°, borda inferior de 2px em `--ok`): é ele que a faz ler
como marca de capa em vez de mais uma barra de status. O passo de 8px sobre
`--ok-tarja` da v0.55 lia de longe como faixa lisa e clara — medido no pixel.

**Ela é irmã do `.content`, não filha do `.main`.** Dentro da coluna do chat a
faixa começava no meio da janela nos modos largos, e marca de estado que cobre
parte da tela lê como cabeçalho de seção. Acima do `.content` ela atravessa as
duas colunas e encosta no cabeçalho escuro, que é onde o olho já está.

**A moldura é a borda que o painel JÁ TEM** (`.wrap.sigiloso .panel { border:
2px solid var(--ok) }`, mais o halo em `box-shadow` externo), e as alternativas
todas falham por um motivo de plataforma:

- `box-shadow: inset` pinta abaixo dos filhos — o cabeçalho e as duas colunas o
  cobrem inteiro e o anel simplesmente não aparece.
- `::after`/`::before` do `.panel` **já têm dono**: no modo livre são a pega de
  arrastar e a alça de redimensionar. Um elemento tem um `::after` só, então as
  regras disputam o mesmo pseudo propriedade a propriedade — o resultado foi uma
  caixa de 13×13 no canto errado com a alça destruída, e `getComputedStyle`
  reportando a borda viva e correta, porque ela estava: no lugar errado.

A borda própria não custa elemento nem pseudo, acompanha o raio nos quatro modos
de layout e contorna também o cabeçalho escuro. **`--ok` e não `--ok-line`**:
medido no pixel, o `#cbe3d8` some contra o fundo da página do tribunal, e moldura
que não se vê não é moldura.


### Modo sigiloso: o carimbo (`.sigselo`), no lugar da tarja

Até a v0.57 o estado morava numa **`.sigbar`**: faixa hachurada de largura
inteira sob o cabeçalho, com a frase "MODO SIGILOSO — as peças saem
anonimizadas…" e a contagem no extremo oposto. Três defeitos, e o terceiro só
apareceu numa captura de uso real:

1. **~26px de altura permanentes** para uma frase que se lê uma vez só. No
   painel flutuante isso é uma peça a menos visível na lista.
2. **A hachura a −45° é fita de isolamento** — linguagem de PERIGO. O próprio
   comentário do CSS argumentava, corretamente, que a *cor* não podia ser
   `--warn` porque o modo é confirmação de uma proteção valendo, e contradizia o
   argumento na *textura*.
3. **A contagem era `hidden` com zero protegidos** — que é exatamente o estado
   durante a anonimização, a fase LENTA. Na captura, a faixa ocupava a largura
   da janela dizendo nada, enquanto "Anonimizando — OCR da fl. 1" aparecia lá
   embaixo, na coluna de peças. A faixa tinha espaço e nada a dizer; o progresso
   tinha o que dizer e nenhum espaço.

**O motivo passou a ser REDAÇÃO**: barras horizontais de comprimento variável, a
assinatura visual de um documento tarjado. É o que a função literalmente faz, e
é um motivo que nenhuma interface genérica alcança. Ele aparece em dois níveis —
cheio no glifo (`SVG.tarja`, que substituiu o cadeado nas quatro superfícies do
modo) e a **5,5% como textura do cabeçalho** (`--sig-textura`, data-URI), onde de
perto lê como linhas tarjadas e de longe como papel.

**O carimbo mora na linha do CNJ** (`.cnj-row`, dentro do `.tit-wrap`) — colado à
IDENTIDADE do processo, que é a leitura certa: "este processo, em segredo". Placa
SÓLIDA (na faixa antiga a frase boiava numa pílula branca sobre a hachura: duas
texturas disputando o mesmo espaço) e raio de 4px, não `--r-pill`: as pílulas
deste painel são chips e selos, e **um carimbo de capa é retangular** — é a forma
que separa "mais um chip" de "uma marca aposta no documento".

**Três momentos, um elemento**, e nenhum deles muda a altura:

| Momento | Mostra | Quando |
|---|---|---|
| Anúncio | "As peças saem anonimizadas daqui" | 7 s depois de ligar o modo |
| Trabalhando | `ANONIMIZANDO 3/12 · fl. 1` | Enquanto a anonimização roda |
| Repouso | `SIGILOSO · 47 protegidos` | O resto do tempo |

O anúncio é **confirmação de uma ação recém-tomada**, não um cartaz: a frase que
a faixa mantinha para sempre agora aparece uma vez, no instante em que responde a
uma pergunta, e some sozinha. A troca de texto é INSTANTÂNEA de propósito — a
mesma escolha de `.sl-l`/`.sl-s` e de `.g-full`/`.g-short`; animar largura com o
conteúdo mudando junto corta o texto no meio da transição.

**MEDIDO, e cada número corrigiu um defeito real:**

- Painel largo: **60px de cabeçalho nos quatro estados** — idêntico ao painel sem
  sigilo. Custo zero.
- `.hd button` (0,1,1) governa TODO botão do cabeçalho com `background:
  transparent`, `30×30` e `--r-sm`, e vencia um `.sigselo` de 0,1,0 propriedade a
  propriedade: o carimbo saía como um quadrado transparente com o texto
  quebrando dentro e o cabeçalho esticando para **111px**. Daí `.hd .sigselo`, e
  `width: auto` explícito — **não basta declarar o que se quer, é preciso
  desfazer o que a regra genérica impôs**.
- No estreito, `flex-wrap` **quebra a linha antes de encolher os itens dela**: o
  carimbo empurrava o ✕ para uma terceira linha (+42px, mais que os 26px da faixa
  antiga). `flex: 1 1 0` no `.tit-wrap` faz o título ceder — e vale **só com o
  carimbo aceso** (`:has(.sigselo:not([hidden]))`), para o cabeçalho estreito sem
  sigilo continuar byte a byte o de antes. Num painel de 420px o nome da extensão
  é decoração; o número do processo e o estado do sigilo são DADO.
- O CNJ sai de cena durante o anúncio (`:has()` porque ele é irmão ANTERIOR do
  botão): CNJ mais anúncio empatam com a largura útil e o número saía truncado.
  Um anúncio que espreme o número do processo não vale os 7 s que dura.

No estreito sobram o glifo e o **número** (`.ss-t`, `.ss-u` e `.ss-d` somem) — a
mesma regra do selo da metarow: o ícone já diz "sigiloso", o que falta é o que
muda. Clicar abre a `.audbox`, a mesma porta do selo; duas portas para um destino
é padrão daqui (o "ver na timeline" tem três).

### Modo sigiloso: toggle, selo e caixa de auditoria

Três peças, e cada uma responde a uma pergunta diferente. Confundi-las foi o
primeiro erro do desenho: o selo sozinho anunciava um estado e não deixava
CONFERIR nada.

| Peça | Onde | Pergunta que responde |
|---|---|---|
| `.tgl-sigilo` | `.toolbar`, ao lado do `.tgl-search` | "como eu ligo?" |
| `.selo-sigilo` | `.metarow` | "está ligado? quanto já foi mascarado?" |
| `.audbox` | popover aberto pelo selo | "o que exatamente saiu daqui?" |

**O toggle vai na `.toolbar` e não na `.docs-tip`** porque ele tem ESTADO — é
irmão do `Jurisprudência`, não das ações de escopo "lista toda". Mas ele é o
SEXTO botão da barra, e por isso o rótulo dele **sai no `.estreito`**, junto de
mapa/prompts/modelos. A exceção do Jurisprudência ("o estado é o próprio
rótulo") não se aplica: aqui o estado tem um segundo indicador, mais forte — o
selo, que só existe quando o modo está ligado.

**O selo usa `--ok-*`, nunca `--warn-*`.** Sigiloso ligado não é aviso: é
CONFIRMAÇÃO de que uma proteção está valendo. Em `--warn` ele competiria com a
`.sel-nota` e com o medidor de contexto, que sinalizam problema — e um estado
permanente em cor de alerta é o "tudo alerta com a mesma intensidade" do §2.

**Forma longa e curta** (`.sl-l` / `.sl-s`), o mesmo mecanismo do `.g-full` /
`.g-short` do medidor — dois `<span>`, escolha no CSS, zero JS. O eixo aqui é
`.estreito`, e não `.expanded`: medido, a forma longa (133px) fazia a `.metarow`
de 420px quebrar em DUAS linhas e empurrava o selo do modelo para baixo. A forma
curta troca a frase pelo número, que é o dado que muda.

**A `.audbox` é enquadrada no PAINEL, não na viewport** — e é aí que ela se
separa da `.movbox`, de quem herda a anatomia (`.mv-hd`, `.mv-list`,
`.mv-vazio`). A `.movbox` é uma lista curta e a diferença nunca aparece; esta
carrega o TEXTO DE UMA PEÇA, fica alta, e presa à viewport cobria a barra de
título e transbordava a borda esquerda em 420px. Quem cede a altura é a lista,
que já rola (`overflow-y: auto`), com piso de 120px — num painel muito baixo é
melhor transbordar do que virar uma fresta.

**A ordem das três camadas da caixa é a ordem da dúvida**: quanto (chips) → o
quê, com o texto que saiu → a chave. A chave por último e com `--warn-*`: é a
única linha da caixa que pede cuidado, porque ela desfaz a anonimização e por
isso não acompanha o relatório.

**As marcas no texto enviado (`.aud-rot`) são o que separa afirmar de mostrar.**
Cada `[PESSOA_1]` aparece destacado no documento, com o valor original no
`title` (`cursor: help` é o que anuncia isso). Usa `--accent-bg`/`--pje-2`, a
marca da extensão, e não os tokens de estado: não é sucesso nem aviso, é uma
anotação sobre o texto. O valor original fica no `title` e nunca na tela — visível
ele transformaria a prova de anonimização num documento com os nomes de volta.

**Os chips falam português, não `id2label`.** O modelo rotula `ORGANIZACAO`, sem
cedilha e sem til, porque identificador de código não leva acento — na tela isso
lê como erro de digitação. `NOME_TIPO` (panel.js) traduz e pluraliza; tipo novo
cai no `else` e aparece cru, que é feio e honesto. Os rótulos DENTRO do texto
(`[ORGANIZACAO_1]`) continuam técnicos: eles são a string literal que foi ao
modelo.

**Durante o trabalho a peça volta a girar** (estado `anon` no card de progresso,
herdando o estilo do `upload`) e a nota CONTA (`Anonimizando 3 de 12`). Sem isso
o card ficava em 100% durante a parte lenta — o "parecendo travado" que a v0.50.0
do OCR já entregou uma vez.

### Modo sigiloso: bloqueio da guarda e liberação local

Quando a última guarda encontra em um request um valor que deveria ter sido
mascarado, o turno não vira erro de rede nem `.alertbar`: aparece como
`.sigilo-bloqueio` **dentro da conversa**, no ponto em que o envio foi tentado.
A conversa não precisa ser zerada; o usuário precisa decidir sobre UM valor.

A bolha usa `--alerta-*`, o mesmo nível máximo dos callouts de alerta, e declara
três fatos nesta ordem: o envio foi bloqueado, nada chegou à IA e qual valor foi
encontrado. O valor vem dos autos e entra por `textContent`, nunca por
`innerHTML`. Se o worker não conseguir apontar um rótulo, a bolha falha fechada:
explica a ausência e não oferece botão algum.

**A ação diz o escopo inteiro: “Liberar neste processo”.** Ela só serve para
falso positivo que não seja dado pessoal — por exemplo, o nome de um órgão
público. A decisão fica no banco local do processo, nunca em storage de
sincronização. No chat, o texto que havia sido consumido volta ao campo e o
reenvio ocorre só depois do clique; a bolha anterior é retirada do transcript
antes disso, para o reenvio não duplicar a pergunta. Minuta e mapa apenas pedem
uma nova geração, porque não existe um campo de chat a restaurar nesses fluxos.

**Na tabela da auditoria o item liberado fica, riscado, com o selo "liberado —
sai em claro"** (`.aud-map.liberado` + `.aud-lib`): apagá-lo da tabela afirmaria
uma proteção que não existe, e ele continua resolvendo o rótulo de uma minuta
antiga.

**A bolha é uma PERGUNTA com dois cartões** (v0.57.0): "Este valor é um dado
pessoal?" — `.sb-card.sb-proteger` ("É dado pessoal → manter protegido", botão
no gradiente do modo) e `.sb-card.sb-soltar` ("Não é → liberar", em `--warn-*`:
decisão legítima, não transgressão, com o checkbox "também nos outros
processos"). Antes deles, o VALOR com a origem ("reconhecido como pessoa
([PESSOA_9]) em «Contestação»") e onde ia sair. Abaixo, a linha `.sb-sec` com
as ações sobre a peça ("Tirar «peça» desta conversa", "Editar o texto da
peça") e a auditoria. Grid `auto-fit` de 230px: lado a lado no expandido, um
sob o outro no flutuante. A versão anterior (abaixo, mantida como histórico)
punha "Nova conversa" em destaque e chamava "Liberar" de abrir mão de uma
proteção — e o dono do projeto, diante de "ALIMENTOS", não soube o que fazer.

**As saídas que PRESERVAM o nome vêm primeiro** (v0.56.1). A versão anterior
dizia "não há segundo botão: não clicar já é manter protegido" — e estava
errada, porque não clicar deixava o usuário sem conseguir enviar. A bolha
passou a dizer ONDE o valor estava ("numa resposta anterior da IA") e a
oferecer, nesta ordem: `.sb-mascarar` ("Mascarar e reenviar", no gradiente do
modo — é o modo trabalhando a favor de quem o ligou), `.sb-nova` ("Nova
conversa (mantém as peças)", secundária; vira `.destaque` quando o valor está
numa parte da conversa que não pode ser reescrita e ela é a ÚNICA saída que
preserva o nome), `.sb-liberar` (no vermelho de alerta, dito como o que é:
abrir mão de uma proteção) e `.sb-aud`. A nota explica cada uma numa frase.

### Modo sigiloso: editor de revisão (`.sig-edit`) e ações no relatório

Peça que a pós-condição reprova não pode terminar em "ficou de fora": o
relatório `.falhas` ganha, por item, botões `.falha-acao` ("Liberar «valor» e
refazer", "Revisar o texto") no tom do aviso suave — a análise seguiu, e o que
se oferece é a saída. O editor é um diálogo fixo e centrado (o `.wrap` é
container de tamanho zero, como a `.audbox`), com a moldura do modo (`--ok` +
`--sig-halo`) e o cabeçalho em `--sig-hd`: quem está ali está DENTRO do modo
sigiloso, mexendo no que vai sair. Três zonas, na ordem da dúvida: o que sobrou
em claro (uma linha por valor, em aviso suave, com "Mascarar todas" e "Liberar
neste processo"), o texto inteiro num `textarea` monoespaçado, e "Usar este
texto"/"Cancelar". A mensagem de recusa (`.se-msg`) aparece no próprio editor —
o texto não entra enquanto houver valor em claro, e o editor diz qual. Esc fecha
só o editor (`stopPropagation`, como a `.audbox`). Conteúdo dos autos entra por
`value`/`textContent`, nunca `innerHTML`.

### Modo sigiloso: conferência antes de enviar (`.sigok`)

A caixa que fica **entre** o mascaramento e o request. Reaproveita a casca do
`.plib` (como a `.gwarn` e a `.prec`), e o que é próprio dela é o **cabeçalho
em `--sig-hd`** com o cadeado, a borda em `--ok` e o halo `--sig-halo` — a
mesma moldura do editor `.sig-edit`, porque é a mesma situação: quem está ali
está DENTRO do modo sigiloso, decidindo o que SAI.

Três zonas, na ordem da dúvida: o **resumo** (quantas peças e quantas
substituições NESTE envio — o número que muda de um turno para o outro, com os
chips `.aud-chip` por tipo), a **nota de honestidade** em `--warn-*` (aviso
suave: informa o limite do detector, não bloqueia; "nada foi enviado ainda" é a
primeira frase, porque é a pergunta que a caixa responde), e **uma linha por
peça** (`.sk-row`: título original, contagem, "Ver o texto" e "Editar"). O texto
(`.sk-txt`) tem a MESMA anatomia do `.aud-texto` e é pintado por `pintarMarcas`:
o que se aprova aqui e o que se confere depois na auditoria são a mesma coisa
aos olhos. O corpo é a única região que rola — no painel flutuante uma peça de
40 folhas empurraria o "Enviar" para fora do card, e um modal sem a ação
principal à vista é um beco sem saída.

O botão primário diz **quantas peças saem** ("Enviar 3 peças") e usa o
gradiente do modo (`--sig-btn-*`); "Cancelar envio" nomeia a consequência. O
"Não perguntar de novo" vive na própria caixa (checkbox, como o da `.gwarn`) e
a volta está nas Configurações — uma dispensa sem caminho de volta não é
preferência, é armadilha.

### A espera pelo modelo conta os segundos (`.status`, `.wait-t`, placeholder)

Entre o Enter e o primeiro token a BOLHA do assistente mostra os pontos e, ao
lado, "Analisando… — 12 s" (`.wait-t`, `--fs-micro` em `--muted`); o `.status`
repete; o campo diz "Aguardando a resposta do modelo…" enquanto travado. Três
lugares porque o olho está na bolha, não no rodapé — foi o terceiro relato do
mesmo defeito que fixou a regra. O número anda. É a única mudança visível enquanto o modelo raciocina, e é o que
separa "esperando" de "travou" — uma bolha com três pontos parados não
responde a essa pergunta (relato real). O relógio só aparece a partir de 3 s
(antes disso seria ruído), troca de rótulo sem zerar quando a busca ou o
raciocínio começam, e some no primeiro token. A bolha do assistente mantém o
indicador de digitação até haver texto: um delta vazio não a esvazia.

### Aviso dentro do card de progresso (`.prep-nota`)
Nota em aviso suave abaixo da barra, usada quando o download passa de 12 s por
peça. Aparece **durante** a espera, que é quando a informação vale: o gargalo
real do produto é a entrega serializada do PJe, e sem isso a extensão parece
travada quando na verdade está esperando o tribunal. Ver `#rede` no `help.html`.

### Zona de arraste e ficha de importação (`.imp-drop`, `.imp-ficha`)

O único drag & drop do produto (importar `.docx` de peças-modelo). Vive nas duas
folhas com os **mesmos nomes de classe** e regras reescritas — `panel.css` está
num Shadow DOM e não pode importar `modelos-page.css`, e nomes iguais é o que faz
as duas se lerem lado a lado quando uma mudar. **Nenhum token novo.**

A **zona** é tracejada (`1.5px dashed --line-check`, `--r-box`, fundo `--paper`),
porque é um **alvo**, não um botão: contorno cheio a leria como controle
clicável e o gesto principal ali é soltar. No hover, no foco e durante o arrasto
ela vira `--pje` + `--hover-2`, com o ícone (24px, traço 1.4) acompanhando. Na
conferência ela fica **compacta** — uma faixa acima das fichas, com o rótulo
trocado para "adicionar mais" — e **não some**: sem alvo visível, arrastar mais
arquivos não teria onde cair.

A **ficha** é um cartão por arquivo (`--line`, `--r-box`) com checkbox real +
nome do arquivo em `--ff-mono`/`--fs-nano`, título e categoria editáveis, a
contagem em mono e a prévia do texto lido em **serifada** (é peça jurídica).
Desmarcada fica `opacity:.62` sobre `--paper` — **continua legível e editável**,
porque desmarcar não é apagar.

O selo **"sugerida"** (`--accent-bg`/`--pje-2`, `--fs-nano`, `--r-tight`) diz que
a categoria é palpite da máquina, e **desaparece no primeiro toque no seletor**:
depois disso ele estaria mentindo. Quando nada foi reconhecido, vira "confira"
nos tokens de aviso suave.

Tudo o que informa sem impedir — título duplicado, arquivo grande demais, arquivo
ilegível — usa o trio **`--warn-*`**, nunca a `.alertbar`: o lote continua, e o
que ficou de fora é nomeado no resultado. O único vermelho da tela é o botão
Cancelar **armado** (`--alerta`), porque descartar o lote é a ação destrutiva.

### Estado vazio da conversa
Eyebrow mono `ASSISTENTE DOS AUTOS` (só nos modos largos) + título serifado
centrado + subtítulo de uma linha em `--muted-2`. Grade de 3 cartões de passo
(`--surface-card`, borda `--line-card`, `--r-lg`) com o número em círculo de 19–21px
`--accent-bg-2`/`--pje` em `--ff-mono`. Eyebrow `COMECE POR AQUI` e chips que
**preenchem** o campo (nunca enviam) — os chips são **serifados** (`--ff-serif`,
`--r-pill`) e trazem a pergunta entre aspas tipográficas: é o que dá o tom forense
ao único lugar do painel onde o produto sugere palavras ao usuário.

Nos modos largos a linha final vira duas colunas (`Como funciona…` à esquerda como
botão de texto puro, `Guia completo →` à direita) separadas do resto por borda
superior. No estreito os três passos empilham e os chips viram botões de largura
total alinhados à esquerda.

### Visita guiada (`.tour`) — camada, cartão e palco

Camada `position: fixed` **dentro do Shadow DOM**, pela mesma razão do `.selmenu`
e do `.preview`: o `.wrap` é um container de tamanho zero, e posicionar por dentro
dele jogaria o elemento para fora da tela. Ficar no shadow é o que dá isolamento
contra o CSS do tribunal e acesso aos tokens.

**O recorte é um elemento só** — `box-shadow: 0 0 0 2px rgba(255,255,255,.92),
0 0 0 9999px rgba(14,50,63,.62)` num `div` sobre o alvo: a sombra pinta tudo
*fora* dele, então o próprio elemento é o buraco. Transição nas quatro
propriedades de posição faz o holofote **deslizar** entre alvos em vez de piscar.

> **Uma caixa de 0×0 não pinta `box-shadow`** — nem com spread de 9999px, e
> `getComputedStyle` reporta a propriedade viva e correta, o que torna a falha
> invisível a qualquer teste que não olhe pixels. Nas telas sem alvo (capa e
> encerramento) quem escurece é o **fundo da camada** (`.tour.sem-alvo`), e o
> buraco some por `opacity` — nunca `[hidden]`, que levaria embora o fade de
> volta.

Cartão de **384px** (428 nas capas), `--r-2xl`, `--sh-pop`, com
`max-height: calc(100vh - 24px)` e rolagem interna: em tela baixa os cards mais
altos não cabem, e o clamp de posição só garante o topo — o rodapé com
**Continuar** sairia da tela e a visita ficaria sem saída. Dentro: eyebrow mono
de capítulo (`.tour-cap`), título serifado, corpo em `--fs-ui` e a linha de
navegação com barra de progresso de 76×3px + contador mono.

**O palco** (`.tour-palco`) é a demonstração animada: superfície `--surface-2`,
`--r-md`, com uma lista de peças **fictícia** que reusa os tokens reais
(`--cat-*` nos dots, `--accent-bg` na linha marcada, id em `--ff-mono`/
`--fs-nano`). É falso de propósito — ver a nota em `CLAUDE.md`; animar sobre as
rows verdadeiras dispararia downloads reais. O ponteiro fantasma é o único
elemento do painel com `fill` sólido em vez de traço: ele precisa pousar sobre a
lista com peso próprio, e um ícone de contorno desapareceria ali.

Tudo o que anima respeita `prefers-reduced-motion`: os palcos pintam o **estado
final** e não devolvem laço nenhum.

### Faixa de retomada (`.retomada`)

Primeira linha da área de mensagens quando a conversa foi restaurada da memória
de caso: `Conversa retomada de 3 de agosto · 6 mensagens` + a nota de onde os
dados estão, e o botão de texto **Esquecer este processo** à direita.

Usa o trio de **confirmação suave** (`--ok-bg` / `--ok-line` / `--ok-ink`), não o
de aviso: nada deu errado — o trabalho anterior voltou, que é uma boa notícia. O
`--warn-*` aqui leria como problema e o vermelho da `.alertbar` está reservado
para o que **bloqueia** o envio.

Duas regras de conteúdo, e as duas são de privacidade, não de estética:

- A faixa **diz onde os dados estão** ("o texto das peças deste processo está
  guardado neste computador"). Memória silenciosa que ninguém pediu é o tipo de
  coisa que se descobre pelo caminho errado; ela se anuncia no lugar onde o
  efeito aparece.
- O botão de apagar mora **aqui**, junto da frase que explica o que existe, e não
  no cabeçalho — ali já vivem `.dl` e `.reset`, e um terceiro ícone destrutivo
  entre eles seria acidente esperando. A exclusão é em **dois cliques**
  (`Esquecer` → `Esquecer?` em `--erro`), nunca `confirm()` nativo, que congela a
  página do tribunal.

Sem memória não há faixa: quando não há o que esquecer, não há o que dizer.

### Aviso em bloco dentro da resposta (`.callout`)
Três níveis, e a escala de cor é a MESMA do resto do painel — quem aprendeu o
significado de uma cor num canto da interface não deveria reaprendê-lo no outro:

| Rótulo | Tokens | Quando |
|---|---|---|
| **Alerta** | `--alerta-bg` / `--alerta-line` / `--alerta` na barra | O que pode levar a erro de análise ou decisão: divergência entre peças, prazo em jogo, peça essencial não anexada |
| **Atenção** | `--warn-bg` / `--warn-line` / `--warn` | Ressalva sobre a BASE da resposta: peça de mero encaminhamento, documento ilegível, texto cortado, informação não confirmada |
| **Nota** | `--accent-bg` / `--line` / `--pje` | Observação útil que não é risco |

Estrutura: cabeçalho (`.co-h`) com **ícone SVG de 14px** + rótulo em `--fs-meta`
peso 700, e corpo (`.co-b`) no tamanho do balão — é conteúdo, não legenda, e
encolher a letra contradiria o motivo de o bloco existir. Barra à esquerda de
3px, a mesma do `blockquote`: o aviso é parente dele, não um componente novo.

> **Quem escreve o bloco é o modelo**, na sintaxe de "alerts" do GitHub
> (`> [!ALERTA]`), e quem o desenha é `lerCallout` em `panel.js`. Consequência
> de design: o teto de **três avisos por resposta** vive no system prompt, não
> no CSS — um destaque que aparece em tudo deixa de destacar, e aqui o freio só
> pode estar em quem gera. Rótulo não reconhecido degrada para citação normal,
> nunca some.

### Rodapé de citações da bolha (`.cites`)

Duas naturezas diferentes convivem ali: **peça dos autos** (prova no processo,
vira botão `.cite-go` que rola a timeline) e **fonte na web** (página da internet,
vira `<a target="_blank">`). Até a v0.23 saíam na mesma lista, com a mesma
aparência — numa resposta que mistura autos e jurisprudência, que é o caso de uso
principal, isso apagava a fronteira que mais importa juridicamente.

Agora vão em grupos com **eyebrow** (`.cites-h` — `--fs-micro`, peso 600,
`letter-spacing: 1.4px`, uppercase, `--muted-2`), e o grupo web traz a contagem:
`FONTES NA WEB (3)`. O rótulo de grupo **só aparece quando há fonte web**: com
peças apenas, "veio dos autos" é a expectativa padrão do usuário e o título seria
ruído — a mesma regra do `.tip-txt` da timeline, que em repouso é só o ícone.

Cada fonte web mostra o **domínio** ao lado do título (`.cite-host` — `--ff-mono`,
`--fs-nano`, `--muted-3`), que é o que responde "de onde veio isto?" antes do
clique. Mono porque é identificador, não frase. Quando o título JÁ É o domínio
(caso do Gemini, que não manda manchete) mostra-se um só, senão sairia
`stj.jus.br stj.jus.br`. O `title` do elemento diz o degrau da fonte (tribunal
superior / tribunal deste processo / outra) — ver `CLAUDE.md`, "Prioridade das
fontes".

> **Não reordenar as linhas.** O número do rodapé é o mesmo do sobrescrito no
> corpo do texto; agrupar preserva o índice original de cada citação, e ordenar
> por autoridade quebraria a correspondência entre a marca na frase e a fonte.

### Rodapé de entrada
Fundo `--surface-2`. Faixa de ações com **ícone SVG colorido por função** (não mais
emoji nem dot):

| Ação | Ícone | Cor |
|---|---|---|
| Jurisprudência | lupa | `--pje` |
| Minutar | caneta sobre linha | `--cat-peticao` |
| Mapa mental | nó central com ramos | `--cat-prova` |
| Prompts | faísca dupla | `--cat-decisao` |
| Modelos | dois livros | `--cat-audiencia` |

> Minutar e Prompts **trocaram de cor** no refinamento (eram `--cat-decisao` e
> `--cat-peticao`). A regra que passou a valer: a cor do ícone é a da categoria de
> peça que a ação *produz ou consome* — minuta é peça de parte (roxo), prompt é
> instrução do juízo sobre o trabalho (dourado).

À direita, o selo do modelo ativo como pill (`--r-pill`) com dot de estado e
chevron — o chevron sinaliza que o selo é clicável, o que já era o comportamento.
Ao lado, o `ⓘ` como botão redondo de 26px.

#### Selo da linha do tempo (`.linhatempo`) — dois estados, um elemento

Diz o que foi ao modelo no eixo do **tempo** (os movimentos do processo:
publicação, intimação, decurso de prazo, trânsito). Fica na `.metarow` porque é
da mesma família do medidor e do custo — fatos sobre a resposta que acabou de
sair —, e não na `.docs-tip`, que tem escopo "lista de peças": movimento é ato,
não documento.

| Estado | Quando | Tokens |
|---|---|---|
| neutro | a linha do tempo foi inteira | `--muted` / ícone `--muted-3` |
| aviso | lista cortada por tamanho, não alcança o início do processo, ou vazia | `--warn-ink` sobre `--warn-bg` |

- **Tokens SUAVES, nunca os da `.alertbar`.** A lista chegou, só não completa, e
  nada está impedido de continuar — pintar isso de `--alerta` é o "tudo alerta com
  a mesma intensidade" do §2.
- **A fonte mais fraca NÃO é aviso; é rótulo.** Quando o registro oficial não
  responde e a leitura sai do DOM da tela, o texto ganha `(da tela)` e o estado
  segue neutro. Alarmar o caso normal de um tribunal sem a rota faria o selo
  perder o significado justamente onde ele importa.
- **Rótulo em duas versões** (`.g-full`/`.g-short`, a regra global do medidor e do
  custo): `linha do tempo: 140 de 380 movimentos` nos modos largos, `140/380 movs`
  onde a linha é estreita. Medido: no flutuante de 484px o estado neutro cabe na
  MESMA linha do medidor e do custo; o de aviso empurra o selo do modelo para a
  segunda linha, que desce ancorada à direita como o resto da `.metarow`.
- **Conjunto vazio se explica** (a regra da `.sel-nota`): sem nenhum movimento o
  selo aparece dizendo `sem linha do tempo`, porque é ele que explica por que uma
  pergunta de prazo vai voltar sem resposta naquele processo.
- **O estado de aviso precisa do PRÓPRIO `:hover`.** `.linhatempo:hover` vem antes
  e tem a mesma especificidade, então o `--warn-bg` a vence e o selo âmbar ficava
  sem resposta nenhuma ao mouse — lia-se como decoração, não como algo que tem
  explicação atrás. O realce é uma borda por `box-shadow: inset`, e não a troca do
  fundo, porque ali o fundo é o SINAL.
- **Concordância no singular não é detalhe**: um movimento só é o processo
  recém-distribuído, isto é, o primeiro que alguém abre. "1 movimento lidos" e a
  faixa "de 04/05/2026 a 04/05/2026" (que anuncia um intervalo inexistente) sairiam
  na estreia do recurso. Num selo cuja função é dar confiança, erro de concordância
  é o que faz duvidar do número ao lado dele.
- **O selo é uma PORTA, não um rótulo** (`<button>`, `cursor: pointer`): clicá-lo
  abre a `.movbox` com os movimentos. Enquanto ele era só um `<div>` informativo,
  as datas não existiam em lugar nenhum da interface — iam ao modelo e voltavam só
  se ele as citasse. `aria-expanded` acompanha o estado.
- Ícone de relógio SVG com ponteiros em 10h10 — a 14px, 12h00 vira um traço só.
  Emoji está fora (§5). `role="note"`, `tabindex="0"` e `aria-label` espelhando o
  `title`: em `display:none` o tooltip não é anunciado, e quem navega por teclado
  precisa alcançar a explicação.

Caixa de entrada com `--r-xl`, borda `--line-input`, foco `--line-focus` + `--ring`.
Botão **Enviar com gradiente vertical** (`--btn-de`→`--btn-para`, `--sh-btn`) e seta
→ à direita do rótulo; no modo estreito vira quadrado de 38×38 só com a seta.
Abaixo, dicas de teclado em `--fs-micro`.

#### A lista dos movimentos (`.movbox`) — o registro, não o resumo

Abre no clique do selo. `position: fixed` pela razão do `.selmenu` e da
`.confirmbox` (o `.wrap` tem tamanho zero), largura `min(420px, 100vw - 24px)`,
alinhada à **direita do selo** e **acima** dele; abaixo só quando não cabe em cima.

| Parte | Papel | Decisão |
|---|---|---|
| `.mv-hd` | procedência + tamanho | `Registro oficial do PJe · 380 movimentos (140 listados)` — o peso do que se vai ler vem antes do conteúdo |
| `.mv-d` | a data | coluna **fixa** de 104px e `tabular-nums`: o olho desce a lista procurando uma data, e largura variável destrói essa varredura |
| `.mv-b b` | o evento | o vocabulário CNJ, em `--ink` |
| `.mv-c` | o complemento | é ele que fecha a conta do prazo (*"… em 16/07/2026 23:59"*) — por isso a caixa é larga: cortá-lo tiraria o que se veio ler |
| `.mv-p` | a peça do ato | pílula clicável que reusa `irParaPeca` (o mesmo caminho do "ver na timeline") |
| `.mv-gap` | onde a lista foi cortada | tokens `--warn-*`; sem esta linha o salto de 2011 para 2026 passaria por continuidade |

- **420px não é generosidade, é requisito**: o complemento do movimento é a
  informação que decide o prazo. E não é número solto — é a largura prescritiva do
  modo lateral (§ Larguras).
- **As bordas do PAINEL são o limite, não as da viewport** (`posicionarMov` mede
  contra o `.panel` e recua 8px). Ancorada só no selo e clampada pela janela, a
  caixa vazava para fora do painel no lateral e ia parar sobre a tela do tribunal,
  encostando na borda da janela — parecia acidente. A altura segue a mesma regra:
  uma caixa mais alta que o painel flutuaria sobre o cabeçalho e a página ao mesmo
  tempo. Só a medição nos QUATRO modos mostrou isso; o flutuante sozinho passava.
- **O estado vazio ABRE e explica.** Sem movimento nenhum a caixa saía na primeira
  linha e o selo âmbar ficava com `cursor: pointer` prometendo um clique que não
  fazia nada — o "botão mudo" que o copiar do PIX já custou uma correção. É ao
  clicar no selo que a pergunta "por que não há datas?" nasce, e o tooltip não
  responde no toque nem chama atenção num chip pequeno. A explicação é a MESMA
  string do tooltip: duas redações do mesmo fato seriam duas verdades para
  divergirem.
- `min-height: 0` no `.mv-list` — a armadilha do overflow em coluna flex, a mesma
  do `.doclist` na faixa `.docs`.
- Conteúdo por `textContent` (é dado dos autos); só o ✕ é SVG do pacote.

### Os cinco ícones do cluster de layout

`[ocultar peças · largo · lateral · livre · tela cheia]`. **Julgue-os em fileira,
nunca isolados**: o que o olho faz a 15px é distinguir SILHUETAS, e três deles
eram variações de "retângulo com uma divisória".

| Botão | Desenho | Por quê |
|---|---|---|
| `.docsvis` | retângulo com divisória + chevron | inalterado; o chevron é o que o separa do lateral |
| `.expand` | retângulo com **coluna à esquerda + linhas** | mostra o que o modo entrega (lista em coluna). **Era um par de setas `↔`**, que lê como *redimensionar largura* |
| `.side` | **dois blocos separados** | a página larga + o painel encostado. Era um retângulo com divisória interna, quase gêmeo do `.docsvis` |
| `.free` | **duas janelas sobrepostas** | a convenção universal de janela solta. Era uma janela única com barra de título: correta e muda — descrevia um painel qualquer |
| `.fs` | setas diagonais | inalterado; é convenção |

### As duas affordances do modo livre

`cursor: move` no cabeçalho **não é affordance**: só se revela depois que o
ponteiro já está lá, isto é, para quem já desconfiava. Quem não sabe que a janela
sai do lugar não passa o mouse ali para descobrir — a mesma falha do `.d-ver`
invisível até o hover. Os dois sinais são pseudo-elementos, então **não custam
espaço de layout**:

- **Pega** (`.wrap.livre .hd::before`): barra de 34×3px em branco a 30%, no topo
  do cabeçalho — a convenção de "arraste por aqui". Exige `position: relative` no
  `.hd`, senão se resolve contra o `.panel` e só acerta por coincidência.
- **Alça** (`.wrap.livre .panel::after`): duas diagonais de `--muted-3` no canto.
  O `resize: both` do navegador já desenha um triangulozinho ali, mas ele some
  sobre o branco do painel; os dois convivem (medido em pixel). **`pointer-events:
  none` nos dois** — quem trata o arrasto é o `.hd`, e quem redimensiona é a alça
  NATIVA, que fica exatamente sob o desenho.

### Caixa de apoio (`.apoio`) e o bloco de PIX (`.pix`)

Vive **só** nas telas satélites (ajuda, novidades, configuração) e como UMA LINHA
no guia recolhido do painel. Nunca no fluxo de trabalho: uma caixa de apoio entre
a pergunta e a resposta cobra pedágio no meio da análise dos autos. Veste-se com
`--accent-bg` — não é sucesso nem alerta, é informação institucional.

Dentro dela, o `.pix` é um cartão `--surface` com o QR (108px) à esquerda e, à
direita, título com ícone, os dados e o botão **Copiar código PIX**. O branco em
volta do QR não é estética: é a *quiet zone* de que o leitor precisa, e o cartão
claro separa "o que eu faço agora" do parágrafo que explica por quê. Abaixo de
460px o QR sobe para cima do texto, senão a chave quebra no meio.

> **A garrafa é `--pje`, a cor de ação — não um verde de cerveja.** Os `--cat-*`
> são semânticos (espécie de peça) e `--ok-*` significa sucesso; pintar uma
> garrafa com qualquer um dos dois ensinaria uma terceira leitura a uma cor que já
> tem dono. A marca vive no texto, e o **logo de terceiro nunca entra** — desenho
> próprio, na família de traço do sistema.

> **22px, e isso foi medido.** Uma garrafa é silhueta alta e estreita: em 15px o
> corpo fica com ~6px de largura e ela lê como **cadeado**. Os ícones que
> funcionam em 13–15px neste sistema são todos de proporção quadrada (lupa,
> clipe, escudo). Ícone de silhueta vertical precisa de mais altura ou de outro
> desenho.

### Ícones
SVG stroke, `fill: none`, `stroke-linecap/linejoin: round`, `currentColor` sempre
que a cor vier do estado. **A espessura varia por contexto** — um valor único faz
o ícone de 13px parecer mais pesado que o de 18px:

| Stroke | Onde |
|---|---|
| 1.6 | Garrafa do PIX (22px) — quanto maior o ícone, mais fino o traço |
| 1.7 | Marca (18px) |
| 1.8 | Botões do cabeçalho, `ⓘ`, cadeado |
| 1.9 | Toolbar, rodapé da lista, ✕ do cabeçalho |
| 2 | Lupa, recarregar, check, recolher « |
| 2.2 | Chevron ⌄ |
| 3 | ✕ pequeno dentro de chip (9px) |

Nada de emoji na interface: renderiza diferente em cada sistema, não aceita
`currentColor` e não alinha na grade óptica dos demais ícones. Isto vale também
para os **glifos unicode** que passam por ícone (`⟳ ⟲ ⎘ ⬇ ✚ ⬆ ✕`) — são a mesma
falha com outra roupa, e escaparam da primeira varredura porque não estão nas
faixas de emoji.

**Ícone dentro de uma frase** (`.ic-in`): o `help.html` e o `changelog.html`
nomeiam botões do painel — "clique em ⟨ícone⟩ **Minutar**". Desde que os botões
deixaram de usar emoji, esse texto precisa mostrar o **mesmo desenho** da tela,
senão o guia manda procurar algo que não existe. Alinhado por
`vertical-align: -2px`, nunca por flex: o ícone vive no meio de um parágrafo, e
transformar o `<strong>` em flex quebraria a quebra de linha.

**Escrever rótulo em botão com ícone**: sempre no `<span>` interno, nunca no
botão. `btn.textContent = "…"` apaga o `<svg>` — e de forma permanente quando o
código restaura o valor "anterior", que já vem sem o ícone. Existem dois
helpers para isso: `rotulo()` em `panel.js` e `piscar()` em `editor.js`.

### Alinhamento
- **`align-items: baseline`** para título + badge de contagem e para rótulo +
  valor. Centralizar faz o badge "flutuar" ao lado de um título serifado, porque
  as duas caixas têm alturas de linha diferentes.
- `space-between` nas linhas de cabeçalho (título ↔ ação) e em
  segmented ↔ contador "N marcadas".
- Ícone dentro de campo: `position: absolute; left: 11px; pointer-events: none` —
  nunca `::before` com padding, que desalinha quando o texto quebra.

### Alturas de controle
| Altura | Componente |
|---|---|
| 26 / 28px | Botões do cabeçalho no estreito, `ⓘ`, ✕ de chip |
| **30px** | Botão do cabeçalho e da toolbar, rodapé da lista |
| **32px** | Idem nos modos largos; segmented de raciocínio |
| 34px | Marca e ✕ nos modos largos |
| 36 / 38px | Campo de busca (estreito / largo) |
| **38 / 40px** | Enviar (estreito / largo); 38×38 quadrado no lateral |
| **42px** | `<select>` do popup |
| **44px** | Salvar configuração / Testar chave |

### Larguras
| Modo | Painel | Coluna de peças | Cabeçalho | Corpo (max-width) |
|---|---|---|---|---|
| Lateral | **420px** | gaveta colapsável, não coluna | 2 linhas | — |
| Flutuante / modal | 1180px | **328px** | 60px | 660px |
| Tela cheia | viewport | **372px** | 64px | 740px |

As larguras de painel para modal e tela cheia são referência do protótipo; o que é
prescritivo são as **colunas de peças**, as **alturas de cabeçalho** e o **lateral
em 420px**.

O ponto de virada é a **largura do painel**, não a da viewport — media query mede
a janela e erra no modo livre. Use `ResizeObserver` (já existe:
`atualizarLargura`, que alterna as DUAS classes de largura).

### Painel estreito (`.estreito`) — abaixo de 520px

Classe posta por `atualizarLargura()` sempre que o painel mede menos de **520px**.
Não é uma classe do modo lateral: o flutuante também tem 420px, e a janela livre
pode ser arrastada até lá. Um modo largo nunca a recebe (expandido 1120px,
livre-wide ≥ 740px).

Em 420px cabem **uma** fileira de botões e **uma** coluna. Tudo que dobra de linha
vira bagunça, e foi o que aconteceu antes desta regra existir: o rodapé da lista
quebrava em duas fileiras, a toolbar em duas, e a lista de 33 peças mostrava
**uma**. As cinco regras:

1. **Cabeçalho em duas linhas.** Linha 1: marca + título + `[⬇ 💬]` + `✕`. Linha 2:
   o cluster de layout ocupando a largura toda, cada botão `flex: 1` — vira um
   segmented control de verdade. Só assim o título deixa de ser cortado
   ("Assist…") e o CNJ reaparece.
2. **Uma fileira no rodapé da lista.** Só `Carregar tudo` mantém o rótulo — é o
   botão que o texto do aviso nomeia, e um ícone ali faria o aviso mentir.
   `Escolher com IA` e `Baixar .zip` ficam só com o ícone (`title` + `aria-label`
   preservados). **A regra não é mais exclusiva deste modo**: ela vale igual na
   coluna estreita dos modos largos e por isso mora junto do componente
   `.docs-tip` (ver "Lista de peças"). Editá-la aqui não tem efeito.
3. **Uma fileira na toolbar.** `Jurisprudência` (tem ESTADO, e o estado é o
   rótulo) e `Minutar` (ação primária) mantêm o rótulo; mapa, prompts e modelos
   ficam só com o ícone. A `.metarow` desce ancorada à direita quando não couber —
   quebra deliberada, não vazamento.
4. **A lista é uma gaveta.** `max-height: 46%` (≈ 4 peças visíveis, contra uma),
   e o par `.docs-fold` / `.docs-rail` que já existe devolve a altura inteira ao
   chat com um clique. Marcar peças e ler a resposta são fases SEQUENCIAIS; não
   há por que reservar espaço para as duas ao mesmo tempo.
   **Porcentagem, não `vh`**: só no lateral a janela é o painel. O flutuante tem
   660px fixos, e `44vh` numa tela de 1080px reservaria 475 dos 660 para a lista,
   deixando uma tira para o chat. O `%` resolve contra o `.content`, que é quem
   de fato divide a altura.
5. **Enviar vira quadrado** 38×38 só com a seta, e os atalhos do rodapé caem para
   três (sai o `Shift+Enter`).

Textos que mudam de lugar mudam de palavra: no estreito a lista fica **acima** do
chat, não ao lado. O passo 1 do estado vazio troca "na lista ao lado" por "na
gaveta acima" pelo mesmo mecanismo dos rótulos longo/curto do segmented
(`.op-l`/`.op-s`) — dois `<span>`, escolha no CSS, zero JS.

### Popup e página de opções: a MESMA tela, em duas densidades

`popup.html` e `options.html` compartilham o `popup.js` — e agora também a
estrutura: chip de estado, três cartões de provedor, cartão do provedor ativo
(chave + modelo + segmented de raciocínio), instruções personalizadas com chips
de persona, a linha `Testar chave` + `Salvar` e a caixa `.privacy`. A página de
opções não é outra tela: é a mesma com respiro e com os textos longos que não
cabem nos 600px de altura do popup do Chrome.

**`.privacy` — uma caixa, três fatos.** Fecha o bloco de ação com o que o usuário
precisa saber antes de usar: a chave fica **neste navegador**, as peças marcadas
**vão à API** do provedor, e **conexão por cabo faz muita diferença**. Cartão
`--surface-card` / `--line-card` / `--r-box`, texto todo no mesmo eixo de leitura
à esquerda; o que distingue as linhas é a **cor do ícone** — `--pje` para a
garantia, `--warn` para a implicação —, não a moldura.

> Eram três coisas em três lugares, e o resultado somava mal. `.lock-note`
> (cadeado, centralizado, `--muted-3` — o único elemento fora do eixo de leitura
> da coluna) e `.note` (âmbar, à esquerda, barra de 3px) diziam a MESMA coisa em
> dois alinhamentos e duas cores, com os passos "Como usar" separando um do outro
> no popup. Três blocos de aviso empilhados alertam todos com a mesma
> intensidade, e aí nada alerta (§2).
>
> A terceira linha, a de rede, **não existia em tela nenhuma de configuração** — e
> é a mais acionável das três, porque o gargalo do produto é o PJe entregando as
> peças uma de cada vez. Ela estava dita em três lugares e todos exigem uma ação
> ou uma condição para aparecer: o guia do painel (acordeão fechado), a
> `.prep-nota` (só depois de 12 s por peça) e o `help.html#rede` (outra página).
> Sem ela, conexão ruim lê como extensão lenta. A divisória tracejada
> (`--line-2`) é que marca a mudança de assunto dentro da caixa — um segundo
> cartão recriaria o empilhamento que ela acabou de desfazer.
>
> **Cada linha é `display:flex`, então todo o texto vai num `<span>` único.** Sem
> ele, cada `<b>` e cada nó de texto vira um flex item próprio: a frase se parte
> em pedaços com o `gap` de 8px entre eles.

Enquanto ela teve layout próprio (acordeões `<details class="keybox">`), o
resultado era duas telas com aparências diferentes para a mesma tarefa — e um
caminho de `<select>` no `popup.js` que só ela exercitava. Os dois saíram.

**Rodapé de links**: separador é `gap`, nunca um `<span>·</span>`. Como item de
flex o ponto viaja na quebra de linha e fica pendurado no fim da fileira,
apontando para nada.

**Marca das páginas satélites** (`editor`, `modelos`, `mapa`): o mesmo quadrado
com gradiente vertical e inset branco do painel e do popup, com a imagem menor
que ele. Eram as únicas telas com o ícone chapado sobre o cabeçalho.

---

## 6. Restrições da plataforma

1. **`[hidden] { display: none !important }`** em todo CSS de página: qualquer
   regra de autor com `display` vence o atributo `hidden`, e o bloco "escondido"
   reaparece. Vale para `panel.css`, `ui.css`, `mapa.css`, `editor.css`,
   `modelos-page.css`.
2. **Nada de recurso externo** — sem CDN, sem Google Fonts, sem imagem remota. O
   painel roda na página do tribunal; as demais páginas têm CSP `script-src 'self'`.
   As fontes são servidas de `vendor/fontes/`; no painel, via `injetarFontes()`,
   que faz fetch de `src/fontes.css`, troca o prefixo `../vendor/fontes/` por
   `chrome.runtime.getURL(...)` e injeta num `<style id="pje-ia-fontes">` no
   `document.head` DA PÁGINA — não no shadow tree, onde `@font-face` é ignorado
   (ver §3).
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
- [ ] Não introduzi `font-size` fora da escala nem `font-weight: 700`.
- [ ] Usei ícone SVG, não emoji.
- [ ] Texto vindo dos autos está escapado.
- [ ] Testei o estado **vazio**, não só o preenchido.
- [ ] Testei no painel estreito (420px), não só no expandido.
- [ ] `[hidden]` continua funcionando nos blocos que criei.
