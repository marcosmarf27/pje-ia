# Estudo preliminar — suporte ao SEEU na extensão TecJustiça PJe

## RESUMO PARA DECISÃO

### É possível?

**Sim, com alta confiança.** E isto não é opinião: o SEEU foi medido por dentro nesta
sessão, num processo real de execução penal (número omitido: repositório público). Sei onde está a lista, quantos itens
tem (286 movimentações, 108 com arquivo), qual rota baixa a peça (`/seeu/arquivo.do`) e
como o processo é identificado (o CNJ direto).

Mais que possível: **o SEEU é tecnicamente MAIS SIMPLES que o PJe.** As três coisas que
mais doem na extensão hoje — a ativação serializada de ~5,6 s por peça, o ViewState que
mata a tela ("Sua página expirou") e a leitura da grid em iframe — **não existem lá**.

### Há risco de regressão?

**Há exatamente UM, e ele tem nome, endereço e teste.**

`src/content.js`, linha 14: `if (window.top !== window.self) return;`

O SEEU é um frameset e os autos vivem num frame de terceiro nível, então essa linha o
barra. Mudá-la exige ligar `all_frames: true` — e é a **única** alteração de toda a
rodada que toca o caminho do PJe.

O risco concreto: com `all_frames`, o content script passa a rodar dentro do iframe que
a leitura da grid do PJe abre — e lá existe `#divTimeLine`. Sem cuidado, um segundo
painel invisível seria montado. **É uma regressão silenciosa**, e por isso ela ganha um
teste dedicado antes de qualquer outra coisa.

Todo o resto é risco **zero por construção**:

| | |
|---|---|
| `pje.js` | não é editado |
| `panel.js` (a UI inteira) | não muda uma linha |
| `manifest` `matches` | já cobre `seeu.pje.jus.br` — nenhuma permissão nova, nenhum novo aviso de instalação |
| `main` | não recebe nada; tudo em branch, com tag e o `.zip` publicado como retorno |
| Commit de risco | atômico e separado dos commits de recurso — `revert` cirúrgico |

### Há complexidade?

**Sim, mas não onde parece.** Ela não está no adaptador — está em dois outros lugares:

1. **Uma linha que muda de significado** (a guarda de frame acima). Pouco código,
   atenção máxima.
2. **O domínio da execução penal** — e esta é a maior fatia do escopo "paridade total".
   As tabelas que fazem a extensão parecer inteligente (`RE_CHAVE`, `CATEGORIAS`,
   `ESPECIES_ATO`) descrevem processo de conhecimento. Na execução penal a peça-chave é
   o **atestado de pena**, não a sentença. Herdar as tabelas do PJe **não dá erro**: dá
   seleção errada, em silêncio. **Isso é trabalho jurídico, não de programação.**

O adaptador em si (`seeu.js`) estimo em **350 a 600 linhas** — menos que `pje.js` (1.840),
porque a maquinaria JSF não tem equivalente.

### Semáforo

| Frente | Avaliação |
|---|---|
| Viabilidade técnica | 🟢 comprovada por medição |
| Risco de regressão | 🟡 um ponto único, nomeado, com teste dedicado e revert cirúrgico |
| Complexidade do código | 🟢 abaixo do PJe |
| Complexidade de domínio | 🔴 a maior fatia — e não se resolve programando |
| Permissões / Web Store | 🟢 nada muda |

**Recomendação:** vale seguir, começando pela Fase 1 (o andaime), que **não entrega
recurso nenhum** e serve só para provar que o PJe continua intacto. Se ela passar, o
resto é incremental e sempre reversível.

---

## Context

O usuário quer saber **o quão complexo é** dar suporte ao SEEU (`seeu.pje.jus.br`, v20.5.1)
na mesma extensão que hoje atende o PJe 1.x. Restrição dura: **zero regressão no PJe**.

Isto é um estudo de viabilidade, não autorização de implementação.

Decisões já tomadas pelo usuário:
- Escopo: **paridade total** (chat, minuta, mapa, `.zip`, memória de caso).
- Arquitetura: **`seeu.js` novo + despachante `autos.js`**, `pje.js` intocado.
- **Branch separada**, `main` protegida (ver "Isolamento").

### Correção de rumo desta sessão

A primeira versão deste estudo terminava dizendo que "a URL da tela de autos bloqueia
tudo". **Estava errado, e o usuário mandou testar — com razão.** A URL do topo é sempre
`seeu.pje.jus.br/seeu/` e **nunca muda**, porque o SEEU é um frameset: eu estava
caçando no documento de topo uma rota que só existe dentro de um frame. Nada estava
bloqueado; faltava olhar no lugar certo. O mapa abaixo foi todo **medido em sessão real**
num processo real de execução penal, cujo número é omitido aqui de propósito.

---

## Veredito

**Não é refatoração grande — é um adaptador novo.** E, medido o SEEU por dentro, ele é
**tecnicamente MAIS SIMPLES que o PJe**: a maquinaria mais cara e mais frágil da extensão
(ativação JSF serializada de ~5,6 s por peça, ViewState que expira, grid lida em iframe,
timeline com scroll infinito) **não tem equivalente no SEEU** — vira código que o
adaptador simplesmente não precisa ter.

O risco real é um só, e é de plataforma, não de domínio de dados: **o frameset**.

---

## Mapa técnico do SEEU (medido, 21/08/2026)

### Estrutura de páginas — três níveis de frame

```
top                          https://seeu.pje.jus.br/seeu/     (frameset, URL FIXA)
 └─ [1]  /seeu/usuario/areaAtuacao.do?_tj&codigo&tipoAreaAtuacao   (menu + casca)
     └─ [0] /seeu/visualizacaoProcesso.do?actionType&numeroUnico   ← OS AUTOS
```

- `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 **Frameset**//EN">`, frame montado por JS.
- **`numeroUnico` é o CNJ sem máscara** (20 dígitos, ex.: `00000000000000000000`) — a identidade do
  processo é o próprio número, não um id interno opaco como o `idProcesso` do PJe.

### Movimentações — tudo renderizado no servidor

- Tabela HTML com **573 linhas = 286 movimentações × 2 + cabeçalho** (2 linhas por
  movimentação: a linha visível e a de detalhe).
- Colunas: `Seq. | Data (com hora) | Evento | Ações Auto. | Movimentado Por`.
- **Não há scroll infinito.** Paginação por formulário:
  `POST /seeu/visualizacaoProcesso.do` com `movimentacoesPageSize` e
  `movimentacoesPageNumber` — controlável, e o `pageSize` provavelmente permite pedir
  tudo de uma vez (a confirmar).
- **Não há ViewState.** O token é `_tj`, e ele não expirou em nenhuma das ~40
  requisições desta sessão.

### Documentos — 1 POST por movimentação

- **108 das 286 movimentações têm arquivo** (ícone `iPlus.gif`/`iMinus.gif`).
- Expandir dispara `POST /seeu/processo/movimentacaoArquivoDocumento.do?_tj=…` → 200,
  que devolve o HTML dos arquivos daquela movimentação. Medido: expandir uma movimentação
  **sem** arquivo não gera requisição nenhuma (é só toggle de visibilidade).
- O link do arquivo aponta para **`/seeu/arquivo.do?_tj=…`** e traz o **nome real com
  extensão** (ex.: `… .pdf`) — metadado que o PJe não dá de graça.

### O achado que muda o desenho do adaptador: `_tj` é por link, não por sessão

Cada ação tem seu **próprio** `_tj` (o do `areaAtuacao` difere do `movimentacaoArquivoDocumento`,
e `arquivo.do` tem o `_tj` como **único** parâmetro — ou seja, o token codifica *qual
arquivo*). Consequência direta:

> **No SEEU não se MONTA a URL de download — colhe-se o link renderizado.**

É o oposto de `PJE.urlsDownload(id)`, que constrói a URL a partir de tribunal/grau/ids.
Um adaptador que tentasse sintetizar URL no SEEU não funcionaria, e a falha seria
silenciosa. `listarDocumentos` e `baixar` ficam **acoplados**: só se baixa o que foi
listado (o link precisa ter sido renderizado antes).

### Comparação honesta

| Eixo | PJe 1.x | SEEU |
|---|---|---|
| Lista de peças | timeline lazy + grid (~10 telas JSF, mata a view) | tabela server-side, paginação por form |
| Estado da sessão | ViewState JSF — "Sua página expirou" | **sem ViewState**; token `_tj` estável |
| Abrir peça | clique A4J **serializado**, ~5,6 s/peça | POST AJAX direto, sem serialização aparente |
| Metadados | tipo oficial só via grid | Evento + autor + **hora** já na tabela |
| Id do processo | `idProcesso` interno | **CNJ direto** |
| URL de download | montável (`urlsDownload`) | **não montável** — tem de ser raspada |
| Injeção do painel | documento de topo | **frame de 3º nível** ⚠ |

---

## O que já está pronto do lado da extensão (medido)

| Evidência | Valor | Por que importa |
|---|---|---|
| `manifest.json` `matches` | `https://*.jus.br/*` | **Já cobre `seeu.pje.jus.br`.** Zero permissão nova, zero mudança no aviso de instalação |
| `panel.js` (6.912 linhas, a UI inteira) | **0 chamadas a `PJE.`** | As 2 ocorrências são comentários. UI 100% agnóstica |
| `exportar.js` (877 linhas) | **0** referências a `PJE.`/`document.` | Já é puro por projeto |
| `seam/resource`, `pje-legacy`, `A4J`, `ViewState`, `activationChain`, `pje1grau` fora de `pje.js` | **0 ocorrências** | Toda a maquinaria HTTP/JSF está encapsulada |
| `#divTimeLine` fora de `pje.js` | **3** (`content.js:1888`, `:6265`, `:6269`) | Observer + bootstrap |
| `content.js` → `PJE.` | **47 chamadas / 22 métodos** | A superfície exata do contrato |

Os três provedores, streaming SSE, memória de caso, editor de minutas, mapa mental,
bibliotecas de prompts e modelos, tour e escritor de ZIP **rodam no SEEU sem uma linha
de mudança**, desde que o adaptador entregue o contrato.

---

## O risco central: frameset × a guarda de topo

`src/content.js:14`:

```js
if (window.top !== window.self) return;
```

Não é zelo: `PJE.listarPelaGrid` abre **um iframe com a própria URL dos autos**, onde
existe `#divTimeLine`. Sem essa linha, um painel inteiro (observers, porta para o worker,
requisição de caps) seria montado num frame invisível a cada leitura da grid.

- **PJe exige** "só topo".
- **SEEU exige** rodar num frame de **terceiro nível**.

Resolução: `all_frames: true` no manifest — **a única mudança que atinge todas as páginas
`jus.br`, inclusive as do PJe** — e a guarda passa a ser decidida pelo dialeto, com o ramo
PJe preservado byte a byte:

```js
// PJe: exatamente o comportamento de hoje (só topo).
// SEEU: o frame de visualizacaoProcesso.do é quem hospeda.
if (!AUTOS.ehDocumentoDosAutos()) return;
```

Custos a **medir**, não supor: os 11 content scripts passam a ser avaliados em todo frame
de toda página `jus.br`. `all_frames` **não é permissão** e não muda o aviso de instalação.

Questão de UI ainda em aberto (Fase 0): o painel monta **dentro** do frame de autos
(confinado a ele) ou o frame desenha em `window.top.document` (same-origin permite, e daria
o painel flutuando sobre a janela inteira)? A primeira é mais segura; a segunda é melhor de
usar. **O topo é um `<frameset>`, que não tem `<body>`** — então "montar no topo" exige
substituir o frameset, o que está fora de cogitação.

---

## O risco que continua sendo o maior: domínio

Isto não muda com o mapeamento técnico, e no escopo "paridade total" é a maior fatia.

As tabelas que fazem a extensão parecer inteligente estão calibradas para **processo de
conhecimento**: `CATEGORIAS`, `RE_CHAVE`, `RE_RUIDO`, `refinarRelevancia` e `ESPECIES_ATO`.
Na execução penal a hierarquia se inverte:

- a peça-chave não é a inicial nem a sentença — é a **guia de recolhimento**, o **atestado
  de pena** e o **cálculo de liquidação**;
- faltam remição, progressão de regime, livramento condicional, falta grave, PAD, exame
  criminológico, atestado de conduta carcerária;
- `refinarRelevancia` procura "a primeira petição nas 5 mais antigas" — premissa que não
  vale numa execução de **7.218 dias** e 286 movimentações;
- `ESPECIES_ATO` da minuta muda inteira (decisão de progressão, homologação de remição,
  decisão de falta grave).

Herdar as tabelas do PJe não dá erro: dá o degrau "chave" selecionando as peças erradas,
**em silêncio** — o pior modo de falha do projeto.

**Nota favorável:** a coluna `Evento` do SEEU é vocabulário CNJ e vem pronta na tabela,
sem precisar da grid. A classificação por *tipo oficial* — que no PJe custa ~10 telas JSF —
no SEEU é de graça.

---

## Privacidade muda de patamar

A capa do SEEU exibe, na primeira tela: CPF, RG, nome da mãe, RJI, local de prisão e
situação carcerária. É PII sensível de pessoa presa, num volume que a capa do PJe não tem.
`PRIVACY.md`, `help.html` e o ponteiro para o TecJustiça Sigilo precisam de passada
específica antes de qualquer publicação.

---

## Arquitetura

```
src/pje.js      → INTOCADO             (adaptador PJe, 1.840 linhas)
src/seeu.js     → NOVO                 (adaptador SEEU, mesmo contrato)
src/autos.js    → NOVO (~30 linhas)    window.AUTOS = ehSeeu() ? SEEU : PJE
src/content.js  → PJE.  vira  AUTOS.   (47 pontos, troca mecânica)
                  + a guarda de frame
src/panel.js    → ZERO mudanças
manifest.json   → + all_frames: true, + src/seeu.js, + src/autos.js
```

`autos.js` entra no manifest **depois** de `pje.js` e `seeu.js` e **antes** de `content.js`.

**Valores neutros, nunca exceções.** `listarPelaGrid`, `baixarPdfOficial`, `ativacaoEmVoo`,
`gestoJsf`, `telaDosAutosViva`, `ehTelaDeErro`, `contadorAtivacoes` e
`carregarTimelineCompleta` não têm equivalente no SEEU — devolvem valor neutro, exatamente
o padrão que `caso.js` já usa. Precedente interno, não invenção.

**O portão de dialeto se estende:** `AUTOS.dialeto()` passa a devolver
`"legacy" | "kz" | "seeu"`. A UI de não-suportado (`panel.setNaoSuportado`, bloco `.naosup`)
já existe e serve às telas do SEEU ainda não cobertas.

---

## Isolamento e reversibilidade

Nada toca a `main`. O projeto funciona bem e a Store está em dia — esse estado é o ativo
a proteger, e já é um ponto de retorno.

- **Branch `feat/seeu`** a partir de `main` em `ed8b195` (árvore limpa, Publicada = 0.47.0).
- **Retorno em duas camadas**: o commit `ed8b195` e o artefato `tecjustica-pje-v0.47.0.zip`
  no disco — que é o pacote publicado. Voltar não exige rebuild nem rede.
- **Tag `v0.47.0-pre-seeu`** no commit de partida: um nome legível é o que alguém acha sob
  pressão meses depois.
- **NÃO bumpar versão na branch** (número gasto é número queimado na fila da Store).
- **Nunca publicar na Store a partir desta branch.**
- **O commit de risco é ATÔMICO e separado dos de recurso.** A Fase 1 (troca `PJE.`→`AUTOS.`,
  guarda de frame, `all_frames`) é a única que toca o caminho do PJe: commit/PR próprio,
  **revertível sozinho**, sem arrastar nada do SEEU. Misturar transformaria um `git revert`
  cirúrgico em cirurgia.
- **Teste em paralelo**: carregar a branch desempacotada (ID diferente) mantém a versão da
  Store instalada e em uso. As duas convivem no mesmo Chrome.

---

## Fases

**Fase 0 — Fechar as lacunas do mapa (curta, já 80% feita).** Restam quatro perguntas, todas
respondíveis numa sessão: (a) `arquivo.do` devolve o PDF direto ou uma casca? (o `fetch`/XHR
falhou nesta sessão — provável interferência de outra extensão); (b) `movimentacoesPageSize`
aceita pedir todas as movimentações de uma vez? (c) o que o menu **Exportar ▼** oferece —
pode haver rota de autos consolidados que dispensa os 108 POSTs; (d) o painel monta dentro
do frame ou desenha no topo. Entregável: `docs/seeu-*.md`, irmão dos do PJe.

**Fase 1 — Andaime e não-regressão.** `autos.js`, troca mecânica, guarda de frame,
`all_frames`. `seeu.js` nasce esqueleto (`dialeto() === "seeu"`, `suportado() === false`).
**Ao fim: PJe byte a byte igual, SEEU mostrando o aviso de não suportado.** É o commit mais
importante da rodada e não entrega recurso nenhum.

**Fase 2 — Núcleo do SEEU.** Identidade (CNJ), ficha, lista de movimentações, descoberta de
arquivos (os 108 POSTs, com concorrência a definir), download por link raspado. Com a
maquinaria JSF fora, estimo `seeu.js` em **350 a 600 linhas** — menos que o `pje.js`.

**Fase 3 — Movimentações e memória de caso.** Aqui o SEEU deve render bem: `Seq | Data com
hora | Evento | Movimentado Por` é melhor do que a extensão consegue extrair do PJe hoje,
e a linha do tempo é o eixo natural de uma execução penal.

**Fase 4 — Domínio.** As tabelas do risco acima, em arquivo próprio, selecionadas por
dialeto. **Maior que a Fase 2**, e não é trabalho de programação.

**Fase 5 — Paridade.** Minuta (com `ESPECIES_ATO` da execução), mapa, `.zip`. Nota: o SEEU
tem `processo/cartaPrecatoria.do` — o pacote de precatória pode ter equivalente.

---

## Não-regressão: o contrato

1. **`pje.js` não é editado.** Se precisar ser, a Fase 1 falhou e o desenho volta à mesa.
2. **A troca `PJE.` → `AUTOS.` é mecânica**: nenhuma linha muda além do identificador.
3. **Teste de boot em jsdom já existe** e é a rede contra o modo de falha desta troca (a
   zona morta temporal do `content.js`).
4. **Teste novo obrigatório: o iframe da grid sob `all_frames: true`.** Reproduzir
   `listarPelaGrid` e provar que **nenhum segundo painel** é montado dentro do iframe. Esta
   é a regressão que a mudança de guarda pode introduzir, e seria silenciosa.
5. **Smoke test no PJe real antes de qualquer publicação**, medindo o custo de `all_frames`
   numa tela de autos grande.

---

## Verificação

- `node --check src/*.js` + ESLint descartável de duas regras (`no-undef`, `no-unused-vars`)
  — obrigatório após renomeação em massa, que é exatamente o caso (é o modo de falha do
  `ehPdf`, que derrubou a exportação inteira).
- Teste de boot do `content.js` em jsdom, com stub de `AUTOS`.
- Teste novo do iframe da grid sob `all_frames: true`.
- No PJe real: abrir processo, marcar peça, enviar, minutar, exportar `.zip` — comparando
  com a v0.47.0.
- No SEEU real: painel monta no frame certo, **uma única vez** (três níveis de frame = três
  chances de montar duplicado).

---

## ENTREGÁVEL DESTA RODADA — a divisão em etapas

**Nada de implementação.** Nenhum arquivo de `src/`, `manifest.json`, `vendor/`, `icons/`
ou `empacotar.ps1` é tocado. O produto é uma pasta `Planos/` com **17 arquivos `.md`**:
o estudo original preservado + 13 etapas numeradas + 3 transversais. Os arquivos
*contêm* código, como receita para execução futura — nenhuma linha é aplicada agora.

### A ideia que governa a ordem

O risco todo mora numa coisa só: ligar `all_frames`. A sequência foi desenhada para que,
quando essa etapa chegar, **tudo o mais já esteja validado** — e para que cada etapa antes
dela seja **inócua por construção**, não por confiança:

```
Etapa 03:  autos.js faz  AUTOS = PJE   ← alias puro, nada muda
Etapa 04:  content.js troca PJE. → AUTOS.  ← inócuo POR CONSTRUÇÃO (AUTOS é PJE)
Etapa 05:  a guarda de frame vai para AUTOS, com a MESMA lógica de hoje
Etapa 06:  all_frames: true            ← A ÚNICA etapa de risco, sozinha e revertível
```

Se algo quebrar na 06, não há dúvida sobre a causa: as três anteriores não mudaram
comportamento nenhum, e há teste provando isso.

**`pje.js` continua intocado de verdade.** O método novo (`ehDocumentoDosAutos`) nasce em
`autos.js` por composição — `Object.assign({}, PJE, { ehDocumentoDosAutos })` —, nunca
editando o adaptador do PJe.

### As etapas

| # | Arquivo | O que faz | Depende de | Toca o PJe? |
|---|---|---|---|---|
| 00 | `00-ESTUDO-VIABILIDADE.md` | **Cópia fiel** deste estudo — o "porquê" | — | não |
| 01 | `01-preparacao-e-rede-de-seguranca.md` | branch `feat/seeu`, tag `v0.47.0-pre-seeu`, conferir árvore limpa e o `.zip` de retorno | 00 | não |
| 02 | `02-baseline-de-testes.md` | Escrever e rodar a suíte **contra o código atual, intocado**. Tudo verde = baseline | 01 | não |
| 03 | `03-autos-js-alias-puro.md` | `src/autos.js` com `AUTOS = PJE` + manifest. Nada muda | 02 | manifest |
| 04 | `04-troca-mecanica-content.md` | `PJE.` → `AUTOS.` nos 47 pontos de `content.js` | 03 | sim (mecânico) |
| 05 | `05-guarda-de-frame.md` | `content.js:14` vira `if (!AUTOS.ehDocumentoDosAutos()) return;`, com a lógica de hoje | 04 | sim |
| 06 | `06-all-frames.md` | ⚠ **A ETAPA DE RISCO.** Só o manifest. Teste do iframe da grid é o portão | 05 | **sim** |
| 07 | `07-seeu-esqueleto-e-deteccao.md` | `seeu.js` mínimo: reconhece o SEEU e diz "não suportado". PJe inalterado | 06 | não |
| 08 | `08-mapa-do-seeu.md` | Fase 0: fechar as 4 lacunas (`arquivo.do`, `pageSize`, menu Exportar, onde montar). **Só investigação** | 07 (pode antecipar) | não |
| 09 | `09-seeu-identidade-ficha-movimentacoes.md` | CNJ, ficha do processo, tabela de 286 movimentações | 08 | não |
| 10 | `10-seeu-pecas.md` | Descoberta dos arquivos (108 POSTs) + download por link **raspado** | 09 | não |
| 11 | `11-ligar-o-chat.md` | `suportado() = true`: o chat funciona no SEEU | 10 | não |
| 12 | `12-dominio-execucao-penal.md` | Tabelas por dialeto: atestado de pena, remição, progressão, falta grave | 11 | não |
| 13 | `13-paridade.md` | Minuta (espécies da execução), mapa, `.zip` | 12 | não |

### Transversais

| Arquivo | Papel |
|---|---|
| `README.md` | Índice, ordem, a regra de ouro, como usar com um agente |
| `TESTES.md` | A suíte completa e rodável: boot em jsdom, caminho do envio, **o teste do iframe da grid**, checklist de smoke |
| `ROLLBACK.md` | Como voltar atrás **em cada etapa**, do `git revert` cirúrgico ao `.zip` publicado |

### Regras que todos os arquivos carregam

- Abrem com **pré-condições** e fecham com **critério de pronto verificável** — nada de
  "está pronto quando parecer pronto".
- Todo código vem com **arquivo e ponto de inserção exato**.
- Etapas 04–06 trazem o **teste antes do código**.
- Etapa 06 tem **portão explícito**: sem o teste do iframe verde, não se avança.
- **Os scripts de teste moram dentro dos `.md`.** O projeto deliberadamente não versiona
  testes (não há `package.json`; o CLAUDE.md manda rodá-los no scratchpad) — mantê-los
  como texto em `Planos/` respeita a convenção e ainda assim os versiona.
- `Planos/` fica **fora do pacote da Store por construção**: `empacotar.ps1` copia só
  `src/`, `manifest.json`, `vendor/` e `icons/` — a mesma garantia que já vale para `cli/`.

---

## Uma escolha para MUITO mais tarde (não bloqueia nada)

Escrevi isto de forma obscura na primeira versão. Em português claro:

Hoje existe **uma** extensão publicada na Chrome Web Store — "TecJustiça PJe", ID
`imgfakkieoijdhdpafjjlefcckbmbppm`. O nome, a descrição e as capturas dela dizem que é
uma ferramenta **para o PJe**.

Quando o suporte ao SEEU estiver pronto e testado, há duas maneiras de entregá-lo:

- **(A) Na mesma extensão.** Sai numa atualização normal; quem já tem instalada recebe o
  SEEU automaticamente. Custo: reescrever nome/descrição/capturas da ficha, porque ela
  passaria a atender também execução penal.
- **(B) Como uma segunda extensão na Store**, com ID próprio e ficha só de SEEU. A
  publicada não é tocada, mas passam a existir **duas** publicações para manter, duas
  revisões da Store a cada versão, e quem usa os dois sistemas instala duas extensões.

**Recomendo (A)**, e por coerência com a arquitetura que você já escolheu: `seeu.js` +
`AUTOS` existe exatamente para ter **um** código-base. Publicar dois produtos recriaria,
no nível da Store, a bifurcação que a opção "extensão separada" tinha e que você
descartou.

**Isto não decide nada agora e não bloqueia nenhuma fase.** É uma escolha de publicação,
para o dia em que houver o que publicar — e até lá nada vai à Store, porque a branch
nunca publica.
