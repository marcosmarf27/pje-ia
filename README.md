<p align="center">
  <img src="docs/logo.png" alt="TecJustiça PJe" width="132">
</p>

<h1 align="center">TecJustiça PJe</h1>

<p align="center">
  <em>Análise de autos judiciais com IA — um projeto <a href="https://tecjustica.substack.com/">TecJustiça</a></em>
</p>

<p align="center">
  <a href="https://tecjustica.substack.com/"><img alt="Blog TecJustiça" src="https://img.shields.io/badge/blog-TecJusti%C3%A7a-0078aa?style=flat-square"></a>
  <a href="LICENSE"><img alt="Licença MIT" src="https://img.shields.io/badge/licen%C3%A7a-MIT-0078aa?style=flat-square"></a>
  <img alt="Chrome Manifest V3" src="https://img.shields.io/badge/Chrome-Manifest%20V3-005f88?style=flat-square&logo=googlechrome&logoColor=white">
  <img alt="Claude API" src="https://img.shields.io/badge/IA-Claude%20(Anthropic)-0078aa?style=flat-square">
  <img alt="Gemini API" src="https://img.shields.io/badge/IA-Gemini%20(Google)-005f88?style=flat-square">
  <img alt="PJe 1º grau" src="https://img.shields.io/badge/PJe-1%C2%BA%20grau-005f88?style=flat-square">
</p>

**TecJustiça PJe** é uma extensão Chrome que adiciona um assistente de IA à tela de autos digitais
do **PJe (Processo Judicial Eletrônico)**. Você marca as peças do processo, pergunta em
linguagem natural e o modelo — **Claude (Anthropic)**, **Gemini (Google)** ou **GPT (OpenAI)**, à sua
escolha — responde com base no conteúdo real dos documentos — resumos, linhas do tempo,
partes, pedidos, provas — direto na página do processo, com a interface na paleta visual
do próprio PJe.

<p align="center">
  <img src="docs/painel-expandido.jpg" alt="Painel expandido: peças categorizadas por cor, chips de contexto e resposta em tabela" width="720">
</p>

## 🎯 O que ele é — e o que ele não é

**TecJustiça PJe é um chat simplificado sobre os autos, não um agente autônomo.** Ele não navega
no processo sozinho: **você** seleciona as peças (pelos checkboxes ou digitando `@`) e, a
partir delas, faz perguntas, pedidos e gera documentos. A resposta usa somente os
documentos que você marcou — nada entra no contexto sem a sua escolha.

É um modelo diferente do de um **agente autônomo** — como o **Claude Code** ou agentes
construídos com a **Claude Agent SDK** e frameworks afins — que, conectado a um MCP
jurídico como o [TecJustiça MCP](https://mcp.tecjustica.com/) (demonstração com o PJe-CE
em [pjece.tecjustica.com](https://pjece.tecjustica.com/)), decide sozinho quais peças
abrir, lê os autos por conta própria e gerencia o contexto automaticamente.

| | **TecJustiça PJe (esta extensão)** | **Agente autônomo + MCP** (Claude Code, Agent SDK…) |
|---|---|---|
| Quem escolhe as peças | **Você**, manualmente | O agente decide o que abrir e ler |
| Fluxo | Marcar peças → perguntar → resposta | Delegar a tarefa → o agente navega e itera sozinho |
| Contexto | Limitado à janela do modelo (medidor no rodapé) | Gerenciado automaticamente pelo agente |
| Ideal para | Consultas dirigidas, resumos, relatórios de peças escolhidas | Autos muito volumosos, tarefas abertas de investigação |
| Instalação | Extensão Chrome + chave da API | Ambiente de agente (CLI/SDK) + servidor MCP |

Os dois se complementam: para o dia a dia dentro do PJe, o chat manual é direto e
previsível (você sabe exatamente o que a IA leu); para autos gigantes ou tarefas de
investigação aberta, um agente com MCP é o caminho — o próprio painel sugere o
[TecJustiça MCP](https://mcp.tecjustica.com/) quando o contexto enche.

## ✨ Recursos

### Conversa e modelos

- **Chat sobre os autos** — converse com o modelo sobre as peças selecionadas, com histórico multi-turno e streaming em tempo real (raciocínio do modelo em bloco colapsável).
- **Três provedores de IA** — modelos **Claude (Anthropic)**, **Gemini (Google)** e **GPT (OpenAI)** na mesma extensão: cadastre a chave do provedor que preferir (ou as três) e troque de modelo nas opções. Ver a tabela [Qual modelo escolher?](#-qual-modelo-escolher) abaixo.
- **Selo do modelo ativo** — a barra de ferramentas mostra o modelo e o nível de raciocínio em uso (ex.: "Gemini 3.6 Flash · raciocínio alto"), atualizado na hora ao salvar as opções; clique nele para abrir a configuração.
- **Custo por resposta** — o rodapé estima o custo em US$ de cada resposta e o acumulado da conversa, calculado pela tabela de preços do provedor (com o desconto de cache).
- **Citações com página** *(modelos Claude)* — as afirmações vêm com marcadores `[n]` e a lista de fontes ("Contestação, fl. 12") no rodapé; nos modelos Gemini a citação vem no próprio texto ("conforme a Contestação, fl. 12").
- **Busca de jurisprudência** 🔍 — toggle que libera pesquisa na web (fontes oficiais: STF, STJ, Planalto, LexML…), com a consulta em andamento exibida em tempo real. Nos modelos Gemini usa o Google Search.
- **Minutar** ✍️ *(nos três provedores)* — peça ao modelo o texto de um ato (despacho, decisão, sentença, parecer…) e ele abre num **editor de texto** próprio, em nova aba, já com a formatação forense (A4, margens 3/2 cm, Times 12, entrelinha 1,5, parágrafos justificados). Do editor você **⎘ copia formatado** para colar no editor de minutas do PJe, **⬇ baixa em `.docx`** (Word, gerado no próprio navegador) ou **🖨 imprime/salva em PDF**. Toda afirmação leva a origem `(peça · id · fl.)` e o que faltar nas peças vira `[COMPLETAR: …]`. Toda resposta longa do chat também ganha um botão **Abrir no editor**. O rascunho fica guardado no computador (7 dias) para reabrir depois.
- **Mapa mental** 🧠 *(nos três provedores)* — o modelo organiza as peças marcadas nos eixos da análise processual (partes, fatos, pedidos, teses, provas, audiências, decisões, prazos, situação) e a extensão abre um **mapa interativo** em nova aba (markmap): cada eixo com ícone e cor próprios, **tabelas** onde a informação é tabular, **pílulas** de folha, id da peça, data, valor e norma, e a origem (`peça · id · fl.`) em cada tópico. Nasce recolhido, com níveis de detalhe, zoom, tema escuro, impressão/PDF e download do texto em `.md`.
- **Biblioteca de prompts** ✦ — salve instruções que você repete (título + texto) e insira-as digitando **`/`** no início do campo: o prompt vira um chip elegante acima da caixa de texto e é enviado antes da sua mensagem. Gerenciamento (criar/editar/excluir) no botão **✦ Prompts**, e os prompts acompanham você em outros navegadores pela sincronização da conta Google.
- **OCR nativo** — peças digitalizadas (imagem) são lidas pelo próprio modelo, sem OCR externo.

### Seleção de peças

- **Checkboxes por documento** — só o que você marcar é enviado; chips acima do campo mostram as peças no contexto (com `×` para remover) e o contador indica `x/y`.
- **Atalho "principais"** — marca com um clique só as peças destacadas por categoria (decisões, audiências, petições e provas): o essencial da análise processual. "todas" marca a lista inteira; os dois respeitam a busca ativa.
- **Peças categorizadas por cor** — decisões (dourado), audiências (verde), petições (azul) e provas (violeta) ganham destaque automático, com vocabulário criminal (inquérito, flagrante, interrogatório, pronúncia…) e cível (reconvenção, acordo, quesitos…).
- **Busca na lista** — filtro instantâneo por título, ignorando acentos.
- **Menção com `@`** — digite `@` no campo de pergunta para buscar e marcar peças sem sair do teclado (`↑↓` navega, `Enter` marca, `Esc` fecha).
- **⟳ Carregar todas as peças** — o PJe só carrega os documentos conforme a linha do tempo é rolada; o botão rola tudo automaticamente para a lista ficar completa.
- **Preview no hover** — nos modos largos, passar o mouse numa peça abre a pré-visualização do PDF/texto; "Abrir documento" busca peças ainda não carregadas.
- **Ver na timeline** — cada peça tem um botão que localiza e destaca o documento na linha do tempo do PJe.

### Contexto, custo e confiabilidade

- **Medidor de contexto dinâmico** — barra mostra quanto da janela do modelo (tokens e páginas de PDF) a conversa ocupa, atualizada ao marcar/desmarcar peças **antes mesmo do envio**, com alertas em 70% e 90%. Desmarcar uma peça **libera contexto de verdade** no request seguinte.
- **Files API + anexo incremental** — cada peça sobe uma única vez; os turnos seguintes reaproveitam o que já está na conversa.
- **Cache automático** — os PDFs anexados são cacheados pela API (~90% mais barato nos turnos seguintes), nos três provedores.
- **Retry automático** — sobrecarga da API, limites momentâneos e quedas de conexão no meio do streaming são re-tentados sozinhos, sem duplicar texto na tela.
- **PDF × HTML detectados automaticamente** — peças HTML viram texto puro (fração do custo de um PDF); a detecção confere o content-type **e** a assinatura `%PDF-` do binário.
- **Erros amigáveis** — chave inválida, conta sem crédito, limites e sobrecarga explicados em português.

### Interface

- **Quatro modos de painel** — flutuante, expandido, tela cheia e **lateral** (o processo fica visível e clicável ao lado do chat).
- **Ocultar a lista de peças** — nos modos expandido/tela cheia, um botão no cabeçalho colapsa a coluna de documentos para dar todo o espaço ao chat (a seleção continua valendo).
- **Progresso por peça** — card com o estado de cada peça (aguardando → baixando → pronta) ao preparar a análise.
- **Respostas formatadas** — markdown completo: tabelas, listas, títulos e citações.
- **Exportar a conversa** — baixe o diálogo em `.md` ou copie cada resposta com um clique.

## 🧠 Qual modelo escolher?

| Modelo | Janela / PDF | Preço (US$/1M tokens) | Perfil |
|---|---|---|---|
| **Claude Haiku 4.5** (padrão) | 200 mil / 100 págs. | 1 / 5 | Rápido e barato; citações `[n]` clicáveis |
| **Claude Sonnet 5** | 1M / 600 págs. | 3 / 15 | Autos volumosos; todos os recursos |
| **Claude Opus 4.8** | 1M / 600 págs. | 5 / 25 | Qualidade superior para análises delicadas |
| **Claude Fable 5** | 1M / 600 págs. | 10 / 50 | O mais capaz — e o mais caro e lento |
| **Gemini 3.6 Flash** | 1M / 1000 págs. | 1,50 / 7,50 | Rápido e multimodal, ótimo custo para autos grandes |
| **Gemini 3.5 Flash-Lite** | 1M / 1000 págs. | 0,30 / 2,50 | O mais barato e veloz — triagens e resumos |
| **GPT-5.6 Luna** | 1,05M tokens | 0,20 / 1,20 | O GPT rápido e econômico; citações no texto |
| **GPT-5.6 Terra** | 1,05M tokens | 2 / 12 | GPT equilibrado entre custo e capacidade; citações no texto |
| **GPT-5.6 (Sol)** | 1,05M tokens | 5 / 30 | O GPT mais capaz; citações no texto |

> Nos modelos Gemini e GPT, as citações de página vêm no próprio texto (sem os marcadores `[n]` clicáveis) — essa é a única diferença; minutar e o mapa mental funcionam igual nos três provedores. Trocar de provedor (Claude, Gemini ou GPT) no meio de uma conversa pede "Nova conversa".

## 🚀 Instalação

<p align="center">
  <a href="https://github.com/marcosmarf27/pje-ia/releases/latest/download/pje-ia.zip">
    <img alt="⬇️ Baixar a extensão (.zip)" src="https://img.shields.io/badge/⬇️%20Baixar%20a%20extens%C3%A3o-pje--ia.zip-0078aa?style=for-the-badge&labelColor=0a3d5c">
  </a>
</p>

> A extensão ainda não está na Chrome Web Store — instale em modo desenvolvedor (leva 1 minuto):

1. **[Baixe o pje-ia.zip](https://github.com/marcosmarf27/pje-ia/releases/latest/download/pje-ia.zip)** (última versão) e **extraia** para uma pasta fixa (ex.: `Documentos\pje-ia`).
   - O Chrome carrega a extensão dessa pasta — não a apague depois.
2. Abra `chrome://extensions` e ative o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e selecione a pasta extraída (a que contém o `manifest.json`).
4. Clique no ícone **TecJustiça PJe** na barra do Chrome, cole sua chave de API — da **Anthropic**
   (modelos Claude) e/ou do **Google** (modelos Gemini) — escolha o modelo e salve.
   - Não tem chave? O popup traz um **guia passo a passo** para criar a chave: Anthropic no
     [console.anthropic.com](https://console.anthropic.com), Google no
     [aistudio.google.com](https://aistudio.google.com/apikey).

**Para atualizar:** baixe o novo `.zip`, extraia por cima da mesma pasta e clique em **↺ Atualizar** em `chrome://extensions`. (Quem preferir pode continuar usando `git clone` + carregar a pasta do repositório.)

## 📖 Como usar

1. Faça login no PJe e abra os **autos de um processo** (tela da linha do tempo de documentos).
2. Clique no botão **⚖️ Analisar com IA** no canto inferior direito da página.
3. Clique em **⟳ Carregar todas as peças** (abaixo da lista) — o PJe só carrega os documentos conforme a linha do tempo é rolada; sem esse passo a lista pode estar incompleta.
4. Marque as peças da análise — o atalho **principais** seleciona as destacadas por categoria de uma vez; a busca e o **`@`** no campo acham peças pelo nome (ex.: `@contestação`).
5. Pergunte — por exemplo:
   - *"Resuma o pedido da inicial e os argumentos da contestação"*
   - *"Monte uma tabela com a linha do tempo dos atos"*
   - *"Quais provas foram juntadas e o que cada uma demonstra?"*
6. Siga a conversa: **adicionar** peças no meio é barato (aproveita o cache); para **remover** várias ou mudar de assunto, prefira **⟲ Nova conversa**. O medidor e o custo ficam no rodapé; o selo mostra o modelo ativo.

**Atalhos:** `@` cita peças no campo · `/` insere um prompt salvo · `Enter` envia · `Shift+Enter` quebra linha · com os popups `@` e `/` abertos: `↑↓` navega, `Enter`/`Tab` seleciona, `Esc` fecha · botões do cabeçalho: `⇄` painel largo, `▯` lateral, `⤢` tela cheia, `▤` oculta/exibe a lista de peças (modos largos), `↺` nova conversa.

### ✦ Prompts salvos: escreva a instrução uma vez, use sempre

Aquelas instruções que você repete em todo processo (relatório de audiência, linha do
tempo dos atos, análise de prescrição) viram **prompts salvos**. Digite **`/`** no
início do campo de mensagem, busque pelo título e selecione: o prompt entra como um
**chip** acima da caixa de texto — passe o mouse nele para reler o texto completo — e é
enviado antes do que você escrever na hora. Para criar, editar ou excluir, use o botão
**✦ Prompts** na barra de ferramentas (ou a linha *Gerenciar prompts…* do próprio
popup). Eles ficam no `chrome.storage.sync`, então acompanham você em qualquer Chrome
logado na mesma conta Google.

<p align="center">
  <img src="docs/biblioteca-de-prompts.gif" alt="Biblioteca de prompts: digitar / abre o popup de prompts salvos, a busca filtra pelo título e o prompt escolhido vira um chip acima do campo de mensagem" width="860">
</p>

### 🧠 Mapa mental: o processo inteiro numa página

Quando o que você precisa é **enxergar a estrutura** do feito — e não ler mais um
relatório —, marque as peças e clique em **🧠 Mapa mental**. A instrução padrão
(editável, como ao minutar) aparece no campo e o botão Enviar vira **Gerar mapa**;
a resposta abre em **nova aba** como um mapa interativo, com o número do processo no
centro e um ramo por eixo (partes, fatos, pedidos, teses, provas, situação atual).

O mapa nasce **recolhido**: clique num círculo para abrir o ramo, use os botões de
**detalhe 1/2/3/Tudo** para abrir vários de uma vez, arraste para mover, role para
dar zoom. Cada eixo tem ícone e cor próprios (a mesma paleta das categorias de peças),
e o que é tabular — partes, linha do tempo — vira **tabela** dentro do nó. Folhas,
ids de peça, datas, valores e artigos ganham **destaque colorido**.

**Toda afirmação aponta a origem**: cada tópico traz, em linha própria, a peça, o
**id do documento** (o número que abre o título da peça na timeline do PJe) e a
**folha** — é assim que você reencontra o trecho nos autos. O cabeçalho mostra
quantos tópicos vieram com peça e folha. Ainda dá para alternar o **tema escuro**,
baixar o texto em **`.md`** e **imprimir** (ou salvar em PDF, já enquadrado).

> O mapa mental funciona **nos três provedores** — Claude, Gemini e GPT —, porque é um
> chat comum, sem execução de código. Os mapas ficam disponíveis enquanto o
> navegador estiver aberto.

<p align="center">
  <img src="docs/mapa-mental.gif" alt="Mapa mental do processo: começa recolhido nos eixos, abre em níveis de detalhe com tabelas de partes e decisões, mostra a peça, o id e a folha de origem em cada tópico e alterna para o tema escuro" width="880">
</p>

### ✍️ Minutar: da análise ao ato, num editor de verdade

O chat explica o processo; **minutar** escreve a peça. Marque os documentos, clique em
**✍️ Minutar** (a instrução padrão, editável, aparece no campo) e o modelo redige o ato
cabível — despacho, decisão, sentença, parecer. A resposta abre em **nova aba** num
**editor WYSIWYG** ([Jodit](https://xdsoft.net/jodit/)) já com a formatação forense:
A4, margens 3/2 cm, Times 12, entrelinha 1,5, títulos centralizados e parágrafos
justificados com recuo de primeira linha.

No editor você revisa, ajusta e então:

- **⎘ Copia formatado** — leva o texto rico para a área de transferência, pronto para
  colar no editor de minutas do PJe sem perder títulos, negrito e justificação;
- **⬇ Baixa `.docx`** — Word de verdade, gerado **no próprio navegador**
  ([docx](https://docx.js.org)), com as mesmas medidas da tela (tabelas nativas,
  numeração, estilos de título);
- **🖨 Imprime / salva em PDF** — pelo diálogo nativo do Chrome, só a folha.

**Toda afirmação leva a origem** `(Peça, id 123456, fl. 7)` e, onde falta dado nas peças,
o modelo deixa `[COMPLETAR: …]` para quem assina preencher — nada de número, data ou
precedente inventado. O rascunho fica **guardado no computador por 7 dias** para você
reabrir e continuar; **Descartar**, no editor, apaga na hora. Como o mapa, minutar é um
chat comum: funciona **em qualquer modelo**, Claude, Gemini ou GPT.

> A minuta é uma sugestão de trabalho, não um ato: revise o texto e confira as citações
> nos autos antes de usar.

<!-- VITRINE: grave a tela "✍️ Minutar → Gerar minuta → editor" e salve como docs/minutar.gif;
     depois troque este comentário pelo bloco abaixo:
<p align="center">
  <img src="docs/minutar.gif" alt="Minutar: marcar as peças, clicar em Minutar, o modelo redige o ato e abre em nova aba no editor WYSIWYG com formatação forense; copiar formatado e baixar .docx" width="880">
</p>
-->

### 🏛️ Todos os tribunais, sem configurar nada

A extensão funciona em **qualquer tribunal que rode PJe** (TJs, TRFs, TRTs — 1º ou 2º
grau, incluindo o PJe na nuvem do CNJ em `*.cloud.pje.jus.br`), automaticamente: a
permissão cobre todos os sites da Justiça (`https://*.jus.br`) desde a instalação.
O botão **⚖️ Analisar com IA** aparece sozinho quando você abre a tela de autos
digitais de um processo — em páginas que não são de autos (login, portais), a
extensão não injeta nada.

> A compatibilidade depende de o tribunal usar a tela de autos padrão do PJe
> (linha do tempo + endpoint de download `pje-legacy`) — o caso da grande maioria
> das instalações do CNJ.

<p align="center">
  <img src="docs/mencao-arroba.jpg" alt="Popup de menção @: busca de peças com badges de contexto e ícones por categoria" width="720">
</p>

## 🏗️ Arquitetura

```mermaid
flowchart LR
    subgraph Página do PJe
        A[content.js<br>orquestração] --> B[pje.js<br>timeline + download REST]
        A --> C[panel.js<br>chat em Shadow DOM]
    end
    A -- Port --> D[background.js<br>service worker]
    D --> E[claude.js<br>streaming SSE]
    D --> H[gemini.js<br>streaming SSE]
    E -- x-api-key --> F[(API Anthropic<br>Claude)]
    H -- x-goog-api-key --> I[(API Google<br>Gemini)]
    G[(chrome.storage.local<br>chaves + modelo)] --> D
```

| Módulo | Papel |
|---|---|
| `src/pje.js` | Lista as peças na timeline e baixa cada uma pelo endpoint REST do PJe (sessão do usuário). Ativa peças "não abertas" automaticamente. |
| `src/panel.js` / `panel.css` | UI do chat em Shadow DOM (isolada do CSS do PJe): seletor de peças, menção `@`, prompts salvos `/`, chips de contexto, card de progresso e renderizador markdown próprio e seguro. |
| `src/prompts.js` | Biblioteca de prompts do usuário: CRUD no `chrome.storage.sync` (um item por prompt), sincronizado entre os navegadores da mesma conta Google. |
| `src/content.js` | Orquestra: downloads paralelos, cache por peça, prompt caching, conversa multi-turno. |
| `src/background.js` + `claude.js` / `gemini.js` / `openai.js` | Service worker que guarda as chaves e chama a API do provedor do modelo escolhido (Anthropic, Google ou OpenAI) com streaming. **As chaves nunca são expostas à página.** |
| `src/mapa.html` + `mapa.js` / `mapa.css` | Página do **mapa mental**: converte o Markdown da resposta em árvore de nós (com ícones por eixo, tabelas e realces de fl./id) e desenha com markmap (d3), em aba própria da extensão. |
| `vendor/` | `d3.min.js` e `markmap-view.js` oficiais, sem modificação, usados **só** pela página do mapa (nunca carregados nas páginas do PJe). Licenças em `vendor/LICENSES.md`. |
| `src/popup.html` | Configuração em 1 clique no ícone da barra (chave, modelo, guia de primeiros passos). |

## 🔒 Privacidade e segurança

- As chaves de API ficam **somente** no `chrome.storage.local` do seu navegador (não sincronizam, não passam por servidores de terceiros).
- Os documentos marcados são enviados **diretamente à API do provedor do modelo escolhido** (Anthropic, Google ou OpenAI) — nenhum outro serviço intermedia.
- A extensão só roda em sites da Justiça (`*.jus.br`), só injeta o painel em telas de autos do PJe e não coleta telemetria.
- Política completa em [PRIVACY.md](PRIVACY.md) — sem servidor próprio, sem analytics, o desenvolvedor nunca tem acesso a nenhum dado.

> ⚠️ **Aviso legal:** autos judiciais podem conter dados pessoais e sigilosos. O uso da
> extensão — e o envio de peças a um provedor de IA — é de responsabilidade do usuário,
> observadas as normas do tribunal, a LGPD e eventuais segredos de justiça. As respostas
> da IA são apoio à leitura, **não substituem** a análise jurídica humana.

## 🗺️ Roadmap

- [x] Files API para processos muito volumosos
- [x] Exportar a análise (copiar/.md/DOCX)
- [x] Suporte a outros tribunais que usam PJe (TJs/TRFs/TRTs) — automático em qualquer `*.jus.br`
- [x] Carregamento automático da timeline completa (peças fora da rolagem)
- [x] Segundo provedor de IA — Google Gemini (3.6 Flash / 3.5 Flash-Lite)
- [x] Terceiro provedor de IA — OpenAI GPT-5.6 (Luna / Terra / Sol)
- [x] Preview de peças, modo lateral e "ver na timeline"
- [x] Mapa mental interativo das peças (markmap), nos três provedores
- [x] Biblioteca de prompts do usuário (`/` no campo, sincronizada entre navegadores)
- [ ] Compaction para conversas muito longas
- [ ] Limpeza de uploads antigos na Files API
- [x] Publicação na Chrome Web Store — v0.9.9 **aprovada e publicada**; atualização **v0.14.0** (rebrand TecJustiça PJe, Gemini, editor de minutas, mapa mental) em publicação

## 🤝 Contribuindo — mesmo sem saber programar

> **Este repositório foi feito para ser editado com IA.** Na raiz existe um arquivo
> [`CLAUDE.md`](CLAUDE.md) com a arquitetura, as decisões e as armadilhas do projeto —
> o Claude Code lê esse arquivo **sozinho** ao abrir a pasta. É por isso que um
> servidor, assessor ou advogado sem formação em programação consegue fazer um ajuste
> real aqui: você descreve o comportamento que quer **em português**, a IA escreve o
> código respeitando as regras do projeto, você testa no seu Chrome e manda o PR.

Sentiu falta de alguma coisa? Uma categoria de peça do seu tribunal que não é
reconhecida, um texto confuso, um atalho que faria sentido no seu dia a dia? **Faça você
mesmo e me mande** — eu avalio e, estando bom, entra na próxima versão para todo mundo.

### 1. Faça um fork (sua cópia do projeto)

No topo desta página, clique em **Fork** → **Create fork**. Você acabou de criar
`github.com/SEU-USUARIO/pje-ia`, uma cópia sua onde pode mexer à vontade sem afetar o
original. Precisa de uma conta no GitHub (gratuita).

### 2. Abra o projeto no Claude Code

Há dois caminhos. Ambos exigem um plano pago da Anthropic — **Pro, Max, Team ou
Enterprise** (o plano gratuito do Claude.ai não inclui o Claude Code).

**Caminho A — sem instalar nada (mais fácil):**
[claude.ai/code](https://claude.ai/code) roda na nuvem (em pré-lançamento para Pro, Max e
Team). Conecte sua conta do GitHub, escolha o seu fork do `pje-ia`, descreva o que quer —
ele cria a branch e **abre o pull request sozinho**. Só não dá para testar a extensão no
navegador por ali: é o caminho para textos, ajustes pequenos e documentação.

**Caminho B — no seu computador (permite testar de verdade):**

1. Instale o [Git](https://git-scm.com/downloads/win) (no macOS já vem).
2. Instale o [**app do Claude**](https://claude.com/download) (Windows e macOS), que traz
   o Claude Code com interface gráfica — sem terminal, com revisão visual das alterações.
   (Quem prefere terminal: `irm https://claude.ai/install.ps1 | iex` no PowerShell e
   depois `claude` dentro da pasta do projeto.)
3. Baixe o seu fork para o computador (isso é o *clone*), de um destes jeitos:
   - **Pelo app:** aba **Code** → **Local** → **Select folder**, escolha uma pasta vazia
     (ex.: `Documentos\pje-ia`) e mande na primeira mensagem:
     `Clone https://github.com/SEU-USUARIO/pje-ia.git aqui`.
   - **Pelo terminal**, e depois abra essa pasta no app:

     ```bash
     git clone https://github.com/SEU-USUARIO/pje-ia.git
     cd pje-ia
     ```

### 3. Peça a mudança em português

Escreva o que você quer como explicaria a um colega. Não precisa dizer *como* fazer nem
saber em que arquivo mexer:

- *"No meu tribunal as peças de execução fiscal se chamam 'CDA' e 'Certidão de Dívida Ativa'. Faça a lista reconhecer isso como categoria de prova."*
- *"A fonte do chat é pequena para quem tem dificuldade de enxergar. Adicione um controle de tamanho do texto no cabeçalho."*
- *"Quando eu marco mais de 20 peças, quero um aviso de que a resposta vai demorar."*
- *"O botão 'Minutar' devia lembrar a última instrução que usei."*

O Claude Code vai ler o `CLAUDE.md`, encontrar os arquivos certos, propor o código e
**esperar sua aprovação** antes de alterar qualquer coisa (modo Manual, o padrão).

### 4. Teste no seu Chrome antes de mandar

Este é o passo que faz a diferença entre um PR aceito e um PR devolvido — e é fácil:

1. Abra `chrome://extensions` e ative o **Modo do desenvolvedor**.
2. **Carregar sem compactação** → selecione a pasta do repositório (a que tem o `manifest.json`).
3. Abra os autos de um processo no PJe, use a extensão e confira se sua mudança funciona
   **e se nada mais quebrou** (painel, seleção de peças, envio, mapa mental).
4. Mexeu de novo? Clique em **↺ Atualizar** em `chrome://extensions` e **recarregue a aba do PJe**.

Se algo der errado, aperte **F12** no PJe, copie o erro do Console e cole no Claude Code —
ele corrige. Peça também: *"valide a sintaxe com `node --check src/*.js`"* (o projeto não
tem build; é assim que se confere).

> ⚠️ **Nunca coloque no PR a sua chave de API, número de processo, nome de parte ou
> qualquer trecho de autos.** Prints são bem-vindos — desde que borrados.

### 5. Abra o pull request

Peça ao Claude Code: *"faça o commit e abra um pull request explicando a mudança"*. Ou,
pelo site: a página do seu fork mostra **Contribute → Open pull request**.

**O que ajuda a aprovar rápido:**

- **Uma coisa por PR.** Duas melhorias sem relação = dois PRs.
- **Diga o problema, não só a solução:** "no TJXX a peça Y aparece sem cor porque…".
- **Um print ou GIF** do antes e depois.
- **Diga onde testou:** tribunal, tela do PJe e modelo usado (Haiku, Gemini…).
- Não mexa em `vendor/` (bibliotecas de terceiros, mantidas intactas de propósito).

Eu leio todos os PRs. Se algo não estiver certo, comento explicando o motivo — e você
pode colar meu comentário no Claude Code para ele ajustar.

**Voltando depois?** O projeto anda rápido. Antes de começar uma nova contribuição,
atualize seu fork: na página dele, **Sync fork** → **Update branch** (e, no computador,
`git pull`). Assim você parte da versão mais recente e evita conflitos.

### Só quer relatar um problema?

Não precisa de nada disso: abra uma
**[issue](https://github.com/marcosmarf27/pje-ia/issues/new)** contando o que aconteceu,
em qual tribunal, e cole a mensagem de erro do painel (o Console do F12 também ajuda).

## 📄 Licença

[MIT](LICENSE) © marcosmarf27

---

<p align="center"><sub>Feito com ⚖️ para quem lê autos o dia inteiro. Não afiliado ao CNJ, à Anthropic, ao Google nem à OpenAI.</sub></p>
