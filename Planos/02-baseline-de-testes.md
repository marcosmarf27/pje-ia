# Etapa 02 — Baseline de testes

**Depende de:** 01 (branch e tag criadas)
**Toca o PJe?** Não. Nenhum arquivo de `src/` é modificado.
**Objetivo:** escrever a suíte e rodá-la contra o código **atual e intocado**, para que
"não regrediu" deixe de ser opinião.

---

## Por que esta etapa vem ANTES de qualquer código

Sem um verde registrado no código de hoje, um teste que falhar na Etapa 04 não diz nada:
pode ser regressão, pode ser teste mal escrito. **Um baseline é o que separa as duas
hipóteses.** É também a única forma de detectar a regressão silenciosa que mais preocupa
nesta rodada — um painel montado duas vezes não emite erro, não aparece na tela e só se
manifesta como consumo dobrado de caps e de porta com o worker.

Escrever o teste depois da mudança tem outro vício, mais sutil: o autor já sabe como o
código ficou, e escreve o teste que passa.

---

## Onde os testes moram

**No scratchpad da sessão, não no repositório.** O projeto deliberadamente não versiona
testes: não há `package.json`, e o `CLAUDE.md` manda rodá-los fora da árvore. Os scripts
completos estão em [`TESTES.md`](TESTES.md) — versionados como *documentação*, extraídos
para o scratchpad na hora de rodar. Isso respeita a convenção e mantém a suíte
reproduzível.

```bash
# pasta de trabalho dos testes (fora do repositório)
mkdir -p "$TMP/seeu-testes" && cd "$TMP/seeu-testes"
npm init -y >/dev/null 2>&1
npm i jsdom >/dev/null 2>&1
```

> `jsdom` é a única dependência. Ela nunca entra no repositório.

---

## Os quatro testes do baseline

Copie cada um de [`TESTES.md`](TESTES.md) para a pasta de trabalho e rode com `node`.

| Teste | Arquivo | O que prova |
|---|---|---|
| T1 | `t1-boot.mjs` | O `content.js` monta o painel e os handlers do fim do arquivo subiram. Pega erro de ordem de inicialização (a zona morta temporal) |
| T2 | `t2-envio.mjs` | O caminho do envio funciona: marcar peça → baixar → chegar ao worker com o conteúdo |
| T3 | `t3-iframe-grid.mjs` | **O mais importante desta rodada.** Num documento que não é o topo, o `content.js` NÃO monta painel |
| T4 | `t4-contrato-autos.mjs` | Inventário dos 22 métodos que `content.js` consome de `PJE` — o contrato que o adaptador SEEU terá de cumprir |

### O papel de cada um

**T1 e T2** são a rede contra a Etapa 04. A troca `PJE.` → `AUTOS.` é mecânica, mas
`content.js` é um IIFE gigante que registra callbacks centenas de linhas antes de declarar
o estado que eles leem — se `AUTOS` for declarado no ponto errado, o `setDocs` aborta e
leva metade do painel junto, **sem erro visível**.

**T3 é o portão da Etapa 06.** Hoje ele passa trivialmente, porque `content.js:14` tem
`if (window.top !== window.self) return;`. Depois de `all_frames: true`, ele passa a ser
a única coisa entre o projeto e um painel fantasma dentro do iframe da grid.

**T4 não testa comportamento — congela o contrato.** Ele lê o `content.js` real e extrai
os métodos de `PJE` efetivamente usados. Se a Etapa 04 esquecer um ponto, ou se alguém
adicionar uma dependência nova em `PJE` no meio do caminho, T4 acusa.

---

## Execução

```bash
node t1-boot.mjs        && echo "T1 OK"
node t2-envio.mjs       && echo "T2 OK"
node t3-iframe-grid.mjs && echo "T3 OK"
node t4-contrato-autos.mjs > baseline-contrato.txt && cat baseline-contrato.txt
```

**Guarde `baseline-contrato.txt`.** Ele é o retrato do contrato antes da mudança, e a
Etapa 04 compara contra ele.

---

## Armadilhas do harness (todas já custaram um resultado falso)

Estas não são hipóteses — estão registradas no `CLAUDE.md` do projeto:

1. **`runScripts: "dangerously"` no JSDOM.** Sem isso os `<script>` anexados não executam
   e o teste morre no primeiro stub.
2. **jsdom não implementa `Response`.** Sem um polyfill que herde o content-type do Blob,
   `PJE.lerAnexo` falha com "Response is not defined" — e o erro **parece bug do produto**.
3. **Para alcançar `MLIB`/`PLIB`/`DocxImport` do lado do Node é preciso uma ponte por
   `<script>`** (`window.__X = X`). São `const` léxicos de script clássico e não viram
   propriedade de `window`; sem a ponte, `if (w.DocxImport)` pula o bloco inteiro em
   silêncio e o teste "passa" sem ter rodado.
4. **O host do Shadow DOM está em `document.documentElement`**, não no `body`.
5. **O `kind` de peça de texto é `"text"`, não `"texto"`** (`fmt` é que vale
   `"texto"|"html"|"rtf"`). Com o valor errado a peça é recusada, o request sai sem o
   documento, e o sintoma imita um bug real de forma convincente.
6. **`chrome.runtime.id` é obrigatório no stub.**
7. **Conferir por COMPORTAMENTO, não por presença.** Um `content.js` abortado no meio
   ainda monta o painel e lista as peças. O que prova que o arquivo subiu inteiro é
   arrastar para marcar uma faixa, Shift+clique estender, botão direito abrir o `.selmenu`.

---

## Critério de pronto (verificável)

- [ ] T1, T2 e T3 passam **no código intocado**
- [ ] `baseline-contrato.txt` gerado e guardado, com os 22 métodos
- [ ] `git status --short` continua mostrando só `?? store/` e `?? Planos/`
      (os testes vivem fora da árvore — se aparecerem em `git status`, mova-os)
- [ ] `git diff v0.47.0-pre-seeu --stat` continua vazio

---

## Se um teste do baseline falhar

**Não prossiga e não "ajuste o teste até passar".** Um baseline vermelho significa uma de
duas coisas, e as duas exigem parar:

- O teste está errado → corrija o teste, é o mais provável (ver as armadilhas acima).
- A extensão tem um defeito preexistente → registre-o, decida se conserta antes, e **não
  o confunda depois com uma regressão desta rodada**.

---

**Próxima:** [`03-autos-js-alias-puro.md`](03-autos-js-alias-puro.md) — a primeira linha
de código novo, e ela não muda comportamento nenhum.
