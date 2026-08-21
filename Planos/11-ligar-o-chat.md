# Etapa 11 — Ligar o chat no SEEU

**Depende de:** 10 (lista e download funcionando)
**Toca o PJe?** Não.
**Objetivo:** virar `suportado()` para `true` e fazer o primeiro turno real no SEEU.

---

## A mudança é de uma linha

```diff
   function suportado() {
-    return false;
+    return true;
   }
```

O resto da extensão — três provedores, streaming SSE, prompts, medidor de contexto, custo,
memória de caso — **não muda uma linha**. É a recompensa de `panel.js` nunca ter chamado o
adaptador: a UI já era agnóstica.

Mas há quatro coisas que precisam ser conferidas **antes** de virar a chave, porque cada
uma falha em silêncio.

---

## 1. O `PROMPT_INICIO` fala de "peça, id e folha"

A regra de rastreabilidade peça·id·folha vive em **cinco** lugares (`PROMPT_INICIO`,
`SYSTEM_PROMPT_CIT_TEXTUAL`, `SUFIXO_MINUTA`, `SUFIXO_MAPA`, o `LEIA-ME` do `.zip`) e o
formato literal é `(Peça, id 123456, fl. 7)`.

**No SEEU não há id numérico de documento.** O id é sintético (`seeu:<seq>:<nome>`), e
mandar o modelo citar isso produziria uma referência que o usuário não consegue procurar
na tela.

**A âncora natural do SEEU é a movimentação:** `Seq.` + data + evento é o que aparece na
tela e é por onde o usuário reencontra a peça. Há precedente exato no projeto — a linha do
tempo do PJe já abriu **exceção deliberada** para movimentações, que se citam como
`(movimentação de DD/MM/AAAA)` porque publicação, intimação e trânsito não têm peça nem
folha.

**Decisão a tomar aqui:** o formato do SEEU deve ser algo como
`(Nome do arquivo, movimentação 123 de DD/MM/AAAA, fl. 7)`. Condicione por **dialeto**, no
ponto único onde o system é montado (`systemPromptAtual()`), nunca espalhado.

## 2. `contextoDoProcesso` precisa da ficha do SEEU

Ele monta CNJ + ficha + data de hoje. Com a Etapa 09 pronta, funciona — **confira** que a
ficha não voltou `null` (o system degrada em silêncio para "sem ficha", e o modelo passa a
errar o enquadramento).

## 3. A linha do tempo entra pelo caminho já existente

`linhaDoTempoProcessual()` consome `listarMovimentacoes()`. O SEEU entrega **melhor** dado
que o PJe (hora e autor de graça). Confira o **selo** `.linhatempo` na `.metarow`: ele deve
anunciar a fonte e a contagem corretas.

## 4. O inventário de peças não marcadas

`inventarioNaoMarcadas` lista `id - título` das peças fora do contexto. Com id sintético, a
lista fica ilegível (`seeu:14:SUBS DRA…`). **Use o nome do arquivo + a movimentação**, não
o id cru.

---

## O primeiro turno

Faça-o num processo **pequeno**, com **uma** peça marcada:

- [ ] O medidor de contexto mostra número plausível
- [ ] O pré-voo (`count_tokens`) roda sem erro
- [ ] A resposta chega e cita a peça de forma **que o usuário consegue localizar na tela**
- [ ] O custo aparece no rodapé
- [ ] "Nova conversa" limpa
- [ ] Reabrir o processo **retoma** a conversa (memória de caso — depende de `chaveDoCaso`
      estável, Etapa 09)

---

## Privacidade — leia antes do primeiro turno real

A capa do SEEU traz CPF, RG, nome da mãe, RJI e local de prisão. **A partir do momento em
que o chat liga, peças de execução penal passam a ser enviadas a uma API externa.**

Isso não é novo em natureza (o PJe já envia peças), mas é **novo em grau**: são dados de
pessoa presa, e boa parte dos processos de execução tramita em segredo.

Antes de considerar esta etapa pronta:

- [ ] Reler o **art. 19, §3º, IV** da Res. CNJ 615 (vedado uso de IA privada/externa em
      documento sigiloso, **salvo anonimização na origem**)
- [ ] Conferir que o `Nível de Sigilo` da capa é lido e **exibido ao usuário** antes do envio
- [ ] Atualizar `PRIVACY.md` e `help.html` com a menção explícita ao SEEU
- [ ] Reforçar o ponteiro para o **TecJustiça Sigilo** — que aqui deixa de ser conveniência
      e passa a ser o caminho recomendado

> **Sugestão forte:** para processos com sigilo diferente de "Público", mostrar um aviso
> antes do primeiro envio. É a mesma lógica do `.gwarn` — avisar **antes** do gesto caro,
> não depois.

---

## Critério de pronto

- [ ] Turno completo funciona no SEEU, com citação localizável
- [ ] Formato de citação do SEEU definido e aplicado no ponto único
- [ ] Memória de caso retoma ao reabrir
- [ ] Aviso de sigilo implementado ou decidido explicitamente como fora de escopo
- [ ] `PRIVACY.md` atualizado
- [ ] PJe: suíte verde + smoke completo (a **última** verificação antes das etapas de domínio)

---

**Próxima:** [`12-dominio-execucao-penal.md`](12-dominio-execucao-penal.md)
