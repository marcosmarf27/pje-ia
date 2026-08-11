// Login com Google — SÓ identidade/perfil (nome, e-mail, avatar). Não bloqueia
// nada na extensão: é a base para features futuras e para o usuário saber com
// qual conta está identificado. Sem backend.
//
// Método: chrome.identity.launchWebAuthFlow com o fluxo OpenID Connect implícito
// (`response_type=id_token`). Escolha deliberada frente ao getAuthToken:
//   - funciona SEM a extensão estar publicada na Web Store (dev e produção);
//   - a única permissão nova é `identity`, que NÃO gera aviso de instalação;
//   - o perfil sai decodificado do próprio JWT id_token, então NÃO precisamos de
//     host permission para `www.googleapis.com` nem de uma chamada de userinfo.
//
// CONFIGURAÇÃO EXTERNA (a única): crie um OAuth Client ID do tipo "Aplicativo
// Web" no Google Cloud Console e cole abaixo. No mesmo client, adicione como
// "URI de redirecionamento autorizado" EXATAMENTE o valor de
// `chrome.identity.getRedirectURL()` — para esta extensão ele é
// `https://<id-da-extensão>.chromiumapp.org/`. O id da extensão é estável quando
// o manifest tem uma `key` fixa (ou quando publicada). Sem o Client ID abaixo o
// botão "Entrar com Google" avisa que falta configurar, e nada mais quebra.
export const GOOGLE_CLIENT_ID = "";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const ISS_OK = new Set(["accounts.google.com", "https://accounts.google.com"]);

// launchWebAuthFlow com fallback para callback (robusto nas duas formas da API).
function launchWebAuthFlow(url) {
  return new Promise((resolve, reject) => {
    try {
      const p = chrome.identity.launchWebAuthFlow({ url, interactive: true }, (redir) => {
        const err = chrome.runtime.lastError;
        if (err) return reject(new Error(err.message));
        resolve(redir);
      });
      // Alguns runtimes devolvem Promise além de chamar o callback.
      if (p && typeof p.then === "function") p.then(resolve, reject);
    } catch (e) {
      reject(e);
    }
  });
}

// base64url → string, decodificando UTF-8 (nomes acentuados vêm assim).
function b64urlParaTexto(seg) {
  let s = seg.replace(/-/g, "+").replace(/_/g, "/");
  const resto = s.length % 4;
  if (resto) s += "=".repeat(4 - resto);
  const bin = atob(s);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function decodarPayload(jwt) {
  const partes = String(jwt || "").split(".");
  if (partes.length < 2) throw new Error("id_token malformado.");
  return JSON.parse(b64urlParaTexto(partes[1]));
}

function nonceAleatorio() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

// Extrai os parâmetros do FRAGMENTO (#...) do redirect. O id_token do fluxo
// implícito volta no fragmento, nunca na query.
function paramsDoRedirect(redir) {
  const url = new URL(redir);
  const frag = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  return new URLSearchParams(frag);
}

// Abre a tela de conta do Google e devolve `{email, name, picture, sub, exp}`.
// Grava o resultado em chrome.storage.local.googleUser.
export async function loginGoogle() {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error(
      "Login com Google não configurado: defina GOOGLE_CLIENT_ID em src/auth.js."
    );
  }
  const redirectUri = chrome.identity.getRedirectURL();
  const nonce = nonceAleatorio();
  const authUrl =
    AUTH_ENDPOINT +
    "?" +
    new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      response_type: "id_token",
      redirect_uri: redirectUri,
      scope: "openid email profile",
      nonce,
      prompt: "select_account",
    }).toString();

  const redir = await launchWebAuthFlow(authUrl);
  if (!redir) throw new Error("login cancelado.");

  const p = paramsDoRedirect(redir);
  const erro = p.get("error");
  if (erro) throw new Error(p.get("error_description") || erro);

  const idToken = p.get("id_token");
  if (!idToken) throw new Error("o Google não devolveu o id_token.");

  const claims = decodarPayload(idToken);

  // Verificações mínimas contra troca de token (sem checar assinatura: é só
  // exibição de perfil, sem backend). aud + nonce + iss + validade.
  if (claims.aud !== GOOGLE_CLIENT_ID) throw new Error("id_token de outro aplicativo.");
  if (claims.nonce !== nonce) throw new Error("nonce não confere.");
  if (!ISS_OK.has(claims.iss)) throw new Error("emissor inesperado.");
  const agora = Math.floor(Date.now() / 1000);
  if (claims.exp && claims.exp < agora) throw new Error("id_token expirado.");

  const user = {
    email: claims.email || "",
    name: claims.name || claims.email || "",
    picture: claims.picture || "",
    sub: claims.sub || "",
    exp: claims.exp || 0,
    at: Date.now(),
  };
  await chrome.storage.local.set({ googleUser: user });
  return user;
}

export async function logoutGoogle() {
  await chrome.storage.local.remove("googleUser");
}
