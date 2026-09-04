# Testes da extensão

```bash
cd tests
npm install          # só jsdom; uma vez
node correr.mjs      # a suíte inteira (~75 s)
node correr.mjs --rapido   # só os de unidade (~10 s)
```

Linha de base em 04/09/2026, na v0.58.3: **33 verdes, 0 vermelhos, 74 s.**

## Por que esta pasta existe

Até aqui os testes viviam no **scratchpad da sessão** (`%TEMP%`), e o `CLAUDE.md`
registrava isso como convenção. O custo apareceu quando foi preciso rodá-los: 45
arquivos espalhados por nove sessões, três nomes com cópias divergentes, e o
teste que a regra do projeto chama de *principal antes de qualquer release*
(`t-turno-sigiloso`) num diretório temporário que a próxima sessão não tem como
encontrar sem varrer o disco.

Ao trazê-los para cá, **16 asserções estavam vermelhas** — e nenhuma era defeito
do produto:

- **15 em `t-config`** e **1 em `t-modelos-coerencia`**: os dois varriam
  `<option value="…">` no HTML inteiro. Isso estava certo enquanto a tela de
  opções tinha um `<select>` só; a v0.58.0 acrescentou o seletor de **temas**, e
  os testes passaram a cobrar de `noite`, `papel`, `vidro`, `toga` e `rosa` uma
  entrada em `MODEL_CAPS`, um perfil em `popup.js` e um nome no selo do painel.
  Hoje os dois recortam o `<select id="model">` antes de varrer.
- **1 em `t-content`**: a asserção era da v0.54, quando a peça em imagem era
  BARRADA num modelo que não lê imagem e o canal `semSuporte` avisava na tela. A
  v0.56.0 mudou o desenho — `precisaTextoLocal` manda a peça para o OCR local e
  ela entra como bloco de texto. O teste agora cobra o que o produto faz hoje:
  a peça entra por texto e nunca some em silêncio.

Nada disso tinha sintoma. Um teste que falha por conta própria é um teste que
ninguém roda, e é assim que uma suíte para de proteger.

## Onde a pasta NÃO entra

`empacotar.ps1` copia apenas `manifest.json`, `src/`, `icons/` e `vendor/` — a
mesma garantia por construção que já vale para `cli/` e `Planos/`. O
`package.json` fica **aqui dentro**, e não na raiz: a extensão não tem build
step, e a raiz continua sem `package.json` como o `CLAUDE.md` estabelece.

## Fixtures

| arquivo | o que é |
|---|---|
| `fixtures/oraculo.json` | 28 casos de tokenização com ids e offsets, gerados pelo `tokenizers` (Rust) do HuggingFace. Escritor conferido pelo próprio escritor não prova nada — a mesma disciplina do `zipfile` sobre o `ZipW` e do jsQR sobre o QR do PIX. |
| `fixtures/oraculo.py` | regenera o arquivo acima (`pip install --no-deps tokenizers`). |
| `fixtures/logits-int8.json` | logits REAIS do modelo INT8 — o que vai no pacote. |
| `fixtures/logits-reais.json` | os mesmos em FP32. Ficam os dois porque a pergunta que importa depois da quantização não é "os logits batem?" (não batem) e sim "saem as mesmas entidades?". A resposta tem de continuar sendo **71/71 nos dois**. |
| `fixtures/logits-reais.py` | regenera os dois. |

## Armadilhas ao escrever teste aqui

Estão detalhadas em "Desenvolvimento e teste" no `CLAUDE.md`. As que mais custam:

1. **`runScripts: "dangerously"` no JSDOM**, senão os `<script>` anexados não
   executam e o teste morre no primeiro stub.
2. **jsdom não tem `Response`** — é preciso um polyfill que herde o
   content-type do Blob, ou `PJE.lerAnexo` falha com "Response is not defined" e
   o erro parece bug do produto.
3. **Ponte por `<script>` para alcançar `MLIB`/`PLIB`/`DocxImport`** do lado do
   Node: são `const` léxicos de script clássico e não viram propriedade de
   `window`. Sem a ponte, `if (w.DocxImport)` pula o bloco inteiro em silêncio e
   o teste "passa" sem ter rodado.
4. **`chrome.runtime.id` é obrigatório** no stub.
5. **A seleção que inclui a row lazy é `selecaoParaMemoria()`**, não
   `getSelected()` (esse é só os checkboxes).
6. **O `kind` de peça de texto é `"text"`**, não `"texto"` (`fmt` é que vale
   `"texto"|"html"|"rtf"`). Com o valor errado a peça entra em `semConteudo`, o
   request sai sem o documento, e o turno segue — um falso positivo de bug
   convincente.
7. **Headless reporta `prefers-reduced-motion: reduce` por padrão**: sem saber
   disso, mede-se sempre o ramo reduzido.
8. **`document.getAnimations()` não alcança a árvore sombra** neste arné;
   `elemento.getAnimations()` alcança.

## Teste novo

Entra no `CATALOGO` de `correr.mjs`. O catálogo é declarado, e não varrido, de
propósito: vários testes precisam de fixture no `argv` e o do turno sigiloso tem
sete modos — um runner que só fizesse `node t-*.mjs` daria esses como quebrados
e ensinaria a ignorar vermelho.
