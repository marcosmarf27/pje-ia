# Etapa 07 — `seeu.js` esqueleto e detecção

**Depende de:** 06 (`all_frames` ligado e validado)
**Toca o PJe?** **Não.** A partir daqui nada mais altera o caminho do PJe.
**Objetivo:** a extensão passa a **reconhecer** o SEEU e a dizer honestamente "ainda não
sei ler este sistema", em vez de ficar muda.

---

## Por que reconhecer antes de saber ler

Duas razões, e a segunda é a que mais importa:

1. **Prova o despacho de ponta a ponta** sem nenhum risco: se o painel aparece no SEEU
   com o aviso correto, então `ehSeeu()`, `ehDocumentoDosAutos()` e o `all_frames` da
   etapa anterior estão todos funcionando. Um erro aqui é barato.
2. **Silêncio é pior que recusa.** É a mesma regra que o projeto já aplica em três lugares
   (a `.sel-nota` dos degraus, o estado vazio da biblioteca de modelos, a `.minutabar` sem
   modelos): **conjunto vazio se explica, não desaparece.** A UI de não-suportado já
   existe — `panel.setNaoSuportado`, bloco `.naosup` — e nasceu para o PJe KZ.

---

## O sinal é POSITIVO, nunca "a lista veio vazia"

Regra herdada do portão de dialeto do PJe KZ e que vale igual aqui: a detecção olha para
**o que a página É** (host e path), nunca para **o que falhou**. Um heurístico de falha
("a lista veio vazia, deve ser outro sistema") acusaria de não-suportado um PJe legado
cuja timeline ainda não carregou — trocaria um silêncio por uma afirmação falsa, que é
pior.

---

## Passo 1 — Criar `src/seeu.js`

```js
// Adaptador do SEEU (Sistema Eletronico de Execucao Unificado, seeu.pje.jus.br).
// Irmao de `pje.js`: cumpre o MESMO contrato, e `autos.js` escolhe qual dos dois
// responde na pagina atual.
//
// NESTA ETAPA e um ESQUELETO: reconhece o SEEU e declara `suportado() === false`.
// Todo metodo devolve valor NEUTRO em vez de lancar -- o mesmo padrao de `caso.js`
// ("toda funcao devolve valor NEUTRO"), e o que permite ao content.js rodar seu
// fluxo normal sem um unico `if (ehSeeu)` espalhado.
//
// ESTRUTURA DO SEEU (medida em 21/08/2026, v20.5.1) -- ver Planos/00-ESTUDO:
//   top                     /seeu/                       frameset, URL FIXA
//    +-- [1] /seeu/usuario/areaAtuacao.do                menu + casca
//         +-- [0] /seeu/visualizacaoProcesso.do          <- OS AUTOS
// A URL do topo NUNCA muda, entao a identificacao tem de sair do FRAME.
var SEEU = (function () {
  // ---- Deteccao -----------------------------------------------------------
  // Sinal POSITIVO (host/path), nunca "a lista veio vazia": um heuristico de
  // falha acusaria de nao-suportado um PJe cuja timeline ainda nao carregou.
  function ehSeeu() {
    return (
      /(^|\.)seeu\./i.test(location.hostname) ||
      /^\/seeu(\/|$)/i.test(location.pathname)
    );
  }

  // "Este documento hospeda os autos?" -- a resposta do SEEU para a pergunta que
  // no PJe e "sou o topo?". Aqui e o contrario: o topo e um <frameset> (que nem
  // <body> tem), e os autos vivem num frame de TERCEIRO nivel.
  function ehDocumentoDosAutos() {
    return /\/seeu\/visualizacaoProcesso\.do$/i.test(location.pathname);
  }

  // ---- Identidade ---------------------------------------------------------
  // `numeroUnico` e o CNJ sem mascara (ex.: 00000000000000000000) -- diferente do
  // PJe, onde o id e um inteiro interno opaco.
  function getNumeroUnico() {
    return new URLSearchParams(location.search).get("numeroUnico");
  }

  function getBase() {
    return location.pathname.split("/")[1] || "seeu";
  }

  function dialeto() {
    return "seeu";
  }

  // AINDA NAO. Vira true na etapa 11, quando lista e download existirem.
  function suportado() {
    return false;
  }

  // NEUTRO ate a etapa 09. Devolver null aqui e intencional: com chave nula a
  // memoria de caso se desliga sozinha, em vez de agrupar processos distintos
  // sob uma chave inventada.
  function chaveDoCaso() {
    return null;
  }

  function getIdProcesso() {
    return getNumeroUnico();
  }

  function getNumeroProcesso() {
    return null; // etapa 09
  }

  // ---- Contrato, com valores NEUTROS --------------------------------------
  // Os metodos abaixo existem porque o content.js os consome. Muitos sao
  // PJe-especificos e NUNCA terao equivalente no SEEU (nao ha JSF, nao ha
  // ViewState, nao ha grid em iframe, nao ha timeline lazy): eles ficam neutros
  // para sempre, e isso e o desenho, nao uma pendencia.
  const naoSeAplica = {
    listarPelaGrid: async () => null,
    carregarTimelineCompleta: async () => ({ ok: false }),
    baixarPdfOficial: async () => null,
    ativacaoEmVoo: () => false,
    contadorAtivacoes: () => 0,
    gestoJsf: () => {},
    telaDosAutosViva: () => true,   // no SEEU nao ha view que expire
    ehTelaDeErro: () => false,
    scrollAte: () => false,
    temNaTimeline: () => false,
  };

  // A implementar (etapas 09 e 10). Neutros por enquanto.
  const aImplementar = {
    listarDocumentos: () => [],
    listarPelaApi: async () => null,
    listarMovimentacoes: async () => null,
    lerEventos: () => [],
    lerCabecalhoProcesso: () => null,
    baixar: async () => { throw new Error("SEEU: download ainda nao implementado"); },
    lerAnexo: async () => { throw new Error("SEEU: leitura de anexo ainda nao implementada"); },
  };

  function dlog() { /* diagnostico proprio entra na etapa 09 */ }

  return Object.assign({}, naoSeAplica, aImplementar, {
    ehSeeu,
    ehDocumentoDosAutos,
    dialeto,
    suportado,
    chaveDoCaso,
    getBase,
    getIdProcesso,
    getNumeroProcesso,
    dlog,
    _getNumeroUnico: getNumeroUnico, // exposto para teste fora do navegador
  });
})();
```

> **`baixar` e `lerAnexo` LANÇAM em vez de devolver neutro**, ao contrário do resto. É
> deliberado: `null` num download significa "esta rota não serviu, tente outra", e faria o
> chamador gastar caminhos alternativos para terminar dizendo "a peça retornou vazia" —
> afirmação falsa. Lançar sobe o motivo real para o relatório de peças que não entraram.

---

## Passo 2 — `autos.js` passa a escolher

Substituir o corpo por:

```js
var AUTOS = (function () {
  // Regra do PJe (era content.js:14): so o documento de topo, porque
  // `listarPelaGrid` abre um iframe com a PROPRIA URL dos autos, onde existe
  // #divTimeLine -- sem isto, cada leitura da grid montaria um painel invisivel.
  function ehDocumentoDosAutosPJe() {
    return window.top === window.self;
  }

  // O SEEU se anuncia por host/path (sinal POSITIVO). `SEEU` e opcional pelo
  // mesmo motivo que `MLIB`/`DocxImport` sao: sem o arquivo, o despachante
  // degrada para o PJe e nada quebra.
  if (typeof SEEU !== "undefined" && SEEU.ehSeeu()) return SEEU;

  // Composicao, nunca edicao de `pje.js` (INTOCADO por contrato).
  return Object.assign({}, PJE, {
    ehDocumentoDosAutos: ehDocumentoDosAutosPJe,
  });
})();
```

---

## Passo 3 — Manifest

```diff
       "js": [
         "src/pje.js",
+        "src/seeu.js",
         "src/autos.js",
```

`seeu.js` **antes** de `autos.js` (que o lê) e depois de `pje.js`.

---

## Passo 4 — O bootstrap precisa alcançar o SEEU

`content.js`, no fim do arquivo, hoje monta o painel só se `#divTimeLine` existir — um
seletor **do PJe**. No SEEU ele nunca existe.

```diff
-  if (document.querySelector("#divTimeLine")) {
+  if (AUTOS.ehDocumentoDosAutos() && (AUTOS.dialeto() !== "legacy" || document.querySelector("#divTimeLine"))) {
     iniciar();
   } else {
```

> **Cuidado:** o ramo `else` (o `MutationObserver`) continua PJe-específico e está certo
> assim — a timeline do PJe pode surgir depois do load. No SEEU a página é renderizada no
> servidor e o documento já nasce completo. Mantenha o observer olhando `#divTimeLine`.

Uma alternativa mais limpa, se preferir menos condição inline: adicionar ao contrato um
`AUTOS.telaDeAutosPronta()` — no PJe devolve `!!document.querySelector("#divTimeLine")`,
no SEEU devolve `true`. **Recomendado**, porque tira o último seletor do PJe do
orquestrador.

---

## Verificação

```bash
node --check src/seeu.js && node --check src/autos.js && node --check src/content.js
git status --short   # M autos.js, M content.js, M manifest.json, ?? src/seeu.js
```

**No PJe** (não pode ter mudado nada):
```js
AUTOS.dialeto()             // "legacy"
AUTOS.suportado()           // true
AUTOS.ehDocumentoDosAutos() // true
```

**No SEEU**, com um processo aberto:
```js
AUTOS.dialeto()              // "seeu"
AUTOS.suportado()            // false
AUTOS.ehDocumentoDosAutos()  // true  ← só no frame visualizacaoProcesso.do
AUTOS.getIdProcesso()        // o numeroUnico
```

E na tela: **o painel monta, uma única vez, com o bloco `.naosup`** dizendo que o sistema
ainda não é lido.

---

## Critério de pronto (verificável)

- [ ] `src/pje.js` intocado (conferir em `git status`)
- [ ] No PJe: **nada mudou** — suíte verde + smoke completo
- [ ] No SEEU: painel monta **uma vez** e mostra o aviso de não suportado
- [ ] O painel **não** monta nos outros dois frames do SEEU (topo e `areaAtuacao`)
- [ ] Console sem erro novo em nenhum dos dois sistemas

---

## Commit

```bash
git add src/seeu.js src/autos.js src/content.js manifest.json
git commit -m "feat(seeu): a extensao reconhece o SEEU e diz que ainda nao o le

Esqueleto com contrato de valores neutros. Deteccao por sinal POSITIVO
(host/path), nunca por 'a lista veio vazia'. PJe intocado."
```

---

**Próxima:** [`08-mapa-do-seeu.md`](08-mapa-do-seeu.md)
