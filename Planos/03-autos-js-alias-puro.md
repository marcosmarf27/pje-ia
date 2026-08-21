# Etapa 03 — `autos.js` como alias puro

**Depende de:** 02 (baseline verde e guardado)
**Toca o PJe?** Só o `manifest.json` (um arquivo a mais na lista). Nenhum `.js` existente
é modificado.
**Objetivo:** criar o mecanismo de despacho **antes** de usá-lo, para que criar e usar
sejam falhas distinguíveis.

---

## Por que um alias que não faz nada

Porque a Etapa 04 vai trocar `PJE.` por `AUTOS.` em 47 pontos de `content.js`, e essa
troca precisa ser **inócua por construção, não por revisão cuidadosa**. Com
`AUTOS === PJE` — literalmente o mesmo objeto na memória — nenhuma chamada pode se
comportar de forma diferente. O diff de 47 linhas passa a ser provadamente sem efeito, e
a revisão deixa de depender de alguém conferir 47 vezes se não trocou nada além do nome.

Separar "criar o mecanismo" de "usar o mecanismo" também torna a falha diagnosticável: se
a extensão quebrar aqui, o problema é de carregamento/ordem no manifest; se quebrar na 04,
é da troca. Juntos, seriam duas hipóteses para um sintoma só.

---

## Pré-condições

```bash
git branch --show-current              # feat/seeu
git diff v0.47.0-pre-seeu --stat       # vazio
```

---

## Passo 1 — Criar `src/autos.js`

Arquivo **novo**, na íntegra:

```js
// Despachante do adaptador de autos.
//
// A extensão nasceu falando com UM sistema — o PJe 1.x (JSF/Seam) —, e o acesso
// a ele vive em `pje.js` atrás de um contrato de 22 métodos que `content.js`
// consome. Este arquivo é o ponto (e o ÚNICO ponto) em que se decide QUAL
// adaptador responde por esse contrato na página atual.
//
// NESTA ETAPA ele ainda não decide nada: `AUTOS` é um ALIAS de `PJE` — o mesmo
// objeto, não uma cópia. Isso é deliberado e é o que torna a troca de `PJE.`
// por `AUTOS.` em content.js (etapa 04) inócua POR CONSTRUÇÃO: sendo o mesmo
// objeto, nenhuma chamada pode se comportar de forma diferente, e o diff de 47
// linhas fica provadamente sem efeito, sem depender de revisão linha a linha.
//
// ORDEM NO MANIFEST IMPORTA: este arquivo precisa vir DEPOIS de `pje.js` (lê o
// global `PJE`) e ANTES de `content.js` (que passará a ler `AUTOS`). Content
// scripts não têm imports entre si — a ordem da lista é a única dependência.
//
// Ver Planos/03-autos-js-alias-puro.md.
var AUTOS = PJE;
```

> **Não** transformar em IIFE nem em cópia (`{...PJE}`) nesta etapa. A igualdade
> `AUTOS === PJE` é justamente o que a verificação abaixo checa, e é o argumento inteiro
> desta etapa. A composição entra na Etapa 05, quando houver um motivo.

---

## Passo 2 — Registrar no `manifest.json`

Em `content_scripts[0].js`, inserir `"src/autos.js"` **logo após** `"src/pje.js"`:

```diff
     "js": [
       "src/pje.js",
+      "src/autos.js",
       "src/caso.js",
       "src/zip.js",
```

Nada mais muda no manifest nesta etapa — **em especial, `all_frames` continua ausente**.

---

## Verificação

### Sintaxe

```bash
node --check src/autos.js && echo "sintaxe OK"
```

### O diff é só o que se espera

```bash
git diff --stat
# esperado: manifest.json | 1 +
git status --short
# esperado: M manifest.json  /  ?? src/autos.js
```

**Nenhum outro arquivo pode aparecer.**

### O alias é o mesmo objeto (no navegador)

Recarregue a extensão em `chrome://extensions`, abra um processo do PJe e, no console da
página (F12):

```js
AUTOS === PJE          // true  ← o ponto inteiro desta etapa
typeof AUTOS.baixar    // "function"
AUTOS.dialeto()        // "legacy"
```

### A suíte continua verde

```bash
node t1-boot.mjs && node t2-envio.mjs && node t3-iframe-grid.mjs && echo "SUITE OK"
```

---

## Critério de pronto (verificável)

- [ ] `src/autos.js` existe e passa no `node --check`
- [ ] `manifest.json` lista `src/autos.js` **entre** `pje.js` e `caso.js`
- [ ] `git diff --stat` mostra **apenas** `manifest.json`
- [ ] No console da página do PJe: `AUTOS === PJE` devolve `true`
- [ ] T1, T2 e T3 verdes
- [ ] Smoke manual: abrir um processo, marcar uma peça, enviar uma pergunta — funciona
      exatamente como antes

---

## Commit

```bash
git add src/autos.js manifest.json
git commit -m "feat(autos): despachante de adaptador nasce como alias puro de PJE

Nenhuma mudanca de comportamento: AUTOS e o MESMO objeto que PJE. Existe para
que a troca de PJE. por AUTOS. em content.js seja inocua por construcao."
```

---

## Rollback

```bash
git revert --no-edit HEAD
```

Ou, se ainda não commitou:

```bash
git checkout manifest.json && rm src/autos.js
```

Reverter esta etapa isolada é seguro **desde que a Etapa 04 ainda não tenha entrado** —
depois dela, `content.js` depende de `AUTOS` existir. Reverter as duas exige reverter na
ordem inversa (04, depois 03).

---

**Próxima:** [`04-troca-mecanica-content.md`](04-troca-mecanica-content.md)
