# ROLLBACK — como voltar atrás

> **Voltar atrás não é fracasso: é o que torna seguro tentar.** A extensão do PJe está
> publicada e funcionando. Na dúvida, reverta primeiro e investigue depois — com o usuário
> protegido.

---

## As quatro camadas de retorno

Da mais barata para a mais definitiva:

| # | Camada | Quando usar | Custo |
|---|---|---|---|
| 1 | `git revert` de um commit | Uma etapa específica quebrou | segundos |
| 2 | `git reset` para a tag | Várias etapas ruins, nada aproveitável | segundos |
| 3 | Voltar para a `main` | A branch inteira é descartada | segundos |
| 4 | O `.zip` publicado | Emergência no navegador, sem tempo para git | 1 minuto |

---

## Camada 1 — Reverter uma etapa

```bash
git log --oneline           # ache o commit da etapa
git revert --no-edit <sha>
```

### Dependências entre etapas (importa a ordem)

| Etapa | Pode reverter sozinha? | Observação |
|---|---|---|
| 03 (`autos.js`) | **Não**, se a 04 já entrou | `content.js` passa a depender de `AUTOS`. Reverta **04 e depois 03** |
| 04 (troca) | Sim | |
| 05 (guarda) | Sim | A 04 não depende de `ehDocumentoDosAutos` |
| **06 (`all_frames`)** | **Sim, sempre** | Desenhada para isso. Reverter devolve o PJe ao estado da 05 e apenas torna o SEEU inalcançável |
| 07–13 (SEEU) | Sim | Não tocam o PJe |

> **A Etapa 06 é a que mais provavelmente precisará de revert**, e é a mais segura de
> reverter — desde que tenha sido commitada **sozinha**, como o plano manda. Se ela foi
> misturada com outra coisa, o `git revert` cirúrgico vira cirurgia.

### Verificação depois de qualquer revert

```bash
node --check src/*.js
git diff v0.47.0-pre-seeu --stat     # o que ainda difere do ponto de partida
```

E rode a suíte ([`TESTES.md`](TESTES.md)) — reverter também pode quebrar.

---

## Camada 2 — Voltar a branch ao ponto de partida

```bash
git reset --hard v0.47.0-pre-seeu
```

⚠ **Descarta trabalho não commitado.** Se houver algo a salvar:

```bash
git stash push -u -m "antes do reset"
git reset --hard v0.47.0-pre-seeu
```

---

## Camada 3 — Abandonar a branch

```bash
git switch main
git status --short          # esperado: ?? store/  ?? Planos/
git diff v0.47.0-pre-seeu --stat   # vazio
```

A `main` nunca recebeu nada, então **ela já é o estado publicado**. Se quiser apagar a
branch:

```bash
git branch -D feat/seeu
```

---

## Camada 4 — Emergência: voltar pelo `.zip`

Quando a extensão desempacotada está quebrada e é preciso trabalhar **agora**:

1. `chrome://extensions` → remover a versão desempacotada
2. Descompactar `tecjustica-pje-v0.47.0.zip` numa pasta **fora do repositório**
3. "Carregar sem compactação" nessa pasta

Ou, mais simples: **a extensão da Chrome Web Store continua instalada e funcionando** —
ela nunca foi tocada. As duas convivem no mesmo Chrome (IDs diferentes).

> Esta camada é a única imune a um comando git destrutivo. É por isso que a Etapa 01 manda
> guardar uma cópia do `.zip` fora do repositório: `*.zip` está no `.gitignore`, então o
> arquivo **não sobrevive a um `git clean -xdf`**.

---

## Sinais de que é hora de reverter

Não espere ter certeza. Reverta ao ver qualquer um destes:

- **Dois painéis** ou dois launchers na tela do PJe
- Erro novo no console de uma tela de autos
- `⟳ Carregar tudo` parou de funcionar, ou a tela do PJe começou a expirar mais
- Lentidão perceptível ao abrir um processo grande
- Qualquer teste da suíte vermelho **que estava verde no baseline**
- Consumo de API maior que o esperado sem explicação (**o sintoma do painel fantasma**)

> O último é o mais traiçoeiro: o painel fantasma dentro do iframe não aparece na tela e
> não emite erro. **Se o consumo subir sem motivo depois da Etapa 06, é ele até prova em
> contrário.**

---

## O que NUNCA fazer para "consertar rápido"

- ❌ **Editar `src/pje.js`** — é o arquivo que sustenta 100% dos usuários hoje
- ❌ **Publicar na Store a partir da branch**
- ❌ **Bumpar a versão** para "destravar" um upload (número gasto é número queimado; a
  Store recusa reenviar versão já publicada, e essa recusa é *confirmação de sucesso do
  envio anterior*, não erro)
- ❌ **`git push --force`** em qualquer branch
- ❌ **Apagar a tag `v0.47.0-pre-seeu`**
- ❌ **Mesclar na `main`** antes do smoke test completo no PJe real

---

## Registro de incidentes

Se alguma etapa precisar de revert, anote aqui — o próximo a tentar merece saber:

| Data | Etapa | O que aconteceu | Como foi resolvido |
|---|---|---|---|
| | | | |
