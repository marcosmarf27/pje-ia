#!/bin/sh
# Instalador do `pje` para WSL, Linux e macOS.
#
#   curl -fsSL https://raw.githubusercontent.com/marcosmarf27/pje-ia/main/instalar.sh | sh
#
# Ou, de dentro de um clone:
#
#   ./instalar.sh
#
# O QUE ELE FAZ, e nada além disso:
#   1. confere o Node 22+
#   2. clona (ou atualiza) o repositório em ~/.local/share/tecjustica-pje/app
#   3. cria o comando `pje` em ~/.local/bin
#
# POR QUE UM ATALHO, E NÃO `npm i -g`: o CLI reusa `src/exportar.js` da extensão,
# e é esse reuso que garante que o pacote saia idêntico ao do painel. Um pacote
# npm solto copiaria só a pasta `cli/` e o `require("../src/exportar.js")`
# quebraria — ou obrigaria a duplicar o arquivo, e a cópia divergiria sem
# ninguém ver.
#
# Nada é instalado fora do $HOME: sem sudo, sem serviço.
#
# PARA QUEM USA WSL, duas coisas:
#
#   1. `pje login --sessao-atual` FUNCIONA aqui. Ele lê a área de transferência
#      do WINDOWS pelo `powershell.exe`, que é alcançável de dentro do WSL — e é
#      lá que está o navegador de onde saiu o "Copy as cURL". Continua sendo o
#      caminho recomendado, por não criar uma SEGUNDA sessão do PJe — e não por
#      o outro estar indisponível.
#
#   2. `pje login` SEM opção TAMBÉM funciona — se houver um Chrome do LINUX
#      instalado. MEDIDO EM 20/08/2026, Ubuntu 24.04 sob WSLg: login concluído
#      e 207 peças baixadas. O WSLg (padrão no Windows 11) dá o servidor
#      gráfico, e o `/usr/bin/google-chrome` é encontrado normalmente.
#
#      Esta nota já afirmou o CONTRÁRIO ("no WSL não há navegador gráfico"), a
#      partir de uma suposição sobre WSL2 pelado, nunca executada. Ficou aqui
#      como lembrete: afirmação sobre ambiente não testado é pior que silêncio,
#      porque manda o leitor por um caminho pior sem ele saber que há outro.
#
#      O que NÃO funciona é apontar para o `.exe` do lado Windows: a busca cobre
#      `/usr/bin/google-chrome` e similares, e um Chrome do Windows abriria a
#      porta de depuração noutro espaço de rede.
#
# E o que mais confunde: a sessão do Windows e a do WSL são ARQUIVOS DIFERENTES.
# No Windows ela vai para `%LOCALAPPDATA%\tecjustica-pje`; no WSL, para
# `~/.tecjustica-pje` do home do Linux. Logar de um lado NÃO loga do outro —
# cada ambiente faz o seu `pje login --sessao-atual`, a partir do mesmo
# navegador. (O mesmo vale para o destino: aponte `--destino` explicitamente se
# quiser que os dois gravem na mesma pasta.)

set -eu

REPO="https://github.com/marcosmarf27/pje-ia.git"
BASE="${XDG_DATA_HOME:-$HOME/.local/share}/tecjustica-pje"
APP="$BASE/app"
BIN="$HOME/.local/bin"

passo() { printf '\n=> %s\n' "$1"; }
ok()    { printf '   %s\n' "$1"; }
erro()  { printf '   %s\n' "$1" >&2; }

printf 'Instalador do pje (TecJustica PJe - CLI de autos)\n'

# --- 1. Node ---------------------------------------------------------------
passo "Conferindo o Node.js"
if ! command -v node >/dev/null 2>&1; then
  erro "Node.js nao encontrado. Instale a versao 22 ou mais nova:"
  erro "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs"
  erro "  (ou use nvm: nvm install 22)"
  exit 1
fi
VERSAO="$(node -e 'process.stdout.write(process.versions.node)')"
MAIOR="${VERSAO%%.*}"
# O CLI usa `fetch` (18+) e o `WebSocket` global, estavel so a partir da 22.4 —
# e e o WebSocket que sustenta o `pje login`.
if [ "$MAIOR" -lt 22 ]; then
  erro "Node $VERSAO e antigo demais. O 'pje login' precisa da 22+."
  exit 1
fi
ok "Node $VERSAO"

# --- 2. Codigo -------------------------------------------------------------
passo "Baixando o codigo"
mkdir -p "$BASE"

# Rodando de dentro de um clone existente, usa ELE — evita o usuario acabar com
# duas copias e editar a que nao esta instalada.
AQUI="$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd || true)"
if [ -n "${AQUI:-}" ] && [ -f "$AQUI/cli/pje.mjs" ]; then
  APP="$AQUI"
  ok "Usando o repositorio deste diretorio: $APP"
elif command -v git >/dev/null 2>&1; then
  if [ -d "$APP/.git" ]; then
    git -C "$APP" pull --ff-only >/dev/null 2>&1
    ok "Repositorio atualizado em $APP"
  else
    git clone --depth 1 "$REPO" "$APP" >/dev/null 2>&1
    ok "Repositorio clonado em $APP"
  fi
else
  erro "git nao encontrado - instale o git e rode de novo."
  exit 1
fi

if [ ! -f "$APP/cli/pje.mjs" ]; then
  erro "Nao achei cli/pje.mjs em $APP - instalacao abortada."
  exit 1
fi

# --- 3. Atalho -------------------------------------------------------------
passo "Criando o comando pje"
mkdir -p "$BIN"
cat > "$BIN/pje" <<EOF
#!/bin/sh
exec node "$APP/cli/pje.mjs" "\$@"
EOF
chmod +x "$BIN/pje"
ok "Atalho em $BIN/pje"

# --- 4. PATH ---------------------------------------------------------------
passo "Conferindo o PATH"
case ":$PATH:" in
  *":$BIN:"*) ok "$BIN ja esta no PATH" ;;
  *)
    # Acrescenta ao rc do shell em uso, uma vez so (o grep evita duplicar a
    # linha a cada reinstalacao).
    RC="$HOME/.bashrc"
    [ -n "${ZSH_VERSION:-}" ] && RC="$HOME/.zshrc"
    [ "$(basename "${SHELL:-}")" = "zsh" ] && RC="$HOME/.zshrc"
    LINHA='export PATH="$HOME/.local/bin:$PATH"'
    if [ -f "$RC" ] && grep -qF "$LINHA" "$RC"; then
      ok "$RC ja tinha a linha do PATH"
    else
      printf '\n# TecJustica PJe (CLI)\n%s\n' "$LINHA" >> "$RC"
      ok "Adicionado ao $RC"
    fi
    printf '   Abra um terminal NOVO (ou: source %s)\n' "$RC"
    ;;
esac

cat <<EOF

Pronto.

  1. pje login --sessao-atual
     (com o PJe aberto e logado no seu navegador; ele guia o passo manual.
      No WSL ele le a area de transferencia do Windows)

     Se voce NAO estiver logado no PJe e tiver navegador grafico:
       pje login https://pje.SEUTRIBUNAL.jus.br/pje1grau

  2. pje baixar 0000000-00.0000.0.00.0000
     (rodar de novo no mesmo processo busca so o que apareceu depois)

  pje ajuda    para o resto

Atualizar depois:  git -C "$APP" pull
Desinstalar:       pje logout ; rm -rf "$BASE" "$BIN/pje"
EOF
