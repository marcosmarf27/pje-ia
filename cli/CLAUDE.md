# CLI `pje` — baixar autos em lote

`cli/` é um programa Node **separado**, para baixar autos por CNJ fora do
navegador. Ele **NÃO é a extensão** e a regra dura é: **nada em `src/`,
`manifest.json`, `vendor/`, `icons/` ou `empacotar.ps1` muda por causa dele.**
`empacotar.ps1` copia só esses quatro, então `cli/` fica fora do pacote da Store
**por construção**. Detalhes, conceitos e limites em `cli/README.md`.

- **Ele reusa `src/exportar.js` LENDO, nunca alterando.** `opts.zip` do
  `montarZip` não é um formato — é um **sink** (`criar`/`add`/`fechar`), e um
  sistema de arquivos o satisfaz. Daí o pacote sair idêntico ao do botão ⬇ do
  painel, e daí o **oráculo**: rodar os dois sobre o mesmo processo revela
  divergência. (A recíproca — "ao mexer em `exportar.js`, lembrar que há um
  segundo consumidor" — fica no `CLAUDE.md` da raiz, porque ela é preciso quando
  se está em `src/`, que é justamente quando este arquivo não carrega.)
- **Só rotas sob `pje-legacy/`, só GET, teto de tempo em tudo.** As de fora
  (`fluxo`, `informacaoSessao`, `monitoracao`, `miniPac`) **penduram**, que é
  pior que erro. E `Accept: application/json, text/plain, */*` sempre — com
  `text/plain` o PJe responde **406**, que já foi lido como "cookie expirado".
- **A sessão é uma CREDENCIAL AO PORTADOR** e vive no perfil do usuário, fora do
  repositório. **O valor do cookie nunca sai em log, erro ou `pje status`** —
  nem truncado. O `.gitignore` cobre `sessao.json` e as saídas.
- **`403` costuma ser peça CANCELADA**, não falta de permissão: o movimento diz
  `Situacao: Cancelado` e o título aparece riscado na timeline. A ausência dela
  no pacote está CERTA.
- **Os dois casos concretos do `pje login`** (as REGRAS que eles ensinaram estão
  na raiz, porque valem para o projeto inteiro):
  - `Storage.getCookies` não respondeu sob WSLg enquanto `Target.getTargets`
    respondia na mesma conexão. A saída foi uma segunda rota por outro domínio e
    outro alvo (`Network.getAllCookies` numa aba anexada) — rota que pendura
    precisa de ALTERNATIVA, não de teto maior.
  - `colherCookies` estava nua dentro de um `try { while } finally { fechar }` —
    e `finally` NÃO engole exceção. O comando que anuncia esperar dez minutos
    morria aos 12 segundos.
- **`.gitattributes` existe por causa do `instalar.sh`**: com `core.autocrlf`,
  quem clona no Windows recebe `*.sh` em CRLF e leva `bad interpreter: /bin/sh^M`
  ao rodar no WSL. Falha **assimétrica** — quem instala por `curl | sh` não a vê.
- **Testes fora do navegador** (scratchpad, sem dependência): sink+`montarZip`,
  cache incremental (inclusive renumeração no meio da lista), classificação de
  corpo (casca × despacho curto) e o parser de *Copy as cURL* (cmd e bash).
