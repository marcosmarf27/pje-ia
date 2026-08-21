# Etapa 01 — Preparação e rede de segurança

**Depende de:** 00 (leitura do estudo)
**Toca o PJe?** Não. Nenhum arquivo é modificado nesta etapa.
**Objetivo:** garantir que existe um caminho de volta ANTES de existir qualquer risco.

---

## Por que esta etapa existe

Rede de segurança montada depois do risco não é rede — é consolo. Aqui não se escreve
código: cria-se o ponto de retorno, confere-se que ele é válido e verifica-se que o
estado de partida é limpo. Se a árvore não estiver limpa, todas as etapas seguintes
ficam sem baseline confiável: não haveria como distinguir uma regressão introduzida por
elas de uma alteração que já estava pendente.

---

## Pré-condições

Rodar e conferir **antes de qualquer comando de escrita**:

```bash
git branch --show-current      # deve ser: main
git status --short             # esperado: só "?? store/" (não versionado por decisão)
git log --oneline -1           # deve ser: ed8b195 (ou o topo atual da main)
grep -m1 '"version"' manifest.json   # deve ser: "version": "0.47.0"
```

Se `git status` mostrar qualquer arquivo modificado além de `store/`, **PARE**: resolva
(commit ou stash) antes de continuar. Uma branch nascida de árvore suja carrega alterações
que ninguém planejou.

---

## Passos

### 1. Confirmar o artefato de retorno

O `.zip` publicado é a camada de rollback que não depende de git, rede nem rebuild.

```bash
ls -la tecjustica-pje-v0.47.0.zip
```

Deve existir e ter ~1,43 MB. **Se não existir**, gere-o antes de prosseguir
(`./empacotar.ps1` no PowerShell) e guarde-o fora do repositório também — em `.zip` o
`.gitignore` já o exclui, então ele não sobrevive a um `git clean -xdf`.

> Guarde uma cópia em outra pasta do disco. É a única camada de retorno imune a um
> comando git destrutivo.

### 2. Criar a tag do ponto de retorno

```bash
git tag -a v0.47.0-pre-seeu -m "Ponto de retorno: ultima versao 100% PJe, publicada na Store"
git tag -n1 v0.47.0-pre-seeu     # conferir
```

O hash já serviria. A tag existe porque **um nome legível é o que alguém acha sob pressão,
meses depois** — ninguém lembra de `ed8b195` durante um incidente.

### 3. Criar a branch de trabalho

```bash
git switch -c feat/seeu
git branch --show-current        # deve ser: feat/seeu
```

### 4. Registrar o baseline de sintaxe

```bash
node --check src/pje.js && node --check src/content.js && node --check src/panel.js
for f in src/*.js; do node --check "$f" || echo "FALHOU: $f"; done
```

Tudo deve passar em silêncio. Este é o estado "verde" de partida.

### 5. Anotar a contagem que a Etapa 04 vai verificar

```bash
grep -c "PJE\." src/content.js
```

**Anote o número.** A Etapa 04 vai exigir que, após a troca, o `grep` devolva apenas as
ocorrências em comentários. Sem o número de partida anotado, não há como conferir.

---

## Critério de pronto (verificável)

- [ ] `git branch --show-current` devolve `feat/seeu`
- [ ] `git tag -n1 v0.47.0-pre-seeu` mostra a tag com a mensagem
- [ ] `git status --short` mostra apenas `?? store/` e `?? Planos/`
- [ ] `git diff v0.47.0-pre-seeu --stat` **não devolve nada** (nenhum arquivo alterado)
- [ ] `tecjustica-pje-v0.47.0.zip` existe, e há uma cópia fora do repositório
- [ ] `node --check` passa em todos os `src/*.js`
- [ ] A contagem de `PJE\.` em `content.js` está anotada

---

## O que NÃO fazer nesta etapa

- ❌ Não criar `src/autos.js` ainda (é a Etapa 03)
- ❌ Não tocar no `manifest.json`
- ❌ Não bumpar a versão — número de versão gasto é número queimado na fila da Store,
  e a Store recusa reenviar um pacote com versão já publicada
- ❌ Não fazer `git push` da branch ainda (não é necessário e não agrega segurança)

---

## Rollback desta etapa

Trivial, porque nada foi modificado:

```bash
git switch main
git branch -D feat/seeu
git tag -d v0.47.0-pre-seeu
```

---

**Próxima:** [`02-baseline-de-testes.md`](02-baseline-de-testes.md) — escrever a suíte e
rodá-la contra o código **ainda intocado**.
