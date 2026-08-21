# Etapa 13 — Paridade: minuta, mapa e `.zip`

**Depende de:** 12 (domínio calibrado)
**Toca o PJe?** Não.
**Objetivo:** as saídas que faltam. É a etapa mais barata do plano — quase tudo já
funciona por herança.

---

## Por que é barata

Minuta, mapa mental e "escolher com IA" são **chats comuns** — sem tools, sem skill, sem
`container`. Foi por isso que funcionaram nos três provedores sem código condicional, e é
por isso que funcionam no SEEU: o adaptador entrega peças, e o resto é o de sempre.

A exportação `.zip` é ainda mais favorável: `exportar.js` (877 linhas) tem **zero**
referências a `PJE` ou a `document` — recebe `docs`, a `ficha` e um `obter(id)`. Ele já é
agnóstico por projeto.

---

## Minuta

**O que já funciona:** o fluxo inteiro, o editor, o `.docx`, os rascunhos.

**O que precisa de atenção:**

1. **`ESPECIES_ATO` da execução** (vem da Etapa 12) — e o **regime de orientação
   obrigatória** de cada uma. A Res. CNJ 615 não muda por ser execução penal: decisão de
   progressão é juízo conclusivo (AR4), e **exige tese**. Classifique cada espécie nova
   como `tese` / `sentido` / `livre` com o mesmo critério.
2. **Formato de citação** — a âncora do SEEU (Etapa 11), não `(Peça, id, fl.)`.
3. **`molduraModelos`** funciona igual; as peças-modelo da execução são outras, mas isso é
   o usuário quem cadastra.

> **Não afrouxe a orientação obrigatória "porque é execução".** O risco é o mesmo ou maior:
> uma decisão de progressão minutada sem tese é exatamente a hipótese que o art. 19, §3º, V
> **veda**.

## Mapa mental

**Funciona por herança.** O único ajuste vale a pena: os `EIXOS` de `mapa.js` classificam
por regex sobre o título (partes, fatos, provas, decisões). Numa execução, os eixos naturais
são outros — **pena e cálculo**, **incidentes**, **conduta carcerária**, **benefícios**.

Ajuste de baixo risco: `EIXOS` já é uma tabela de regex, e errar ali só custa um ícone
genérico.

## Exportação `.zip`

**Funciona por herança**, com dois ajustes:

1. **O nome do arquivo.** A convenção é `NNN_Titulo-limpo_ID.ext`, e o `ID` está lá porque
   *o nome do arquivo é o único metadado que sobrevive a sair da ferramenta*. Com id
   sintético, use **`Seq.` da movimentação** — é o que existe na tela do SEEU.
2. **`descreverOrigemLista`** afirma como a lista foi obtida. Precisa dizer a verdade sobre
   o SEEU (tabela renderizada + N expansões), e **datar**.

## Carta precatória

O SEEU tem `processo/cartaPrecatoria.do` — pode haver equivalente ao pacote do PJe. **Não
presuma**: aquele pacote foi construído sobre o **movimento processual** como sinal, e a
precisão medida (100% pelo movimento contra 50% pelo título) veio de fixtures reais. Trate
como investigação própria, fora desta etapa.

---

## Critério de pronto

- [ ] Minuta gera, abre no editor e exporta `.docx`
- [ ] Espécies da execução com regime de orientação definido
- [ ] Mapa mental abre e os eixos fazem sentido
- [ ] `.zip` sai com nomes legíveis e índice correto
- [ ] Caminho no `.zip` dentro do teto de 260 caracteres do Windows (**com margem ≥ 40**)
- [ ] PJe: suíte verde + smoke completo

---

## Depois desta etapa

O suporte ao SEEU está funcional. O que resta é **decisão, não código**:

- Smoke test amplo, em vários processos e por mais de um usuário
- A escolha de publicação (mesma extensão × extensão separada) — ver o fim de
  [`00-ESTUDO-VIABILIDADE.md`](00-ESTUDO-VIABILIDADE.md)
- Reescrita da ficha da Store, se for a mesma extensão
- Revisão de `PRIVACY.md`, `help.html` e `README.md`
- **Auditoria de segredos e PII antes de qualquer push** — o repositório é público
