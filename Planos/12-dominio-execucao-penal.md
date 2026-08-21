# Etapa 12 — Domínio: execução penal

**Depende de:** 11 (chat funcionando)
**Toca o PJe?** Não — **desde que as tabelas sejam selecionadas por dialeto.**
**Objetivo:** fazer a extensão entender o que importa numa execução penal.

> **Esta é a maior etapa do plano, e a menos parecida com programação.** O código é trivial
> (tabelas de regex selecionadas por dialeto). O trabalho é jurídico: decidir o que é peça
> essencial numa execução. Reserve tempo de **conhecimento**, não de teclado.

---

## O problema, em uma frase

As tabelas que fazem a extensão parecer inteligente descrevem **processo de conhecimento**.
Numa execução penal a hierarquia se inverte — e herdar as tabelas do PJe **não dá erro**:
dá o degrau `chave` selecionando as peças erradas, **em silêncio**.

Silêncio é o modo de falha mais caro do projeto. Uma peça que não aparece não pede socorro.

---

## O que muda

| Tabela | Hoje (conhecimento) | Execução penal |
|---|---|---|
| `RE_CHAVE` | petição inicial, contestação, sentença | **guia de recolhimento**, **atestado de pena**, **cálculo de liquidação**, decisão de progressão, atestado de conduta carcerária |
| `CATEGORIAS` | decisões/audiências/petições/provas | acrescentar **incidentes** (remição, progressão, livramento, falta grave) e **documentos prisionais** |
| `RE_RUIDO` | expediente cartorário | acrescentar movimentação repetitiva de execução, mantendo a regra conservadora |
| `refinarRelevancia` | "primeira petição nas 5 mais antigas" | **premissa que não vale** numa execução de 20 anos e 286 movimentações |
| `ESPECIES_ATO` | sentença, decisão, despacho, ofício | decisão de progressão, homologação de remição, decisão de falta grave, atestado de pena |

### Vocabulário mínimo para `RE_CHAVE`

A levantar com quem trabalha na vara — esta lista é **ponto de partida, não veredito**:

```
guia de recolhimento · guia de execucao · atestado de pena · calculo de pena
liquidacao de pena · progressao de regime · regressao de regime
livramento condicional · remicao · detracao · falta grave · PAD
exame criminologico · atestado de conduta carceraria · laudo criminologico
indulto · comutacao · unificacao de penas · sursis · pena alternativa
atestado de trabalho · atestado de estudo
```

### Armadilhas de regex já conhecidas do projeto

Valem aqui igual — estão no `CLAUDE.md` e cada uma custou um bug:

- **Todo grupo vai entre `\b…\b`**, então toda alternativa precisa terminar em palavra
  completa. `saneador` não pega "Decisão Saneadora".
- **Flexões explícitas, nunca `\w*` solto** (`inicial` casaria "inicialmente").
- **Lookbehind onde há homônimo**: `(?<!cumprimento de )sentenca`. Aqui, atenção a
  **`execucao`**, que está no nome do sistema inteiro e casaria tudo.
- **`RE_RUIDO` é conservadora e sempre ancorada.** Nunca `certidao` sozinho — na execução,
  a certidão de trânsito e a de cumprimento de pena são atos centrais.
- **`atestado`** aparece em coisas muito diferentes (atestado de pena × atestado de
  trabalho). Ancore o par completo.

---

## Onde o código mora

**Arquivo próprio, selecionado por dialeto** — nunca `if (dialeto === "seeu")` espalhado
dentro de `panel.js`:

```
src/dominio-pje.js     ← as tabelas de hoje, MOVIDAS sem alteração
src/dominio-seeu.js    ← as tabelas da execução penal
```

E `panel.js` lê uma só vez:

```js
const DOMINIO = (typeof AUTOS !== "undefined" && AUTOS.dialeto() === "seeu" &&
                 typeof DominioSeeu !== "undefined") ? DominioSeeu : DominioPje;
```

> **Ao mover as tabelas do PJe para `dominio-pje.js`, mova-as byte a byte.** Nenhuma
> "melhoria" de carona. Esta é a única parte da etapa que pode regredir o PJe, e a defesa é
> o teste de categorias que já existe (58 títulos reais) rodando antes e depois com
> resultado **idêntico**.

---

## Prompts

`SUFIXO_MINUTA` e `SUFIXO_MAPA` exigem `(Peça, id 123456, fl. 7)` e proíbem inventar data.
Na execução penal:

- a **movimentação** é a âncora (ver Etapa 11);
- o **atestado de pena** é a fonte dos marcos temporais, e datas de progressão/livramento
  **são calculadas** — o modelo precisa ser instruído a distinguir o que está **registrado**
  do que ele **calculou**. A regra análoga já existe no `PROMPT_FIM` para prazos do PJe;
- **nunca** afirmar data de benefício sem base no cálculo dos autos.

---

## Critério de pronto

- [ ] Teste de categorias do PJe: resultado **idêntico** ao de antes (58 títulos)
- [ ] Tabelas do SEEU testadas com **títulos reais** de ao menos 3 execuções
- [ ] Degrau `chave` selecionando de 8 a 20 peças num processo de ~300 movimentações
      (se selecionar 2 ou 200, a tabela está errada)
- [ ] `ESPECIES_ATO` da execução no seletor da minuta
- [ ] Revisão do vocabulário **por alguém que trabalha na vara de execução**
- [ ] PJe: suíte verde + smoke

---

**Próxima:** [`13-paridade.md`](13-paridade.md)
