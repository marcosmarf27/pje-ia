# `pje` — baixar autos do PJe em lote

Ferramenta de linha de comando, **separada da extensão**. Você passa números CNJ
e ela grava uma pasta por processo, com as peças separadas e índice — o mesmo
formato do botão **⬇ Baixar .zip** do painel, porque é literalmente o mesmo
código de montagem (`src/exportar.js`).

```
pje login --sessao-atual        # uma vez, enquanto o PJe está aberto no navegador
pje baixar 0000000-00.0000.0.00.0000
pje baixar 0000000-00.0000.0.00.0000        # de novo: busca só o que apareceu depois
```

Sem dependências. Sem `npm install`. Node 22+.

---

## Instalação

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/marcosmarf27/pje-ia/main/instalar.ps1 | iex
```

**Linux, WSL ou macOS:**

```sh
curl -fsSL https://raw.githubusercontent.com/marcosmarf27/pje-ia/main/instalar.sh | sh
```

O instalador confere o Node 22+, clona (ou reusa) o repositório em
`%LOCALAPPDATA%\tecjustica-pje\app` (`~/.local/share/tecjustica-pje/app` no
Unix) e cria um **atalho** `pje` no PATH do usuário. Nada é instalado fora do
seu perfil: sem administrador, sem serviço, sem mexer no PATH da máquina.

**Por que um atalho e não `npm i -g`:** o CLI reusa `src/exportar.js` da
extensão. Um pacote npm copiaria só a pasta `cli/` e o `require("../src/
exportar.js")` quebraria — ou obrigaria a duplicar o arquivo, e a cópia
divergiria sem ninguém ver. Com o atalho, o repositório continua sendo a fonte
única e atualizar é `git pull`.

---

## A extensão não é tocada

Isto aqui **lê** `src/exportar.js` e nunca o modifica. Nenhum arquivo de `src/`,
`manifest.json`, `vendor/` ou `icons/` muda por causa do CLI, e `empacotar.ps1`
copia apenas esses quatro — então `cli/` fica fora do pacote da Web Store **por
construção, não por disciplina**.

Reusar `exportar.js` em vez de reimplementar dá duas coisas de graça: os nomes de
arquivo, a ordem cronológica, o `LEIA-ME.md` e os índices saem idênticos aos da
extensão; e isso vira um **teste**, porque rodar os dois sobre o mesmo processo e
comparar revela qualquer divergência.

---

## Sessão: os conceitos, porque tudo aqui depende deles

### Duas coisas diferentes, em lugares diferentes

| | onde vive | o que é |
|---|---|---|
| **sessão do PJe** | na memória do servidor do tribunal | o registro de que você está logado |
| **sessão do navegador** | no perfil do Chrome, no seu disco | o pote de cookies |

Ao fazer login, o servidor **cria o registro** e devolve um cookie
(`JSESSIONID`). É a ficha do guarda-volumes: o casaco fica lá, você fica com o
número, e **quem apresentar o número leva o casaco — ninguém pergunta se é
você**. Depois do login não há senha viajando; há a ficha, em toda requisição.

### `pje login --sessao-atual` — o caminho recomendado

Ele **copia a ficha** do seu navegador para o CLI. Não cria sessão nova: há um
registro só no servidor, e agora dois lugares com cópia do cookie. Isso importa
porque **o PJe não aceita duas sessões suas ao mesmo tempo** — um segundo login
derruba o primeiro.

O comando guia o passo manual (F12 → Network → botão direito na requisição →
*Copy as cURL*) e **espera** você copiar, sem prazo apertado. Ele lê da área de
transferência sozinho; não há arquivo intermediário para criar.

Funciona também onde a depuração remota do navegador é bloqueada por política
corporativa — que é a situação de boa parte das máquinas de tribunal.

### `pje login [url]` — quando você ainda não está logado

Abre um Chrome com **perfil próprio** e espera você logar. Só compensa quando
não há sessão do PJe aberta, justamente pela simultaneidade acima.

Ele usa perfil dedicado porque **desde o Chrome 136 o `--remote-debugging-port` é
ignorado no perfil padrão** — só vale acompanhado de `--user-data-dir` apontando
para outro diretório. Não é preferência nossa: é a única forma possível.

O comando só declara sucesso quando (a) existe cookie do Keycloak — o
`JSESSIONID` sozinho nasce antes de qualquer autenticação e não prova nada —,
(b) o backend responde a `currentUser`, e (c) a sessão **continua viva 4 s
depois**. Sem essas três, ele anunciaria um login pela metade e a falha só
apareceria no comando seguinte, sem ligação aparente com o login.

**MEDIDO EM 20/08/2026, Ubuntu 24.04 sob WSLg:** login concluído e 207 peças
baixadas em seguida. Ou seja, **funciona no WSL** — basta haver um Chrome do
**Linux** instalado; o WSLg (padrão no Windows 11) fornece o servidor gráfico.
Esta documentação já afirmou o contrário, a partir de uma suposição sobre WSL2
sem interface, nunca executada.

**E `Storage.getCookies` pendurou nesse ambiente** — não deu erro, simplesmente
não respondeu, enquanto `Target.getTargets` respondia na mesma conexão; o mesmo
Chrome no Windows responde na hora. Por isso a leitura tem **duas rotas**: se a
primeira não responde em 6 s, o CLI anexa a uma aba e usa
`Network.getAllCookies`, que apesar do nome devolve o pote do navegador inteiro.
Outro domínio do protocolo, outro alvo, outro modo de falha — a mesma regra que
o `pje-http.mjs` aplica às rotas do PJe.

**E, acima de tudo: nenhuma chamada isolada encerra a espera.** A versão
anterior deixava `colherCookies` sem `try` dentro de um `finally` que só fechava
o CDP — e `finally` não engole exceção. Um comando que anuncia esperar dez
minutos morria aos 12 segundos, antes de o usuário digitar o CPF. Hoje a falha
de uma volta só faz a seguinte tentar de novo, que é literalmente o que o laço
existe para fazer.

### Onde ficam os arquivos

Em `%LOCALAPPDATA%\tecjustica-pje\` (Windows) ou `~/.tecjustica-pje/` (Unix)
— **fora do repositório**. Guardar credencial dentro dele seria pedir para ela
ir num commit por acidente; o `.gitignore` protege, mas depender só dele é
frágil demais para o que está em jogo.

| | o que é | sensível? |
|---|---|---|
| `config.json` | tribunal, destino, caminho do navegador | não |
| `sessao.json` | **a ficha** (cookies + cabeçalhos) | **sim** |
| `perfil/` | perfil do Chrome, só se você usou `pje login` sem opção | **sim** |
| `bin/pje.cmd` | o atalho | não |

### Isto é uma credencial ao portador

Quem tiver o `sessao.json` **entra no PJe como você**. Ele é gravado com
permissão `0600` onde o sistema a respeita (no Windows o `mode` é praticamente
ignorado — ali a proteção real é o arquivo viver no perfil do usuário), fica
fora do repositório, e **o valor do cookie nunca sai em saída nenhuma** — nem truncado, porque os primeiros caracteres de um
`JSESSIONID` já reduzem muito o espaço de busca. `pje status` diz *"9 cookies
incluindo JSESSIONID"*: o nome, nunca o conteúdo.

`pje logout` apaga a sessão e o perfil. Use-o quando terminar.

Ler o banco de cookies do Chrome por fora **não** é alternativa: desde o Chrome
127 o *App-Bound Encryption* amarra a chave ao binário assinado do navegador, e
ferramenta de terceiros só extrai blobs que não decifra.

---

## Comandos

| | |
|---|---|
| `pje login --sessao-atual` | aproveita a sessão aberta no seu navegador |
| `pje login [url]` | abre um Chrome próprio para logar do zero |
| `pje baixar <cnj>...` | baixa os processos (só o delta, se já houver pasta) |
| `pje atualizar` | o mesmo, para tudo que já está no destino |
| `pje sondar <cnj>...` | não baixa: mede quantas peças dá para pegar |
| `pje status` | a sessão está viva? o que já foi baixado? |
| `pje logout` | apaga a sessão salva e o perfil do navegador |

Opções: `--lista <arquivo>` (um CNJ por linha, `#` comenta), `--destino`,
`--zip`, `--forcar`, `--concorrencia <n>` (padrão 3, teto 5), `--json`,
`--limite <n>` (só no sondar).

**Códigos de saída:** `0` ok · `1` erro de uso · `2` sessão morta ·
`3` concluído com falhas.

---

## Atualizar em vez de rebaixar

Rodar de novo sobre um processo já baixado **não** rebaixa tudo: o CLI lê o
`indice.json` que ele mesmo gravou e busca no PJe só o que apareceu depois.
`--forcar` ignora o disco.

**Por que ele remonta o pacote inteiro em vez de só anexar as novas:** o `NNN_`
do nome do arquivo é a posição *cronológica*, recalculada sobre a lista toda. Uma
peça nova que entre no meio empurra todas as seguintes — e anexar deixaria o
mesmo documento na pasta sob dois números diferentes, sem erro nenhum e só
perceptível ao abrir. Então quem fica esperto é a busca da peça, não a montagem:
peça que está em disco é lida do disco, e a numeração sai sempre correta.

Efeito colateral útil: peça que da última vez falhou é **retentada** na execução
seguinte.

**A limpeza de sobras é por ID, nunca por nome.** Quando a renumeração troca o
`NNN_` de um arquivo, a versão antiga vira lixo e precisa sair; mas a regra
ingênua ("apague o que não está na lista de nomes que acabei de gravar") apaga
**tudo que veio do disco em vez da rede** — isto é, o pacote inteiro numa
atualização incremental. Só é removido o arquivo cujo id foi regravado sob outro
nome, ou cujo id saiu do processo.

---

## O que ele NÃO consegue fazer

O PJe **não materializa uma peça até ela ser aberta na sessão**. Peça nascida no
editor que nunca foi aberta pode responder `200` com um envelope vazio. Não é a
rota: é estado no servidor, e nenhuma URL contorna — o `linkDownload` foi medido
lado a lado e devolve o mesmo vazio. Quem materializa é a **ativação JSF**, que
exige a página dos autos viva, e o CLI não a tem.

**Medido em processo real do TJCE (agosto/2026), 141 documentos: 0% de casca.**
Ou seja, na prática o problema quase não aparece — peça de processo em andamento
costuma já ter sido aberta por alguém. Mas quando aparecer, o CLI nunca finge: a
peça entra no índice como falha, com o motivo escrito, e os ids saem listados ao
final. A saída é abrir o processo no PJe e usar o **⬇ Baixar .zip** do painel,
que ativa peça a peça antes de baixar; ou rodar o CLI de novo depois.

Meça antes, se quiser: `pje sondar <cnj>` confere a sessão, resolve o CNJ, lista
as peças e testa uma amostra — **sem gravar nada**.

### `403` costuma ser peça CANCELADA, e a ausência dela está certa

Peça recusada com `403` não é falha de permissão sua. Medido em processo real:
as peças "Mandado" recusadas correspondiam a movimentos dizendo
`Situacao: Cancelado`, e na linha do tempo do PJe apareciam com o título
**riscado**. O PJe não serve documento cancelado.

Isso muda o que o relatório significa: a ausência dessas peças não é lacuna do
pacote, é o pacote refletindo os autos. Por isso o CLI **oferece** as
movimentações de cancelamento como pista — sem afirmar qual peça corresponde a
qual, porque o `textoFinalExterno` nem sempre traz `Documento: NNNN` e o
pareamento não se sustenta neste dado.

---

## Como ele fala com o PJe

Tudo **GET**, autenticado só por cookie, sob
`/{base}/seam/resource/rest/pje-legacy/`. Essas rotas passam pelo *Seam Filter*
(que dá o contexto de sessão) e **não** pelo *Faces Servlet*, que é o único que
cria e despeja *view state* — por isso elas não consomem as telas JSF cuja
exaustão derruba a aba do PJe com "Sua página expirou".

| passo | rota |
|---|---|
| sanidade | `status/info` |
| sessão viva | `usuario/isAuthenticated` → `usuario/currentUser` |
| CNJ → id | `processos/numero-processo/{CNJ}/validar` |
| ficha | `processos/{id}` + `cadastro-partes/processos/{id}/partes` |
| peças | `processos/{id}/documentos` |
| movimentações | `processos/{id}/movimentacoes` |
| download | `documento/download/{TRIB}/{grau}/{id}/{idDoc}` |

Catálogo completo e as medições em `docs/pje-api-rest.md`.

**Três regras que não podem cair**, comentadas em `pje-http.mjs`:

1. **Só rotas sob `pje-legacy/`.** As de fora (`fluxo`, `informacaoSessao`,
   `monitoracao`, `miniPac`) *penduram* — pior que erro, porque prendem o
   comando.
2. **Só GET.** Nem toda escrita no PJe é POST.
3. **Teto de tempo em tudo.**

E uma quarta, que custou um diagnóstico errado: **`Accept: application/json,
text/plain, */*`**, o do navegador. `usuario/isAuthenticated` e
`numero-processo/{CNJ}/validar` respondem **406** a `Accept: text/plain`, mesmo
devolvendo texto puro — e um 406 lido como "cookie expirado" manda o usuário
refazer um login que estava perfeito.

---

## Arquivos

| | |
|---|---|
| `pje.mjs` | entrada e despacho dos subcomandos |
| `baixador.mjs` | o laço de download, retry, pool de concorrência, relatório |
| `sessao.mjs` | parser do *Copy as cURL*, área de transferência, precedência |
| `chrome.mjs` | descoberta do navegador, launch e CDP (sem dependência npm) |
| `config.mjs` | `config.json`, `sessao.json` (0600, escrita atômica) |
| `pje-http.mjs` | cliente REST — porta da camada de rede do `src/pje.js` |
| `ficha.mjs` | adapta o REST ao formato que `exportar.js` espera |
| `corpo.mjs` | classifica PDF/HTML/RTF/imagem, detecta casca, conta páginas |
| `cache.mjs` | o que já está em disco não é baixado de novo |
| `sink-fs.mjs` | faz `montarZip` escrever numa pasta em vez de num `.zip` |
