# Etapa 05 — A guarda de frame passa pelo adaptador

**Depende de:** 04 (`content.js` consumindo `AUTOS`, suíte verde)
**Toca o PJe?** Sim — uma linha de `content.js` e o corpo de `autos.js`. **Comportamento
idêntico**: a lógica é a mesma, só muda de lugar.
**Objetivo:** tornar "quem hospeda os autos" uma pergunta do adaptador, para que a Etapa
06 possa ligar `all_frames` sem tocar em regra nenhuma.

---

## O problema que esta etapa prepara

`src/content.js`, linha 14:

```js
if (window.top !== window.self) return;
```

Essa linha não é zelo. Ela existe porque `PJE.listarPelaGrid` abre **um iframe com a
própria URL dos autos**, e lá dentro existe `#divTimeLine` — sem ela, um painel inteiro
(observers, porta para o worker, requisição de caps) seria montado num frame invisível a
cada leitura da grid.

Mas ela é uma regra **do PJe**, escrita no arquivo errado: `content.js` é o orquestrador
agnóstico. No SEEU, que é um frameset de três níveis, os autos **nunca** estão no topo — a
mesma linha que protege o PJe barra o SEEU por completo.

A saída não é enfraquecer a guarda: é **mudá-la de dono**. Quem sabe onde os autos moram
é o adaptador.

---

## Por que `pje.js` continua intocado

O método novo (`ehDocumentoDosAutos`) parece pertencer a `pje.js` — afinal é uma regra do
PJe. Mas a regra de ouro diz que aquele arquivo não é editado, e ela vale.

A saída é **composição**: `autos.js` monta o objeto final juntando o `PJE` original com o
método novo. As funções copiadas mantêm o closure de `pje.js`, então continuam funcionando
exatamente como antes.

```js
Object.assign({}, PJE, { ehDocumentoDosAutos })
```

**Consequência que precisa ser conhecida:** a partir daqui `AUTOS === PJE` deixa de ser
`true` (passa a ser uma cópia rasa, não a mesma referência). Nenhum código do projeto
depende dessa identidade — mas a verificação da Etapa 03 muda, e isso está previsto abaixo.

---

## Pré-condições

```bash
git log --oneline -1                 # commit da etapa 04
grep -n "PJE\." src/content.js       # nada
```

---

## Passo 1 — Reescrever `src/autos.js`

Substituir a última linha (`var AUTOS = PJE;`) por:

```js
var AUTOS = (function () {
  // "Este documento é o que hospeda os autos?" — a pergunta que decide se o
  // painel é montado. Ela é do ADAPTADOR, não do orquestrador: cada sistema
  // guarda os autos num lugar diferente da árvore de frames.
  //
  // No PJe a resposta é "só o documento de topo", e o motivo é concreto:
  // `listarPelaGrid` abre um iframe com a PRÓPRIA URL dos autos, onde existe
  // `#divTimeLine`. Sem esta guarda, cada leitura da grid montaria um painel
  // inteiro — observers, porta para o worker, requisição de caps — dentro de um
  // frame invisível. Vale também para os demais iframes do PJe: o painel só faz
  // sentido na janela de topo.
  //
  // Esta é a MESMA regra que vivia em content.js:14 até a etapa 05; ela mudou de
  // dono, não de conteúdo. O SEEU (frameset de três níveis, autos nunca no topo)
  // trará a sua própria resposta na etapa 07 — e é o fato de a regra morar aqui
  // que permite ligar `all_frames` sem mexer em regra nenhuma.
  function ehDocumentoDosAutosPJe() {
    return window.top === window.self;
  }

  // Composição, e não edição de `pje.js`: aquele arquivo sustenta 100% dos
  // usuários de hoje e é INTOCADO por contrato (ver Planos/README.md). As funções
  // copiadas mantêm o closure de origem, então seguem funcionando byte a byte.
  // Efeito colateral conhecido e aceito: `AUTOS` deixa de ser a MESMA referência
  // que `PJE` e passa a ser uma cópia rasa. Nada no projeto depende dessa
  // identidade — o que se consome são os métodos.
  return Object.assign({}, PJE, {
    ehDocumentoDosAutos: ehDocumentoDosAutosPJe,
  });
})();
```

Ajuste também o comentário de cabeçalho: ele ainda diz que `AUTOS` é um alias.

---

## Passo 2 — Trocar a guarda em `content.js`

```diff
-  // SÓ no documento de topo. O guard acima é por CONTEXTO, e todo iframe é um
-  // contexto novo — sem esta linha o content script se injetaria também dentro
-  // dos iframes da página. Isso importa desde que `AUTOS.listarPelaGrid` passou a
-  // abrir um iframe com a PRÓPRIA URL dos autos: lá dentro existe #divTimeLine,
-  // então um painel inteiro (com observers, porta para o worker e requisição de
-  // caps) seria montado num frame invisível a cada leitura da grid. Vale também
-  // para os iframes do próprio PJe: o painel só faz sentido na janela de topo.
-  if (window.top !== window.self) return;
+  // SÓ no documento que HOSPEDA os autos. O guard acima é por CONTEXTO, e todo
+  // iframe é um contexto novo. Quem responde onde os autos moram é o ADAPTADOR
+  // (ver src/autos.js): no PJe é o documento de topo — porque `listarPelaGrid`
+  // abre um iframe com a própria URL dos autos, e lá dentro existe #divTimeLine —,
+  // e em outros sistemas pode ser um frame interno.
+  if (!AUTOS.ehDocumentoDosAutos()) return;
```

**Só isso.** Nenhuma outra linha de `content.js` muda.

---

## Verificação

### O comportamento é idêntico

Com `all_frames` **ainda desligado** (é a Etapa 06), o content script só roda no topo,
onde `window.top === window.self` é sempre `true`. A guarda é logicamente equivalente à
anterior — e continua sendo depois, no PJe.

```bash
node --check src/autos.js && node --check src/content.js
git status --short        # esperado: M src/autos.js  +  M src/content.js
git diff --stat           # esperado: 2 arquivos, poucas linhas
```

### No console da página do PJe

```js
AUTOS.ehDocumentoDosAutos()   // true  (estamos no topo)
AUTOS === PJE                 // false ← MUDOU nesta etapa, e é esperado
typeof AUTOS.baixar           // "function"  (composição preservou tudo)
AUTOS.dialeto()               // "legacy"
```

### A suíte

```bash
node t1-boot.mjs && node t2-envio.mjs && node t3-iframe-grid.mjs && echo "SUITE OK"
node t4-contrato-autos.mjs > contrato-05.txt
diff baseline-contrato.txt contrato-05.txt
```

T4 vai acusar **uma diferença esperada**: `ehDocumentoDosAutos` a mais. Qualquer outra
diferença é problema.

> **T3 é o teste que importa aqui.** Ele prova que, num documento que não é o topo, o
> `content.js` continua não montando painel — agora pela nova guarda.

---

## Critério de pronto (verificável)

- [ ] `src/pje.js` **não aparece** em `git status` (conferir explicitamente)
- [ ] `git diff --stat` mostra exatamente 2 arquivos: `autos.js` e `content.js`
- [ ] `content.js` não contém mais `window.top !== window.self`
- [ ] No console: `ehDocumentoDosAutos()` → `true`; `AUTOS === PJE` → `false`
- [ ] T1, T2, T3 verdes; T4 difere apenas pelo método novo
- [ ] Smoke manual no PJe: painel monta, chat responde, os três gestos de seleção funcionam

---

## Commit

```bash
git add src/autos.js src/content.js
git commit -m "refactor(autos): quem decide onde os autos moram passa a ser o adaptador

A guarda de content.js:14 muda de DONO, nao de conteudo: no PJe continua sendo
'so o documento de topo', pelo mesmo motivo de sempre (o iframe da grid tem
#divTimeLine). pje.js segue intocado -- o metodo novo entra por composicao."
```

---

## Rollback

```bash
git revert --no-edit HEAD
```

Seguro isoladamente: a Etapa 04 não depende de `ehDocumentoDosAutos`.

---

**Próxima:** [`06-all-frames.md`](06-all-frames.md) — ⚠ **a etapa de risco**. Leia-a
inteira antes de começar.
