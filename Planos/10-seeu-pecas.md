# Etapa 10 — SEEU: descoberta e download das peças

**Depende de:** 09 (movimentações lidas) e da resposta de **Q1** na Etapa 08
**Toca o PJe?** Não.
**Objetivo:** transformar as movimentações com arquivo em peças listáveis, marcáveis e
baixáveis — o que liga o chat.

---

## A restrição que governa o desenho

> **No SEEU não se MONTA a URL de download — colhe-se o link renderizado.**

O `_tj` é **por link**, não por sessão: em `arquivo.do` ele é o **único** parâmetro, ou
seja, codifica *qual arquivo*. Não há id de documento a interpolar. Consequências que não
podem ser esquecidas:

1. **`listarDocumentos` e `baixar` ficam acoplados.** Só se baixa o que foi listado, porque
   é a listagem que produz a URL. No PJe são independentes (`urlsDownload(id)` constrói).
2. **A URL tem validade desconhecida.** Trate-a como perecível: guarde-a, mas se um
   download falhar com 403/404, **re-descubra** aquela movimentação antes de declarar falha.
3. **Um adaptador que tentasse sintetizar a URL falharia em silêncio** — devolveria 404 ou
   uma casca, e o sintoma seria "peça vazia".

---

## Custo da descoberta

Cada movimentação com arquivo exige **1 POST** em
`/seeu/processo/movimentacaoArquivoDocumento.do?_tj=…`. No processo medido: **108 POSTs**.

Movimentação **sem** arquivo não gera requisição nenhuma (é só toggle) — e dá para saber
quais têm, antes de pedir, pelo ícone `iPlus.gif`/`iMinus.gif`:

```js
// So estas precisam de POST. No processo medido: 108 de 286.
const comArquivo = [...document.querySelectorAll('a[class*="linkArquivos"]')];
```

> **Se Q3 (menu Exportar) revelou uma rota de autos consolidados, reavalie tudo isto.**
> Uma requisição em vez de 108 muda o desenho por completo.

---

## Concorrência: comece em 1

O PJe serializa por necessidade (a sessão JSF não tolera dois submits na mesma view). **O
SEEU não tem ViewState**, então provavelmente tolera paralelismo — mas *provavelmente* não
é medição.

**Comece com 1 e suba com cuidado**, medindo. Um sistema nacional de execução penal em
produção não é lugar para descobrir o limite de concorrência por tentativa e erro. Se
subir, use o mesmo teto do PJe (`CONCORRENCIA_DOWNLOAD = 3`) como referência.

---

## Código

### Descoberta

```js
// Expande UMA movimentacao e colhe os links dos arquivos. `indice` vem do
// `listarMovimentacoesDom` da etapa 09 (o N de `rowmovimentacoesN`).
async function expandirMovimentacao(indice) {
  const det = document.getElementById("rowmovimentacoes" + indice);
  if (!det) return [];

  // Ja expandida? Nao repetir o POST -- e o cache mais barato que existe.
  if (det.querySelector("a")) return colherLinks(det, indice);

  const gatilho = document.querySelector(
    'a.linkArquivos' + "movimentacoes" + indice + ' img'
  );
  if (!gatilho) return [];

  gatilho.click();                 // dispara o POST AJAX
  await esperarConteudo(det);      // NUNCA um sleep fixo -- ver abaixo
  return colherLinks(det, indice);
}

// Espera o AJAX preencher a linha de detalhe. Sleep fixo e o erro classico:
// curto demais perde o conteudo, longo demais multiplica por 108.
function esperarConteudo(det, teto = 8000) {
  return new Promise((resolve) => {
    if (det.querySelector("a")) return resolve(true);
    const obs = new MutationObserver(() => {
      if (det.querySelector("a")) { obs.disconnect(); clearTimeout(t); resolve(true); }
    });
    obs.observe(det, { childList: true, subtree: true });
    const t = setTimeout(() => { obs.disconnect(); resolve(false); }, teto);
  });
}

// O link traz o NOME REAL com extensao -- metadado que o PJe nao da de graca.
function colherLinks(det, indice) {
  return [...det.querySelectorAll("a[href]")]
    .map((a) => {
      const href = a.getAttribute("href") || "";
      if (!/arquivo\.do/i.test(href)) return null;
      const titulo = (a.textContent || "").trim().replace(/\s+/g, " ");
      return {
        // Id SINTETICO e estavel: no SEEU nao ha id numerico de documento
        // exposto. `seq` da movimentacao + posicao do arquivo dentro dela e
        // reproduzivel entre sessoes -- requisito da memoria de caso.
        id: "seeu:" + indice + ":" + titulo,
        titulo,
        url: new URL(href, location.href).href,   // COLHIDA, nunca montada
        ext: (titulo.match(/\.([a-z0-9]{2,5})$/i) || [])[1] || null,
      };
    })
    .filter(Boolean);
}
```

> **O id sintético precisa ser ESTÁVEL entre sessões.** A memória de caso o usa como chave
> de peça: um id que mude a cada carga faria a extensão re-baixar tudo sempre, anulando
> metade do valor do recurso. `indice` (posicional) é instável se a paginação mudar —
> **prefira o `seq` da movimentação**, que é do sistema. Ajuste `colherLinks` para recebê-lo.

### Download

```js
// `lerCorpo` do pje.js e o leitor certo e NAO deve ser duplicado: ele decide o
// tipo por content-type E por ASSINATURA no binario (%PDF-, {\rtf), trata RTF,
// barra binario/imagem e ja cobre as armadilhas todas. Extrai-lo para um modulo
// compartilhado e trabalho da etapa 13; ate la, referencie-o.
async function baixar(id) {
  const peca = indicePecas.get(id);
  if (!peca) throw new Error("SEEU: peca nao listada -- liste antes de baixar");

  let resp = await fetch(peca.url, { credentials: "include" });

  // URL perecivel: uma falha de autorizacao pode ser token vencido, nao ausencia
  // do arquivo. Re-descobre UMA vez antes de desistir.
  if (resp.status === 403 || resp.status === 404) {
    const novos = await expandirMovimentacao(peca.indice);
    const novo = novos.find((p) => p.id === id);
    if (!novo) throw new Error("SEEU: arquivo nao encontrado apos redescoberta");
    resp = await fetch(novo.url, { credentials: "include" });
  }

  if (!resp.ok) throw new Error("SEEU: HTTP " + resp.status);
  return resp;   // o chamador passa por lerCorpo
}
```

> **Não basta HTTP 200.** No PJe, a rota curta devolve **200 com casca vazia** em peça
> HTML — foi a origem de boa parte das "peças vazias". Aplique o mesmo critério aqui:
> **corpo útil**, não status. Se Q1 revelou casca, trate-a explicitamente.

---

## `listarDocumentos`

Deve devolver a forma que `content.js` já consome: `[{id, titulo, mov, dataMov}]`. Aproveite
`Evento` e `Movimentado Por` da Etapa 09 — eles alimentam de graça a classificação por tipo
oficial e a promoção por autor institucional, que no PJe custam a leitura da grid.

---

## Verificação

```js
const ms = await AUTOS.listarMovimentacoes();
const comArq = ms.filter(m => m.temArquivo).length;   // esperado: bate com os iPlus
const docs = AUTOS.listarDocumentos();
docs.length                                            // >= comArq
docs.slice(0, 3)                                       // conferir titulo e ext
```

Baixe **uma** peça e confira: tamanho plausível, assinatura `%PDF-` (se PDF), e que abre.

---

## Critério de pronto

- [ ] A lista traz todas as peças, com nome e extensão corretos
- [ ] Uma peça baixa e abre corretamente
- [ ] Peça de texto/HTML (se houver) é lida, não vem como binário
- [ ] O id sintético é **idêntico** ao recarregar a página (teste explicitamente)
- [ ] Concorrência medida e registrada; nenhum erro do servidor durante a descoberta
- [ ] PJe: suíte verde, smoke ok

---

**Próxima:** [`11-ligar-o-chat.md`](11-ligar-o-chat.md)
