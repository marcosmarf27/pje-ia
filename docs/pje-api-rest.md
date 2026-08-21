# PJe — a API REST interna (`pje-legacy`)

> **O que é.** O catálogo das rotas REST que o próprio PJe expõe sob
> `/{base}/seam/resource/rest/pje-legacy/`, com a mecânica que explica por que
> elas **não custam tela JSF** — que é o motivo de a extensão preferi-las a
> qualquer caminho pela interface.
>
> **Estado.** Sondado em sessão real no **TJCE 1º grau, PJe 2.9.7.0, em
> 13/08/2026**, com o processo P2 (os números CNJ das medições são omitidos:
> repositório público — ver a legenda em `CLAUDE.md`). As rotas marcadas
> **CONFIRMADA** responderam ali; **nada** aqui foi verificado em outro tribunal
> ou outra versão.
>
> ⚠️ **Nada disto está em uso em `src/` além do que já estava** (a lista de peças
> da v0.38.0 e o download). Este documento é para consulta; aproveitar uma rota é
> decisão de outra rodada, e a regra vale como sempre: **rota nova entra como
> caminho preferido COM fallback para o atual**, nunca substituindo — foi assim
> que `listarPelaApi` → grid → scroll foi feito sem regressão.
>
> 🛑 **VEREDITO DA RODADA QUE ESCREVEU ISTO (13/08/2026): não implementar nada.**
> O catálogo é rico, mas as melhorias que ele permitiria são **medíveis e
> imperceptíveis** — diagnóstico melhor, milissegundos, mensagem de erro mais
> precisa. A extensão está rápida e boa depois da v0.38.0, e documentação nova não
> justifica mexer em código que funciona. A única hipótese com peso real (o
> `linkDownload` dispensar a ativação de ~5,6 s por peça, que é o gargalo
> verdadeiro) foi testada e **caiu** — ver a seção do descarte, mais abaixo.
>
> **A régua para voltar aqui é o ganho que o usuário SENTE**, não o que dá para
> medir. Consulte este arquivo quando faltar um dado do PJe; não o consulte
> procurando o que otimizar.

## Como este catálogo foi levantado, e por que isso importa

Três fontes, e a etiqueta de cada rota diz de onde ela veio:

| Etiqueta | Fonte | O que ela garante |
|---|---|---|
| `[fonte]` | Código-fonte Java do PJe legacy (CNJ, `git.cnj.jus.br/pje/pje`), snapshot de **08/10/2019** | que a rota existiu, e **o contrato de resposta** (os DTOs) |
| `[obs]` | Observada em uso por outra extensão de PJe (2026) | que alguém a usa hoje, sem contrato conhecido |
| `[nossa]` | Descoberta por nós sondando | o que já está em produção na extensão |

**Catálogo não é contrato vigente, e o exemplo está em casa:**
`processos/{id}/documentos` — a rota em que a v0.38.0 inteira se apoia — **não
existe no fonte de 2019**. Foi acrescentada depois. Na direção oposta,
`api/v1/dados-completos/`, que outra extensão usa hoje, deu **404** no TJCE.
Nenhuma das duas fontes descreve o servidor real: é a sondagem que decide.

O fonte de 2019 tem 18 classes com `@Path` e **148 rotas**. Este documento
cataloga as que estão sob `pje-legacy/` e sonda as alcançáveis.

### A fórmula da URL

```
/{base}/seam/resource/rest/  +  @Path da CLASSE  +  @Path do MÉTODO
   │                             │                    │
   │                             │                    └── "/{idProcesso}/movimentacoes"
   │                             └── "pje-legacy/processos"
   └── pje1grau, pje, pje2g… (varia por tribunal e grau; é o `getBase()` de pje.js)
```

O `rest` do meio vem de `components.xml`
(`<resteasy:application resource-path-prefix="/rest" scan-resources="true">`), e
o `seam/resource` do `SeamResourceServlet`. O `scan-resources="true"` também diz
uma coisa útil: **toda classe anotada com `@Path` é rota real exposta** — o
fonte pode ser lido como catálogo, não como amostra.

## Por que estas rotas não custam tela JSF

Esta é a parte do documento que muda decisões, e ela responde por mecanismo o
que o `CLAUDE.md` até aqui sustentava por medição ("~10 telas da grid contra
zero da API").

```xml
<!-- web.xml -->
<filter-name>Seam Filter</filter-name>
  <url-pattern>*.seam</url-pattern>
  <url-pattern>/seam/resource/rest/pje-legacy/*</url-pattern>   <!-- ← REST entra aqui -->

<servlet-name>Faces Servlet</servlet-name>
  <url-pattern>*.seam</url-pattern>
  <url-pattern>*.xhtml</url-pattern>                            <!-- ← e NÃO aqui -->
```

O **Faces Servlet** é o único que cria e despeja *view state*, e ele só atende
`*.seam`/`*.xhtml`. As rotas REST não passam por ele: **não criam view, e
portanto não empurram para fora a view da aba do usuário** — que é o mecanismo
inteiro do "Sua página expirou" descrito na seção *A sessão JSF é UMA fila só*
do `CLAUDE.md`. O que elas recebem é o **Seam Filter**, que dá o contexto de
sessão (é por isso que o cookie basta e não é preciso token nenhum).

**Confirmado empiricamente na mesma sondagem:** cerca de 60 requisições REST
seguidas, na mesma sessão, e ao fim a tela continuava viva — `ViewState`
presente no DOM, sem tela de erro, `isAuthenticated` ainda `true`. Com o teto de
view state da ordem de 15, se essas chamadas custassem view a sessão teria
morrido várias vezes.

### Regra de triagem: fora de `pje-legacy/`, não use

O Seam Filter cobre `*.seam` e `/seam/resource/rest/pje-legacy/*`, **e mais
nada**. As raízes do fonte que estão fora desse prefixo — `fluxo`,
`informacaoSessao`, `informacaoAudiencia`, `monitoracao`, `miniPac`,
`visibilidades` — ficam sem contexto de sessão.

Não é teoria: ao tentar sondá-las, **a requisição pendurou** e derrubou a
execução por timeout, duas vezes seguidas (a aba sobreviveu). Requisição que não
volta é pior que erro — numa extensão, prende o turno. **Não chame nada fora do
prefixo `pje-legacy/`.**

## O que serve à extensão (o quadro que decide trabalho futuro)

| Rota | Estado | O que ela substituiria / permitiria |
|---|---|---|
| `processos/{id}/movimentacoes` | **em uso** (v0.45.0) | A **linha do tempo processual no contexto do modelo** — ver a nota abaixo. `PJE.lerEventos()` continua como fallback, e o **pacote de carta precatória** ainda depende dele (precisa do par movimento↔peça da timeline, que esta rota dá de outra forma) |
| `api/v1/processos-judiciais/{id}` | **CONFIRMADA** | A ficha inteira em **formato MNI** do CNJ (`dadosBasicos`, `polo`, `assunto`, `valorCausa`, `orgaoJulgador`, `processoFisico`) numa requisição — hoje `lerCabecalhoProcesso()` raspa `#maisDetalhes`/`#poloAtivo`/`#poloPassivo` |
| `cadastro-partes/processos/{id}/partes` | **CONFIRMADA** | Os três polos já separados (`poloAtivoList`/`poloPassivoList`/`poloOutrosList`), com documento e tipo de parte |
| `usuario/isAuthenticated` | **CONFIRMADA** | Saber se a sessão está viva **antes** de gastar um postback. Hoje `telaMorta` infere pelo sumiço de `#divTimeLine` e precisa de segunda leitura para não dar falso positivo |
| `status/info` | **CONFIRMADA** | Versão, tribunal, instância e tipo de justiça — hoje o portão `PJE.dialeto` deduz tudo do base path |
| `processos/numero-processo/{CNJ}/validar` | **CONFIRMADA** | **CNJ → idProcesso.** Capacidade que a extensão não tem: hoje ela só funciona com o id que está na URL |
| `processos/{id}` | **CONFIRMADA** | Ficha enxuta (classe, órgão, status, jurisdição, distribuição, nível de acesso) |
| `processos/{id}/documentos` | **em uso** | A lista de peças (v0.38.0) |
| `api/v1/mobile/…/gerar-pdf/{id}` | **ERRO 500** | Seria o PDF oficial sem os dois postbacks JSF por peça do pacote de precatória. A rota existe (não é 404), mas devolve 500 com id de peça juntada — ver a nota abaixo |
| `api/v1/dados-completos/` | **AUSENTE (404)** | Nada: não existe nesta versão |
| `processos/{id}/atosProcessuais` | **VAZIA** | Nada por ora — responde 200 com `array[0]` neste processo, apesar de o DTO de 2019 prometer `nomeUsuarioJuntada` (o `juntadoPor` pelo qual a grid não foi removida). **Não conte com ela** sem testar em mais processos |

### A primeira rota do catálogo que virou recurso: `movimentacoes` (v0.45.0)

Este documento existia com o veredito "o fonte do CNJ ainda NÃO rendeu melhoria —
a régua é o ganho que o usuário SENTE". `movimentacoes` cruzou essa régua, e o
gatilho foi um relato: pedir a data do trânsito em julgado devolvia *"não é
possível determinar com segurança"*. Estava correto — **publicação, decurso de
prazo e trânsito são MOVIMENTOS**, e movimento quase nunca vira peça com texto.
O modelo recebia os PDFs e nada mais.

Medido no processo P3 (17/08/2026, sessão real): 25 movimentos,
~77 ms, uma requisição. O que a rota dá e o DOM não dava:

| | `lerEventos()` (DOM) | `movimentacoes` (REST) |
|---|---|---|
| Cobertura | só o trecho rolado da timeline | **alcança além do que a tela carregou** |
| Precisão da data | o DIA (`19 jun 2026`) | **epoch ms** — data e **hora** |
| Nome do ato | o texto que aparece na tela | **`codEvento` + `dsEvento` do CNJ** |
| Complemento | — | **`textoFinalExterno`**: *"Decorrido prazo de EUDES … em 16/07/2026 23:59"* |
| Custo | até 90 s de scroll para completar | ~77 ms, zero tela JSF |

O `textoFinalExterno` é o campo que fecha a conta: é ele que traz **a parte e a
hora exata do fim do prazo**. Sem ele há a data do decurso; com ele há o prazo.

Armadilhas do parsing e do consumo, todas cobertas por teste:

- **A rota devolve FORA DE ORDEM** (medido: o 1º item era o mais recente). Quem
  consome ordena — e ordena SEMPRE, sem confiar na entrega: pular o sort "porque
  o pje.js já ordenou" produziu a distribuição depois da sentença na primeira
  versão, e só o teste viu.
- **`textoFinalExterno` repete o `dsEvento`** em metade dos casos, e termina em
  `Documento: 207691389` quando há peça. Guardar os dois escrevia o mesmo número
  duas vezes na linha; o sufixo sai do texto e o id volta como `docs`.
- **A COBERTURA não foi medida em processo longo.** 25 movimentos não provam que a
  rota não pagine num processo de 400 — e é por isso que nem o código nem o bloco
  enviado ao modelo afirmam "lista completa do processo": afirmam a
  **procedência**. A verificação disponível de graça é POSITIVA: se a timeline do
  DOM mostra ato ANTERIOR ao mais antigo que a rota devolveu, a rota não alcançou
  o início do processo (o DOM carrega do mais recente para o mais antigo, então
  nunca a ultrapassa por acidente). Se algum dia der para medir num processo com
  centenas de movimentos, **anotar o número aqui** — é o que fecha a questão.
- **Toda chamada desta rota no caminho de um turno precisa de TETO DE TEMPO**
  (`AbortController`, 4 s, com desistência pela vida da página). Ela roda no
  começo de cada turno: um endpoint que aceita a conexão e nunca responde deixaria
  o Enter sem efeito nenhum e sem mensagem. Não é hipótese — é o que as rotas fora
  de `pje-legacy/` fizeram nesta mesma sondagem ("penduraram, que é pior que
  erro").

## Catálogo — família por família

Prefixo comum omitido: tudo abaixo começa em
`/{base}/seam/resource/rest/pje-legacy/`.

Legenda de estado: **✅ CONFIRMADA** (respondeu na sondagem) · **⬜ não sondada**
(não tínhamos o parâmetro, ou é escrita) · **❌ ausente** · **⚠️** ver nota.

### `processos` — o processo e suas peças  `[fonte]` + `[nossa]`

| M | Caminho | Estado | Resposta |
|---|---|---|---|
| GET | `/processos/{id}/documentos` `[nossa]` | ✅ 89 ms | `array[35]` `{id, descricao, data, binario, linkDownload}` |
| GET | `/processos/{id}` | ✅ 71 ms | `{idProcesso, numeroProcesso, classeJudicial, orgaoJulgador, conferido, status, jurisdicao, dataDistribuicao, nivelAcesso, temParteMoradorDeRua}` |
| GET | `/processos/{id}/status` | ✅ 71 ms | string JSON (`"D"`) |
| GET | `/processos/{id}/movimentacoes` | ✅ 77 ms | `array[24]` `{idProcessoEvento, codEvento, dsEvento, dataAtualizacao, textoFinalExterno}` |
| GET | `/processos/{id}/ultimoMovimento` | ✅ 90 ms | objeto, mesmos campos |
| GET | `/processos/{id}/atosProcessuais` | ⚠️ 200 vazio | `array[0]` — ver nota acima |
| GET | `/processos/{id}/atosProcessuais/{idDoc}` | ⬜ | — |
| GET | `/processos/{id}/poloPassivo` | ✅ 189 ms | `array` `{idProcessoParte, idPessoa, nomeParte, tipoParte, polo, documentoIdentificatorio, filiacoes, dataNascimento, tipoPessoa}` |
| GET | `/processos/{id}/tarefas` | ✅ 32 ms | `array` de **strings** (nomes das tarefas abertas) |
| GET | `/processos/numero-processo/{CNJ}/validar` | ✅ 301 ms | **o `idProcesso`** em texto (`3481639`) |

### `api/v1` — o que outra extensão usa hoje  `[obs]`

| M | Caminho | Estado | Resposta |
|---|---|---|---|
| GET | `/api/v1/processos-judiciais/{id}` | ✅ 228 ms | `{status:"ok", code:"200", result:{…}}` — o `result` é **MNI**: `dadosBasicos, competencia, codigoLocalidade, nivelSigilo, dataAjuizamento, polo, assunto, valorCausa, orgaoJulgador, processoFisico, any` (~4,8 KB) |
| GET | `/api/v1/dados-completos/` e `/{id}` | ❌ 404 | não existe no TJCE 2.9.7.0 |
| GET | `/documento/download/{…}` `[nossa]` | em uso | ver `urlsDownload` em `src/pje.js` — duas rotas, e só a completa serve peça HTML |

### `cadastro-partes` — partes e pessoas  `[fonte]`

| M | Caminho | Estado | Resposta |
|---|---|---|---|
| GET | `/cadastro-partes/processos/{id}/partes` | ✅ 83 ms | `{poloAtivoList, poloPassivoList, poloOutrosList}` |
| GET | `/cadastro-partes/processos/{id}/partes/ativo` | ✅ 165 ms | `array` `{id, participacao, partePrincipal, idPessoa, nomePessoa, tipoPessoa, documentoPrincipal, tipoParte}` |
| GET | `/cadastro-partes/processos/{id}/partes/passivo` | ✅ 123 ms | idem |
| GET | `/cadastro-partes/processos/{id}/partes/outros` | ✅ 31 ms | idem |
| GET | `/cadastro-partes/processos/{id}/partes/passivo-sem-advogado` | ⬜ | — |
| GET | `/cadastro-partes/carregar` | ✅ 113 ms | objeto (tabelas de apoio do cadastro) |
| GET | `/cadastro-partes/pessoas/cpf/{cpf}` | ⬜ | **não sondada de propósito** — consulta dado pessoal por CPF |
| GET | `/cadastro-partes/pessoas/{id}/enderecos`, `/documentos-identificacao`, `/profissoes/{p}` | ⬜ | idem |
| POST | `/cadastro-partes/pessoas/fisica/`, `/processo-partes/{id}/fisica` | ⬜ escrita | fora do escopo |

### `usuario`, `identity`, `parametros`, `status` — sessão e ambiente  `[fonte]`

| M | Caminho | Estado | Resposta |
|---|---|---|---|
| GET | `/usuario/isAuthenticated` | ✅ 47 ms | `true` |
| GET | `/usuario/currentUser` | ✅ 35 ms | `{login, nomeUsuario, idUsuario, idOrgaoJulgador, idPapel, descricaoPapel, visualizaSigiloso, nivelAcessoSigilo, cargoAuxiliar, …}` |
| GET | `/usuario/listarInformacaoUsuario` | ✅ 41 ms | os mesmos campos |
| GET | `/identity/auth` | ✅ 15 ms | `{username, name, email, enabled}` |
| GET | `/identity/roles/{login}` | ⬜ | — |
| GET | `/parametros/cabecalhoSistema` | ✅ 31 ms | `{nomeSistema, nomeSecaoJudiciaria, logoTribunal, subNomeSistema}` — **28 KB**, o logo vai embutido |
| GET | `/status/info` | ✅ **12 ms** | `{version:"2.9.7.0", tribunal:"…TJCE", instancia:"1G", tipoJustica:"JC"}` |
| GET | `/status/health` | ✅ **1413 ms** | `{status, details}` — **lenta**, provavelmente checa o banco |
| GET | `/status/envs`, `/status/eureka-config` | ⬜ | — |
| GET | `/usuario/variaveisSessao/adicionar/{v}/{valor}` | ⬜ escrita | é GET, mas **escreve** na sessão |
| POST | `/usuario/hasRole`, `/usuario/trocar-localizacao` | ⬜ escrita | fora do escopo |

### `painelUsuario` — 63 rotas, o painel de tarefas  `[fonte]` + `[obs]`

A maior família e a de menor interesse para a extensão, que é leitura de autos e
não gestão de tarefas. As de leitura confirmadas:

| M | Caminho | Estado | Resposta |
|---|---|---|---|
| GET | `/painelUsuario/dadosUsuario` | ✅ 33 ms | usuário + `podeEditarTags`, `podeVisualizarPainelMagistradoSessao` |
| GET | `/painelUsuario/historicoTarefas/{idProcesso}` | ✅ 33 ms | `{inicio, duracao, aberta, tarefas}` |
| GET | `/painelUsuario/processoTags/listar/{idProcesso}` | ✅ 45 ms | `array` `{id, nomeTag, nomeTagCompleto, idUsuario, idProcesso, idProcessoTag}` |
| GET | `/painelUsuario/orgaosJulgadores` | ✅ 58 ms | `array[536]` `{idOrgaoJulgador, nomeOrgaoJulgador}` |
| GET | `/painelUsuario/jurisdicoes` | ✅ 44 ms | `array[230]` `{idJurisdicao, jurisdicao}` |
| GET | `/painelUsuario/classesJudiciais` | ✅ 65 ms | `array[683]` `{idClasseJudicial, classeJudicial, classeJudicialSigla}` |
| GET | `/painelUsuario/prioridades/recuperar` | ✅ | `array` `{idPrioridadeProcesso, nomePrioridadeProcesso}` |
| GET | `/painelUsuario/assuntos`, `/estados`, `/municipios/{id}`, `/tiposSessao`, `/filtros/listar`, `/processoTags/todas` | ⬜ | tabelas de apoio |
| GET | `/painelUsuario/gerarChaveAcessoProcesso/{id}` | ⬜ | **o `ca` da URL** — gerado a partir do JSESSIONID do cookie (`SecurityTokenControler`). Já conhecido; não sondado nesta passada porque a ferramenta de automação bloqueia manipulação de token de sessão |
| GET | `/painelUsuario/transicoes/{idTarefa}`, `/recuperarProcesso/{idTaskInstance}/{ass}`, `/breadcrumb/…`, `/tagEdicao/{idTag}` | ⬜ | exigem `idTarefa`/`idTaskInstance`/`idTag`, que não temos |
| POST/PUT/DELETE | `/tarefas`, `/movimentar/{idTarefa}/{transicao}`, `/tags`, `/processoTags/inserir`, `/assinarTarefa`, `/conferenciaProcesso/…`, `/filtros`, … | ⬜ **escrita** | **movimentam processo de verdade.** Fora do escopo da extensão e fora da sonda, por decisão |

### `api/v1/mobile` — o app do PJe  `[fonte]`

| M | Caminho | Estado | Nota |
|---|---|---|---|
| GET | `/api/v1/mobile/processos/documentos/gerar-pdf/{id}` | ⚠️ **500** | `@Produces("application/pdf")`. Não é 404 — a rota **existe** —, mas com o id de uma peça juntada devolve 500. A leitura provável é que ela sirva ao fluxo de assinatura do app (minuta em tarefa), não a peça de autos. Vale reinvestigar com id de documento em elaboração antes de desistir: é a única alternativa vislumbrada aos dois postbacks JSF por peça do pacote de precatória |
| GET | `/api/v1/mobile/processos/tarefas-assinatura/{idLocalizacao}`, `/documentos/{taskId}` | ⬜ | exigem idLocalizacao/taskId |
| GET | `/api/v1/mobile/autenticacao/tokens`, `/validar-jwt` | ⬜ | autenticação do app, por JWT |
| PUT/POST | `/documentos/{id}`, `/documentos/assinar/{taskId}`, `/autenticacao/*` | ⬜ escrita | fora do escopo |

### `informacoes-criminais`, `modalAudienciaLote`, `modalPericiaLote`  `[fonte]`

| M | Caminho | Estado | Resposta |
|---|---|---|---|
| GET | `/modalAudienciaLote/tiposAudiencia` | ✅ 29 ms | `array[49]` `{id, tipo}` |
| GET | `/modalPericiaLote/especialidades` | ✅ 17 ms | `array[85]` `{id, nome}` |
| GET | `/modalAudienciaLote/salasAudiencia/{idTipo}?idsOJ=` · `/tempoAudiencia/{idTipo}` | ⬜ | exigem idTipoAudiencia |
| GET | `/informacoes-criminais/rascunhos/processo/{id}/{idProcessoParte}` (+ `/incidencias-penais`, `/prisoes`, `/solturas`, `/fugas`) | ⬜ | exigem `idProcessoParte` — que **sai das rotas de partes**, então são sondáveis numa próxima passada |
| GET | `/modalAudienciaLote/designar/{idTarefa}/{idProcesso}` | ⬜ **escrita** | é GET, mas **designa audiência**. Cuidado: nem toda escrita nesta API é POST |
| POST | `/informacoes-criminais/**` (criar/excluir incidência, prisão, soltura, fuga) | ⬜ escrita | fora do escopo |

### Fora do prefixo — **não usar**

`fluxo` (13 rotas), `informacaoSessao` (3), `informacaoAudiencia` (1),
`monitoracao` (3), `miniPac` (1), `visibilidades` (1). Sem Seam Filter; na
sondagem, **penduraram**.

## Investigado e DESCARTADO: o `linkDownload` não dispensa a ativação

A rota da lista devolve, por peça, um campo `linkDownload` que a v0.38.0 não
consome. Ele **não** é nenhuma das duas rotas que `urlsDownload` monta — é
`downloadProcessoDocumento.seam?id=…&codIni=…&md5=…&isBin=…`, com o que parece
autorização por documento (`codIni`, `md5`). Perfil de URL auto-autorizada, o
que levantou a hipótese de que dispensaria a **ativação JSF** (`ativarPeca`,
~5,6 s por peça e serializada) — que é o gargalo real da extensão.

**Medido em 13/08/2026, no processo P2 — a hipótese caiu:**

| Peça | rota de hoje (completa) | `linkDownload` |
|---|---|---|
| 212188076 Petição Inicial (HTML) | 200, **82 B** (casca) | 200, **18 B** (`<p>se…`) |
| 212193530 Petição (HTML) | 200, **82 B** (casca) | 200, **18 B** |
| 215378723 Ato Ordinatório (HTML) | 200, 44.479 B ✓ | 200, 44.415 B ✓ |
| 212188086 Comprovação (PDF) | 200, 434.482 B ✓ 136 ms | 200, 434.482 B ✓ 126 ms |

Nas peças que hoje voltam vazias, o `linkDownload` **também volta vazio** — só
troca a casca de 82 bytes por uma mensagem de 18. Nas que funcionam, entrega o
mesmo conteúdo no mesmo tempo.

**A conclusão importa mais que o descarte:** o conteúdo não está indisponível
por causa da *rota*, e sim porque o PJe **não materializa a peça até ela ser
aberta na sessão**. É estado no servidor. Nenhuma URL contorna isso, e a
ativação de ~5,6 s é inerente ao PJe legacy — não é dívida técnica nossa.

Duas notas de quem for reinvestigar:
- `linkDownload` é **relativo à raiz do contexto** (`/{base}/`), não à página
  atual. Resolvido contra a tela do painel dá 404 — foi o que aconteceu na
  primeira medição e quase enterrou a pista pelo motivo errado.
- O campo `binario` (também não consumido) separa PDF de HTML na origem: 22 e 13
  neste processo. Não muda o download — a extensão já tenta a rota completa, que
  serve os dois tipos —, mas é um sinal de graça caso um dia se queira escolher
  a rota antes de tentar.

## Armadilhas

- **Nem toda escrita é POST.** `painelUsuario/movimentar/{idTarefa}/{transicao}`,
  `modalAudienciaLote/designar/…` e `usuario/variaveisSessao/adicionar/…` são
  **GET** e alteram estado. Uma sonda ingênua que varresse "todos os GET do
  catálogo" movimentaria processo. Por isso a lista da sonda é **explícita**, e
  nunca gerada a partir do catálogo.
- **200 com corpo vazio existe.** Numa passada, rotas que respondiam
  normalmente devolveram `200` com zero byte; não reproduzi depois, em 15
  tentativas (inclusive 5 em paralelo, duas vezes). **Não sei a causa e não vou
  inventar uma.** A lição prática é a que o download de peça já ensinou: tratar
  *corpo útil*, não HTTP 200, como critério de sucesso — é a mesma "casca vazia"
  do `baixar()` em `pje.js`.
- **Concorrência não foi problema.** 5 requisições simultâneas responderam
  todas, duas vezes. Diferente do JSF, que é fila serializada.
- **`status/health` é lenta** (1,4 s contra 12 ms do `status/info`). Para saber
  versão ou se o serviço está de pé, use `/info`.
- **`cabecalhoSistema` custa 28 KB** por causa do logo embutido. Não é rota para
  chamar em laço.
- **O `id` de peça vem como número** em `processos/{id}/documentos`; a extensão o
  normaliza para string com `/^\d{4,}$/` (mesmo limiar do regex da timeline).

## Hipótese: isto pode alcançar o PJe novo (KZ/Angular)

Registrada como **hipótese não testada**, porque testá-la exige sessão num
tribunal que use o frontend novo (o relato é do TRT2), e não temos.

O material é do *pje-legacy*, então a leitura óbvia é que ele só descreve o que
já funciona. Mas o pacote `br.jus.cnj.pje.integracao.pje2` do fonte diz outra
coisa:

- `CorsFilter.getUrlPattern()` devolve exatamente `/seam/resource/rest/pje-legacy/.*`
  e libera CORS **para o cliente PJe 2**, com `Access-Control-Allow-Credentials: true`
  e cabeçalhos próprios (`x-pje-legacy-app`, `x-no-sso`, `X-pje-cookies`).
- `RestFilter` é um **proxy** (`HttpClient proxyClient` + `ProxyHttp.java`) entre
  os dois mundos, autorizando por *role*.
- O `README`/`Dockerfile` mostram o legado rodando como microserviço atrás de
  gateway e Eureka, com `ENV_PJE2_CLIENTE_URL='http://localhost:4200'` — a porta
  padrão do Angular.

Ou seja: **o frontend novo foi desenhado para consumir este mesmo backend, por
estas mesmas rotas.** Se num tribunal KZ existir um `/{base}/seam/resource/rest/
pje-legacy/…` alcançável, a extensão teria por onde funcionar lá — **atrás do
portão `PJE.dialeto`**, sem tocar num byte do ramo legacy.

**O experimento**, numa sessão logada de um tribunal KZ (barato, dois GET):

```js
// no console, com o processo aberto
const b = location.pathname.split("/")[1];            // "pjekz" no relato do TRT2
await (await fetch(`/${b}/seam/resource/rest/pje-legacy/status/info`,
                   {credentials:"include"})).text();   // versão? 404?
```

Se `status/info` responder, a família existe e o passo seguinte é achar o
`idProcesso` (que no KZ vive no PATH) e tentar `processos/{id}/documentos`. Se
der 404, a hipótese morre barato.

## Como sondar uma rota nova

Use `docs/pje-api-sonda.js` — cole no console com um processo aberto. Ele já
carrega as guardas que importam: só GET, sequencial com pausa, **controle
positivo e negativo** (sem eles um 404 é ambíguo — pode ser rota ausente ou
sonda quebrada), e relatório que mostra o **formato** da resposta e nunca o
conteúdo dos autos.

Depois de sondar, **confira na mesma aba se a tela ainda responde**. Se a
premissa de custo zero estiver errada em algum tribunal, é ali que aparece.

## Proveniência dos materiais

Os dois arquivos-fonte **não estão no repositório** e não devem entrar:

- `pje3-legacy-master.zip` — código do CNJ, 118 MB descompactado, **sem arquivo
  de licença no pacote**. Recebido em 13/08/2026; SHA-256 começa em `04f06ff9`.
- O bundle da outra extensão — código de terceiro. Lido apenas para saber
  **quais rotas existem** (fato sobre um sistema público); nenhuma linha dele foi
  aproveitada.

Deste documento para cá, o que existe é descrição nossa de uma interface, com a
origem de cada afirmação declarada.
