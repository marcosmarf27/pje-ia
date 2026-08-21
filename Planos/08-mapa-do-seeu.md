# Etapa 08 — Fechar o mapa do SEEU

**Depende de:** 07 (detecção funcionando) — mas **pode ser antecipada** a qualquer momento:
é só investigação, não altera arquivo nenhum.
**Toca o PJe?** Não. **Nenhum arquivo é modificado.**
**Objetivo:** responder as quatro perguntas que faltam antes de escrever o adaptador de
verdade.

---

## O que já está medido (não repetir)

Levantado em sessão real, 21/08/2026, SEEU v20.5.1 — detalhes em
[`00-ESTUDO-VIABILIDADE.md`](00-ESTUDO-VIABILIDADE.md):

| Fato | Valor |
|---|---|
| Árvore de frames | `top` (frameset) → `areaAtuacao.do` → `visualizacaoProcesso.do` |
| Identidade do processo | `numeroUnico` = CNJ sem máscara, na query do frame de autos |
| Movimentações | tabela server-side, 2 linhas por movimentação, **tudo no DOM** |
| Colunas | `Seq. \| Data (com hora) \| Evento \| Ações Auto. \| Movimentado Por` |
| Paginação | `POST visualizacaoProcesso.do` + `movimentacoesPageSize` / `movimentacoesPageNumber` |
| ViewState | **não existe** — token é `_tj` |
| Expandir movimentação | `POST /seeu/processo/movimentacaoArquivoDocumento.do?_tj=…` |
| Sem arquivo | **nenhuma** requisição (só toggle de visibilidade) |
| Download | `/seeu/arquivo.do?_tj=…` — `_tj` é o **único** parâmetro |
| `_tj` | é **por link**, não por sessão — codifica *qual* recurso |

> **Consequência de projeto, já decidida:** no SEEU **não se monta a URL de download —
> colhe-se o link renderizado.** O oposto de `PJE.urlsDownload(id)`. `listarDocumentos` e
> `baixar` ficam acoplados: só se baixa o que foi listado.

---

## As quatro perguntas em aberto

### Q1 — `arquivo.do` devolve o PDF direto ou uma casca?

**Por que importa:** decide se `baixar()` é um `fetch` simples ou precisa de um segundo
passo. No PJe, a rota curta devolve **200 com casca vazia** para peça HTML — foi a origem
de boa parte das "peças vazias". Assumir que 200 = conteúdo é o erro clássico aqui.

**Como responder** (no console do frame de autos, com uma movimentação já expandida):

```js
const d = document;
const a = [...d.querySelectorAll('[id^="rowmovimentacoes"] a')][0];
const u = new URL(a.getAttribute('href'), location.href);
const r = await fetch(u.href, { credentials: 'include' });
const buf = await r.arrayBuffer();
const b = new Uint8Array(buf.slice(0, 5));
console.log({
  status: r.status,
  contentType: r.headers.get('content-type'),
  temDisposition: !!r.headers.get('content-disposition'),
  kb: Math.round(buf.byteLength / 1024),
  ehPDF: b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
});
```

> Nesta sessão `fetch` e `XHR` falharam com erro de rede — **provável interferência de
> outra extensão do navegador**, não do SEEU. Se repetir, teste num **perfil limpo do
> Chrome**, sem extensões além desta.

**O que decidir com a resposta:** se vier PDF direto, `baixar()` é trivial e `lerCorpo` do
`pje.js` serve (mesma detecção por assinatura `%PDF-`). Se vier HTML, há um segundo passo
a mapear.

### Q2 — `movimentacoesPageSize` aceita pedir tudo de uma vez?

**Por que importa:** decide se a listagem custa 1 requisição ou N. No processo medido as
286 movimentações já vieram todas no DOM — mas isso pode ser o `pageSize` padrão do
tribunal, não uma garantia.

**Como responder:** inspecionar o form e testar valores.

```js
const f = document.forms[0];
console.log({
  pageSize: f.elements['movimentacoesPageSize']?.value,
  pageNumber: f.elements['movimentacoesPageNumber']?.value,
  linhas: document.querySelectorAll('[id^="rowmovimentacoes"]').length,
});
```

Depois teste um processo **maior** e veja se aparece controle de paginação. **Não** submeta
o form com valores inventados num processo real sem necessidade.

### Q3 — O que o menu **Exportar ▼** oferece?

**Por que importa:** pode existir uma rota de **autos consolidados** que dispensa os 108
POSTs de expansão. Seria a diferença entre uma requisição e cento e oito.

**Como responder:** clicar no menu e **ler as opções** (não executar — geração de PDF
consolidado dá carga no servidor). Anotar os nomes e, se houver, as rotas dos itens.

### Q4 — O painel monta dentro do frame ou desenha no topo?

**Por que importa:** é a decisão de UX do SEEU.

- **(a) Dentro do frame de autos** — mais seguro, isolado, mas o painel fica confinado à
  área do frame.
- **(b) Desenhar em `window.top.document`** — same-origin permite, e daria o painel
  flutuando sobre a janela inteira, como no PJe.

**Restrição dura:** o topo é um `<frameset>`, **que não tem `<body>`**. Um `<div>` não pode
ser anexado ali. Então (b) só é viável mirando o frame intermediário
(`areaAtuacao.do`, `window.parent`), **não** o topo.

**Como responder:**

```js
console.log({
  topoEhFrameset: !!window.top.document.querySelector('frameset'),
  topoTemBody: !!window.top.document.body,
  paiTemBody: !!window.parent.document.body,       // areaAtuacao.do
  mesmaOrigem: (() => { try { return !!window.parent.document; } catch { return false; } })(),
});
```

**Recomendação preliminar:** começar por (a) — confinado ao frame — porque não depende de
acesso cross-frame e não muda `panel.js`. Migrar para o frame-pai depois, se a experiência
pedir.

---

## Método: sondagem com CONTROLE

Se precisar descobrir rotas novas, use um **nome inventado** junto das candidatas. Sem
ele, uma sequência de 404 não prova nada — pode ser o servidor recusando tudo.

```js
const rotas = ["processo/NOME_INVENTADO_XYZ.do", "processo/consultaPublica.do", /* … */];
for (const r of rotas) {
  try { const resp = await fetch("/seeu/" + r, { redirect: "manual" });
        console.log(resp.status, r); }
  catch { console.log("ERR", r); }
}
```

Nesta sessão: o inventado deu **404** e `consultaPublica.do` deu **405** (existe, exige
POST) — foi o controle que tornou a sondagem confiável.

---

## Cuidados

- **Somente leitura.** Nada de salvar, assinar, juntar ou movimentar. Este é um sistema de
  execução penal em produção.
- **Não colar dados reais em documentação.** Número de processo de execução identifica uma
  pessoa presa. Use `0000000-00.0000.0.00.0000` nos exemplos.
- **Não logar o `_tj`** em nada que possa ser commitado: é credencial de acesso a recurso.

---

## Entregável

Um arquivo `docs/seeu-estrutura.md`, irmão de `docs/pje-tela-documentos.md` e
`docs/pje-api-rest.md`, com: árvore de frames, rotas, o que foi medido e **em que data**,
e o que continua sendo premissa.

> Datar é obrigatório. O SEEU foi da v19.0.0 à v20.5.1 em poucos meses — afirmação sem
> data envelhece sem avisar.

---

## Critério de pronto

- [ ] Q1 a Q4 respondidas, com a evidência anotada
- [ ] `docs/seeu-estrutura.md` criado e **datado**
- [ ] Nenhum arquivo de `src/` modificado
- [ ] Nenhum dado pessoal real no documento

---

**Próxima:** [`09-seeu-identidade-ficha-movimentacoes.md`](09-seeu-identidade-ficha-movimentacoes.md)
