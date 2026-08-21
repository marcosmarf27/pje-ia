# Etapa 09 — SEEU: identidade, ficha e movimentações

**Depende de:** 08 (mapa fechado)
**Toca o PJe?** Não.
**Objetivo:** `seeu.js` passa a ler o que a tela já entrega — número, ficha do processo e
a tabela de movimentações — sem nenhuma requisição adicional.

---

## Por que esta etapa vem antes das peças

Tudo aqui sai do **DOM já renderizado**: zero requisição, zero risco, e o resultado é
imediatamente verificável no console. As peças (Etapa 10) custam um POST por movimentação
— começar por elas seria pagar antes de validar o parser.

Há um bônus real: a tabela do SEEU traz `Evento` (vocabulário CNJ), **hora** e
`Movimentado Por` prontos. No PJe, o equivalente custa ~10 telas JSF de leitura da grid e
ainda assim não vem com hora. **A linha do tempo do SEEU nasce melhor que a do PJe.**

---

## Contratos a implementar

| Método | Devolve |
|---|---|
| `getNumeroProcesso()` | o CNJ formatado, para o system prompt |
| `chaveDoCaso()` | chave estável da memória de caso |
| `lerCabecalhoProcesso()` | ficha: classe, assunto, juízo, partes |
| `listarMovimentacoes()` | `[{seq, data, evento, texto, autor}]` |
| `lerEventos()` | a forma que `listarDocumentos` consome |

---

## Código

### Identidade

```js
// O `numeroUnico` vem sem mascara (20 digitos). O system prompt e o mapa mental
// esperam o CNJ formatado -- sem isso o modelo titula com numero cru ou inventa
// a formatacao.
function formatarCnj(n) {
  const s = String(n || "").replace(/\D/g, "");
  if (s.length !== 20) return null;
  return s.replace(/^(\d{7})(\d{2})(\d{4})(\d{1})(\d{2})(\d{4})$/,
                   "$1-$2.$3.$4.$5.$6");
}

function getNumeroProcesso() {
  return formatarCnj(getNumeroUnico());
}

// Espelha a chave do PJe (hostname | grau | id). No SEEU nao ha grau -- e um
// sistema de execucao unificado --, entao o segmento fixo "seeu" ocupa o lugar,
// mantendo o formato de tres partes que o casodb ja indexa.
function chaveDoCaso() {
  const n = getNumeroUnico();
  if (!n) return null;
  return location.hostname + "|seeu|" + n;
}
```

> **`chaveDoCaso` devolvendo `null` sem número é obrigatório**, não defensividade: chave
> inventada agruparia processos distintos na mesma memória de caso.

### Ficha do processo

```js
// A capa do SEEU e uma tabela rotulo/valor ("Numero Antigo:", "Juizo:",
// "Classe Processual:"...). Le-se por rotulo, NUNCA por posicao: a ordem varia
// com o tipo de processo e com o perfil do usuario.
//
// PRIVACIDADE -- decisao deliberada: sentenciado, nome da mae, CPF, RG e RJI
// existem na capa e NAO entram na ficha. A ficha vai para o system prompt de
// todo turno; o que o modelo precisa e do ENQUADRAMENTO do processo (classe,
// assunto, juizo, regime), nao da qualificacao civil de uma pessoa presa.
// Ver PRIVACY.md e a nota de privacidade no Planos/00-ESTUDO.
const ROTULOS_FICHA = {
  "classe processual": "classe",
  "assunto principal": "assunto",
  "juizo": "orgao",
  "nivel de sigilo": "sigilo",
};

function lerCabecalhoProcesso() {
  try {
    const out = { numero: getNumeroProcesso() };
    for (const tr of document.querySelectorAll("table tr")) {
      const c = tr.cells;
      if (!c || c.length < 2) continue;
      const rot = norm((c[0].textContent || "").replace(/:\s*$/, "").trim());
      const chave = ROTULOS_FICHA[rot];
      if (chave && !out[chave]) {
        out[chave] = (c[1].textContent || "").trim().replace(/\s+/g, " ");
      }
    }
    return out.classe || out.orgao ? out : null;
  } catch (e) {
    return null; // best-effort: ficha nula deixa o system byte a byte o de antes
  }
}
```

### Movimentações

```js
// A tabela tem DUAS linhas por movimentacao: a visivel (6 celulas) e a de
// DETALHE (1 celula, `id="rowmovimentacoesN"`), que so recebe conteudo quando
// expandida. Nao confiar em indice par/impar -- ancorar no id, que e estavel.
const RE_ROW_DET = /^rowmovimentacoes(\d+)$/;

function acharTabelaMovimentacoes() {
  // Sinal POSITIVO: a tabela que CONTEM as linhas de detalhe. Escolher "a maior
  // tabela" funcionaria hoje e quebraria no primeiro processo atipico.
  const det = document.querySelector('[id^="rowmovimentacoes"]');
  return det ? det.closest("table") : null;
}

function listarMovimentacoesDom() {
  const t = acharTabelaMovimentacoes();
  if (!t) return [];
  const out = [];
  for (const row of t.rows) {
    const c = row.cells;
    if (!c || c.length < 6) continue;              // pula cabecalho e detalhes
    const seq = (c[1].textContent || "").trim();
    if (!/^\d+$/.test(seq)) continue;              // sem Seq. numerico nao e movimentacao
    const bruto = (c[2].textContent || "").trim(); // "DD/MM/AAAA HH:MM:SS"
    const m = bruto.match(/^(\d{2}\/\d{2}\/\d{4})(?:\s+(\d{2}:\d{2}))?/);
    out.push({
      seq,
      data: m ? m[1] : null,
      hora: m && m[2] ? m[2] : null,               // hora SO quando existe
      evento: (c[3].textContent || "").trim().replace(/\s+/g, " "),
      autor: ((c[5] && c[5].textContent) || "").trim().replace(/\s+/g, " "),
      indice: (row.nextElementSibling &&
               (RE_ROW_DET.exec(row.nextElementSibling.id || "") || [])[1]) || null,
    });
  }
  return out;
}
```

> **Este código é receita, não produção.** Antes de confiar em qualquer bloco destes
> arquivos, cole-o num `.js` e rode `node --check`. Blocos de documentação não passam por
> nenhum compilador ao serem escritos.

```js
// `hora` separada de `data` porque ato de meia-noite exata e o que o sistema
// grava em publicacao de diario: escrever "00:00" ali afirmaria uma precisao
// que o dado nao tem. Mesma regra ja aplicada na linha do tempo do PJe.

// `listarMovimentacoes` e a rota assincrona que o content.js espera (no PJe ela
// e REST). Aqui o dado ja esta no DOM, entao resolve na hora -- mas a assinatura
// continua async, para o chamador nao ter dois caminhos.
async function listarMovimentacoes() {
  const ms = listarMovimentacoesDom();
  return ms.length ? ms : null;   // null = "nao consegui", e o content cai no fallback
}
```

---

## Ordenação

**Ordene sempre, e não confie na ordem de origem.** A tabela vem do mais recente para o
mais antigo; o `Seq.` é crescente com o tempo, então ordenar por `Seq.` numérico é mais
confiável que por data (que empata dentro do mesmo dia).

```js
ms.sort((a, b) => Number(a.seq) - Number(b.seq));   // cronologica crescente
```

> No PJe essa ordenação já custou um bug: pular o sort "porque a origem já ordenou" pôs a
> distribuição depois da sentença, e só o teste viu.

---

## Verificação

No console do frame `visualizacaoProcesso.do`:

```js
AUTOS.getNumeroProcesso()          // CNJ formatado
AUTOS.chaveDoCaso()                // host|seeu|numeroUnico
AUTOS.lerCabecalhoProcesso()       // {numero, classe, assunto, orgao, sigilo}
(await AUTOS.listarMovimentacoes()).length          // deve bater com a tela
(await AUTOS.listarMovimentacoes()).slice(0, 3)     // conferir seq/data/evento/autor
```

**Confira contra a tela**, movimentação por movimentação, nas 3 primeiras e nas 3 últimas.

---

## Critério de pronto

- [ ] Número, ficha e movimentações corretos em **ao menos 3 processos diferentes**
- [ ] A contagem de movimentações bate com a exibida na tela
- [ ] `hora` é `null` quando a tela não mostra hora
- [ ] A ficha **não contém** nome, CPF, RG, nome da mãe ou RJI
- [ ] `node --check src/seeu.js` passa
- [ ] PJe: suíte verde, smoke ok (nada deveria ter mudado)

---

**Próxima:** [`10-seeu-pecas.md`](10-seeu-pecas.md)
