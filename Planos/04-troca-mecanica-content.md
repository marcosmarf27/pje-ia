# Etapa 04 — Troca mecânica `PJE.` → `AUTOS.` em `content.js`

**Depende de:** 03 (`AUTOS === PJE` confirmado no navegador)
**Toca o PJe?** Sim — mas de forma **provadamente inócua**, porque `AUTOS` ainda é o
mesmo objeto que `PJE`.
**Objetivo:** passar `content.js` a consumir o despachante, sem que uma única chamada
mude de comportamento.

---

## Por que isto é seguro agora e não seria antes

Neste ponto `AUTOS === PJE` é `true` — não é uma cópia, é a mesma referência. Então
`AUTOS.baixar(id)` e `PJE.baixar(id)` são a **mesma chamada, na mesma função, com o mesmo
closure**. A troca não pode alterar comportamento; no máximo pode quebrar de forma
barulhenta (se `AUTOS` não existir no momento certo), e é isso que os testes pegam.

É por isso que a Etapa 03 existe separada. Se as duas tivessem entrado juntas, um erro de
carregamento e um erro de troca produziriam o mesmo sintoma.

---

## Pré-condições

```bash
git branch --show-current                    # feat/seeu
git log --oneline -1                         # o commit da etapa 03
node -e "1" && node --check src/content.js   # sanidade
```

---

## Passo 1 — Registrar o antes

```bash
grep -c "PJE\." src/content.js       # anote (esperado ~56, incl. comentários)
cp src/content.js /tmp/content-antes.js
```

---

## Passo 2 — A troca

```bash
sed -i 's/\bPJE\./AUTOS./g' src/content.js
```

### Por que este `sed` é seguro

| Risco | Por que não acontece |
|---|---|
| Trocar as strings de log `[PJe IA]` | O padrão exige **`PJE` maiúsculo**; `PJe` (113 ocorrências) não casa |
| Trocar `PJE` dentro de palavra maior | O `\b` ancora a borda |
| Trocar em outros arquivos | O `sed` roda **só** em `src/content.js` |
| Trocar `PJE` sem ponto | O padrão exige o `.` — a única ocorrência assim (um comentário, ~linha 670) fica intacta e é ajustada à mão no passo 3 |

> **Nunca rode este `sed` em `src/*.js`.** `pje.js` define `var PJE` e usa o nome
> internamente; trocá-lo lá destruiria o adaptador do PJe — exatamente o que a regra de
> ouro proíbe.

---

## Passo 3 — Ajustar o comentário órfão

Perto da linha 670 há um comentário que menciona `PJE` sem ponto:

```js
// A guarda de `typeof` não é zelo: o harness de boot em jsdom stuba o `PJE`
```

Depois desta etapa o harness passa a stubar `AUTOS`. Atualize o texto — comentário que
descreve o vizinho errado é dívida que ninguém paga depois.

---

## Verificação

### 1. O diff é SÓ troca de identificador

```bash
diff <(sed 's/\bAUTOS\./PJE./g' src/content.js) /tmp/content-antes.js && echo "IDENTICO ao desfazer a troca"
```

Se este comando não imprimir nada além da confirmação, **está provado** que nenhuma outra
alteração entrou junto. Este é o teste mais forte desta etapa — mais forte que ler o diff.

### 2. Não sobrou nenhuma chamada antiga

```bash
grep -n "PJE\." src/content.js       # esperado: NADA
grep -c "AUTOS\." src/content.js     # esperado: o mesmo número anotado no passo 1
```

### 3. Só um arquivo mudou

```bash
git status --short                   # esperado: M src/content.js  (e nada mais)
```

### 4. Sintaxe e variáveis

```bash
node --check src/content.js
```

E o ESLint descartável de duas regras — **obrigatório após renomeação em massa**:

```bash
cd "$TMP/seeu-testes" && npm i eslint >/dev/null 2>&1
npx eslint --no-eslintrc --env browser,es2022 \
  --parser-options ecmaVersion:2022 \
  --rule '{"no-undef":"error","no-unused-vars":"warn"}' \
  --global chrome --global PJE --global AUTOS --global PjePanel --global PLIB \
  --global MLIB --global ZipW --global PjeExport --global DocxImport \
  --global CASO --global PjeTour --global PjePrecatoria \
  "$OLDPWD/src/content.js"
```

> `node --check` **não pega variável inexistente** — só sintaxe. Foi assim que um `ehPdf`
> sobrevivente de uma renomeação quebrou a exportação em `.zip` inteira, com
> "ehPdf is not defined" em runtime. Esta etapa é uma renomeação em massa: o `no-undef` é
> a rede específica para ela.

### 5. A suíte

```bash
node t1-boot.mjs && node t2-envio.mjs && node t3-iframe-grid.mjs && echo "SUITE OK"
node t4-contrato-autos.mjs > contrato-depois.txt
diff baseline-contrato.txt contrato-depois.txt && echo "CONTRATO IDENTICO"
```

T4 comparado com o baseline prova que **os 22 métodos continuam os mesmos** — nenhum
ponto ficou para trás e nenhuma dependência nova entrou.

### 6. Smoke manual no PJe real

Recarregar a extensão e, num processo de verdade:

- abrir o painel, ver a lista de peças
- marcar uma peça e enviar uma pergunta (a resposta tem de vir com citação)
- **arrastar** na lista para marcar uma faixa, **Shift+clique**, **botão direito** →
  `.selmenu` abre

Os três gestos são o que prova que o `content.js` subiu **inteiro**: um arquivo abortado
no meio ainda monta o painel e lista peças, e só os handlers do fim do arquivo denunciam.

---

## Critério de pronto (verificável)

- [ ] `grep -n "PJE\." src/content.js` não devolve nada
- [ ] O diff reverso (verificação 1) prova troca pura de identificador
- [ ] `git status --short` mostra só `M src/content.js`
- [ ] `node --check` passa e o ESLint não acusa `no-undef`
- [ ] T1, T2, T3 verdes e T4 idêntico ao baseline
- [ ] Smoke manual: chat funciona, e os três gestos de seleção funcionam

---

## Commit

```bash
git add src/content.js
git commit -m "refactor(content): content.js passa a consumir AUTOS em vez de PJE

Troca puramente mecanica de identificador: neste ponto AUTOS E o objeto PJE,
entao nenhuma chamada muda de comportamento. Provado pelo diff reverso."
```

---

## Rollback

```bash
git revert --no-edit HEAD
```

---

**Próxima:** [`05-guarda-de-frame.md`](05-guarda-de-frame.md)
