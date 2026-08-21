# Planos — suporte ao SEEU

Documentação de planejamento para dar suporte ao **SEEU** (Sistema Eletrônico de Execução
Unificado, `seeu.pje.jus.br`) na extensão que hoje atende o PJe 1.x.

> **NADA AQUI FOI IMPLEMENTADO.** Esta pasta é receita, não código em uso. Nenhum arquivo
> de `src/`, `manifest.json`, `vendor/`, `icons/` ou `empacotar.ps1` foi tocado para
> criá-la. Os blocos de código destes arquivos são **texto** — servem para alguém (dev ou
> agente) executar no futuro.

`Planos/` fica **fora do pacote da Chrome Web Store por construção**: `empacotar.ps1`
copia apenas `manifest.json`, `src/`, `icons/` e `vendor/`. Mesma garantia que já vale
para `cli/`.

---

## A REGRA DE OURO

> **A extensão do PJe funciona muito bem hoje e está publicada (v0.47.0). Ela é o ativo.
> Nenhuma etapa pode deixá-la pior. Na dúvida, pare e reverta.**

Consequências práticas, que valem para todas as etapas:

1. **`src/pje.js` NUNCA é editado.** Se uma etapa parecer exigir isso, o desenho está
   errado — pare e reveja. (O único método novo de que precisamos nasce em `autos.js`,
   por composição. Ver a Etapa 03.)
2. **`src/panel.js` NUNCA é editado** nas etapas 01–11. A UI é agnóstica ao sistema-fonte
   e deve continuar assim.
3. **Um commit por etapa.** Nada de commit que misture duas etapas — é o que transforma
   um `git revert` cirúrgico em cirurgia.
4. **A `main` não recebe nada.** Tudo vive em `feat/seeu`.
5. **Nunca publicar na Store a partir desta branch**, e **nunca bumpar a versão** nela.

---

## Ordem de execução

Cada etapa declara de qual depende. **Não pule etapas** — a ordem existe para isolar o
risco, não para organizar tarefas (ver "Por que esta ordem", abaixo).

| # | Arquivo | Toca o PJe? |
|---|---|---|
| 00 | [`00-ESTUDO-VIABILIDADE.md`](00-ESTUDO-VIABILIDADE.md) — o porquê, e o mapa técnico do SEEU | não |
| 01 | [`01-preparacao-e-rede-de-seguranca.md`](01-preparacao-e-rede-de-seguranca.md) | não |
| 02 | [`02-baseline-de-testes.md`](02-baseline-de-testes.md) | não |
| 03 | [`03-autos-js-alias-puro.md`](03-autos-js-alias-puro.md) | manifest |
| 04 | [`04-troca-mecanica-content.md`](04-troca-mecanica-content.md) | sim (mecânico) |
| 05 | [`05-guarda-de-frame.md`](05-guarda-de-frame.md) | sim |
| 06 | [`06-all-frames.md`](06-all-frames.md) | ⚠ **SIM — a etapa de risco** |
| 07 | [`07-seeu-esqueleto-e-deteccao.md`](07-seeu-esqueleto-e-deteccao.md) | não |
| 08 | [`08-mapa-do-seeu.md`](08-mapa-do-seeu.md) — só investigação | não |
| 09 | [`09-seeu-identidade-ficha-movimentacoes.md`](09-seeu-identidade-ficha-movimentacoes.md) | não |
| 10 | [`10-seeu-pecas.md`](10-seeu-pecas.md) | não |
| 11 | [`11-ligar-o-chat.md`](11-ligar-o-chat.md) | não |
| 12 | [`12-dominio-execucao-penal.md`](12-dominio-execucao-penal.md) | não |
| 13 | [`13-paridade.md`](13-paridade.md) | não |

**Transversais** (consultar a qualquer momento):

- [`TESTES.md`](TESTES.md) — a suíte completa e rodável
- [`ROLLBACK.md`](ROLLBACK.md) — como voltar atrás, etapa por etapa

---

## Por que esta ordem

Todo o risco desta rodada mora numa única mudança: ligar `all_frames: true` no manifest.
A sequência 03→06 foi desenhada para que, quando essa mudança chegar, **tudo o mais já
esteja validado** — e para que cada etapa anterior seja **inócua por construção**, não
por confiança na revisão:

```
Etapa 03   autos.js faz  AUTOS = PJE          alias puro; nada muda
Etapa 04   content.js: PJE.  →  AUTOS.        inócuo POR CONSTRUÇÃO (é o mesmo objeto)
Etapa 05   guarda de frame passa por AUTOS    mesma lógica de hoje, outro lugar
Etapa 06   all_frames: true                   ← A ÚNICA etapa de risco, sozinha
```

Quando a 06 for aplicada, ela é a única variável nova no sistema. Se algo quebrar, não há
o que investigar: as três anteriores não mudaram comportamento, e há teste provando.

---

## Como usar com um agente

Um prompt por etapa, nunca "faça as etapas 3 a 6". Sugestão:

```
Leia Planos/README.md e Planos/04-troca-mecanica-content.md.
Execute APENAS a etapa 04. Pare no critério de pronto e me mostre o resultado
da verificação. Não avance para a etapa 05.
```

Se o agente propuser editar `src/pje.js` ou `src/panel.js`, **recuse** — significa que ele
saiu do plano.

---

## Estado do projeto quando estes planos foram escritos

- Branch `main` em `ed8b195`, árvore limpa (exceto `store/`, não versionado por decisão).
- `manifest.json` na **v0.47.0**; Chrome Web Store publicada na **0.47.0**.
- `tecjustica-pje-v0.47.0.zip` na raiz do repositório é **byte a byte o pacote publicado**.
- SEEU medido em sessão real em **21/08/2026**, v20.5.1, num processo de execução penal
  com 286 movimentações, 108 delas com arquivo. O número do processo é **omitido de
  propósito**: este repositório é público, e o número de uma execução identifica uma
  pessoa presa.

Se muito tempo passou, **reconfira o mapa do SEEU** (Etapa 08) antes de escrever adaptador:
o sistema é atualizado com frequência (v19.0.0 → v20.5.1 em poucos meses).
