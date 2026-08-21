# Etapa 06 — ⚠ `all_frames: true` — A ETAPA DE RISCO

**Depende de:** 05 (guarda no adaptador, suíte verde)
**Toca o PJe?** **SIM.** Esta é a **única** mudança de toda a rodada que altera o
comportamento da extensão em todas as páginas `jus.br`, inclusive as do PJe.
**Objetivo:** permitir que o content script alcance frames internos — pré-requisito para
o SEEU, que é um frameset.

> **LEIA ESTE ARQUIVO INTEIRO ANTES DE EDITAR QUALQUER COISA.**
> Se houver pressa, pare aqui. Esta etapa não deve ser feita com pressa.

---

## O que muda, exatamente

Uma linha no `manifest.json`. Mas o efeito é grande: hoje os 11 content scripts são
injetados **só no documento de topo**; depois desta etapa, em **todo frame** de **toda
página `jus.br`**.

## O que NÃO muda

- **Não é permissão.** `all_frames` não aparece no aviso de instalação da Chrome Web
  Store. As permissões da ficha continuam `storage, clipboardWrite, host permission`.
- **`matches` continua `https://*.jus.br/*`** — nenhum host novo.
- **A guarda da Etapa 05 continua respondendo `window.top === window.self` no PJe**, então
  no PJe **nenhum painel novo deve ser montado**. É isso que o teste precisa provar.

---

## O risco concreto, em uma frase

`PJE.listarPelaGrid` abre um iframe com a **própria URL dos autos**. Lá dentro existe
`#divTimeLine`. Com `all_frames: true`, o content script passa a rodar **dentro desse
iframe** — e se a guarda falhar, um painel inteiro (observers, porta para o worker,
requisição de caps) nasce num frame invisível, a cada leitura da grid.

**Esse defeito é silencioso**: não aparece na tela, não emite erro, e se manifesta como
consumo dobrado de caps e de conexões com o worker. É o pior tipo de regressão — a que só
se descobre semanas depois, pela conta.

---

## O PORTÃO

> **Sem o T3 verde depois da mudança, esta etapa não é commitada.** Não há exceção, não há
> "depois eu vejo". Se T3 falhar, reverta o manifest e investigue com a extensão de volta
> ao estado da Etapa 05.

---

## Pré-condições

```bash
git log --oneline -1                        # commit da etapa 05
node t3-iframe-grid.mjs && echo "T3 verde ANTES"   # tem de passar antes
grep -n "all_frames" manifest.json          # esperado: nada
```

---

## Passo 1 — A mudança

```diff
   "content_scripts": [
     {
       "matches": [
         "https://*.jus.br/*"
       ],
+      "all_frames": true,
       "js": [
         "src/pje.js",
```

Comentário para o histórico do commit (o `manifest.json` não aceita comentários):

> `all_frames` existe por causa do SEEU, que é um frameset HTML 4.01 — os autos vivem num
> frame de terceiro nível e nunca no documento de topo. Quem impede a injeção indevida é
> `AUTOS.ehDocumentoDosAutos()` (src/autos.js), que no PJe continua exigindo o topo.

---

## Passo 2 — Verificação obrigatória

### 2.1 O portão

```bash
node t3-iframe-grid.mjs && echo "T3 VERDE — pode seguir"
```

### 2.2 A suíte inteira

```bash
node t1-boot.mjs && node t2-envio.mjs && node t3-iframe-grid.mjs && echo "SUITE OK"
```

### 2.3 O teste que só o navegador faz — o iframe da grid REAL

Este é o insubstituível. Em um processo **grande** do PJe (que force várias páginas de
grid):

1. Abra o processo e o painel.
2. Console (F12) — instrumente antes:
   ```js
   window.__contagemPainel = 0;
   const obs = new MutationObserver(() => {
     const n = document.querySelectorAll("*").length;
     // o host do painel é anexado em documentElement
   });
   ```
   Mais simples e direto: rode `⟳ Carregar tudo` e depois verifique em cada frame:
   ```js
   // no console, com o seletor de contexto do DevTools apontando para o iframe da grid
   typeof window.__pjeIaLoaded   // "boolean" (o script rodou — esperado)
   document.querySelectorAll("*").length  // NÃO deve conter o host do painel
   ```
3. **O que provar:** o `content.js` **rodou** no iframe (a flag existe) mas **saiu na
   guarda** — nenhum host de painel foi anexado ali.

> Um jeito prático de ver: no DevTools, aba **Elements**, procure o host do painel dentro
> do iframe da grid. Ele **não pode existir**.

### 2.4 Custo de desempenho — medir, não supor

Os 11 content scripts passam a ser parseados em cada frame (~25 mil linhas). Eles são
IIFEs que apenas **definem** globais — verificado: nenhum tem efeito colateral em nível de
topo —, então o custo é de parse, não de execução de lógica. Ainda assim:

- Abra uma tela de autos **grande** do PJe e compare a sensação de carregamento com a
  versão da Store (que pode ficar instalada em paralelo).
- No DevTools → **Performance**, grave o carregamento e olhe o tempo de *Script Parse*.
- Se houver degradação perceptível, **registre o número** antes de decidir qualquer coisa.

### 2.5 Smoke completo no PJe real

Este é o momento de exercitar tudo, porque é a etapa que pode quebrar tudo:

- [ ] Painel monta **uma vez** (não dois painéis, não dois launchers)
- [ ] Lista de peças aparece
- [ ] Marcar peça → enviar → resposta com citação
- [ ] `⟳ Carregar tudo` (o caminho do iframe da grid) funciona e **não** duplica painel
- [ ] `⬇ Baixar .zip` funciona
- [ ] Minuta abre no editor
- [ ] Mapa mental abre
- [ ] Os três gestos de seleção (arrastar, Shift+clique, botão direito)
- [ ] Preview no hover
- [ ] O console **não** mostra erro novo

---

## Critério de pronto (verificável)

- [ ] `manifest.json` é o **único** arquivo alterado (`git diff --stat`)
- [ ] T3 verde **depois** da mudança — o portão
- [ ] T1 e T2 verdes
- [ ] No PJe real, com a grid lida: `__pjeIaLoaded` existe no iframe, mas **nenhum painel**
      foi montado lá
- [ ] Smoke completo (2.5) sem regressão
- [ ] Custo de parse medido e registrado

---

## Commit

```bash
git add manifest.json
git commit -m "feat(manifest): all_frames para alcancar frames internos

Pre-requisito do SEEU, que e um frameset HTML 4.01 -- os autos vivem num frame
de terceiro nivel. No PJe nada muda: AUTOS.ehDocumentoDosAutos() continua
exigindo o documento de topo, e o teste do iframe da grid prova que nenhum
painel extra e montado. all_frames NAO e permissao: o aviso de instalacao da
Store nao muda."
```

**Este commit fica sozinho.** Não junte nada a ele — é o que torna o `git revert`
cirúrgico se algo aparecer semanas depois.

---

## Rollback

```bash
git revert --no-edit HEAD
```

Reverter esta etapa é seguro e **não quebra as etapas 03–05**: elas não dependem de
`all_frames`. O efeito é apenas que o SEEU volta a não ser alcançável — o PJe fica
exatamente como estava.

Se o problema só aparecer depois das etapas 07+, ainda assim este commit pode ser
revertido isoladamente (o `seeu.js` continua carregado, apenas nunca é alcançado fora do
topo).

---

## Se você decidir NÃO seguir daqui

É uma decisão legítima. Reverter esta etapa e parar deixa o projeto com `autos.js` no
lugar, o `content.js` consumindo o despachante e o PJe intacto — uma refatoração de
arquitetura útil por si só, sem nenhum risco pendente.

---

**Próxima:** [`07-seeu-esqueleto-e-deteccao.md`](07-seeu-esqueleto-e-deteccao.md) — a
partir daqui, nada mais toca o PJe.
