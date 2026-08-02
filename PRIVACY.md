# Política de Privacidade — TecJustiça PJe (Análise de Processos)

**Última atualização: 23 de julho de 2026**

A extensão **TecJustiça PJe — Análise de Processos** ("a extensão") adiciona um painel de chat
com IA à tela de autos digitais do PJe (Processo Judicial Eletrônico). Esta política
descreve, de forma completa, quais dados a extensão trata, para onde eles vão e o que
**nunca** é feito com eles.

**Resumo em uma frase:** a extensão não tem servidor próprio, não coleta telemetria e o
desenvolvedor **nunca tem acesso a nenhum dado seu** — os documentos que você selecionar
são enviados diretamente do seu navegador à API do provedor de IA que você escolheu
(Anthropic, Google ou OpenAI), autenticados pela **sua própria chave de API**.

## 1. Dados tratados e finalidade

| Dado | Finalidade | Para onde vai |
|---|---|---|
| **Peças processuais que você marcar** (PDFs/HTML dos autos) e **suas mensagens de chat** | Análise por IA — é o propósito único da extensão | Diretamente à API do provedor escolhido por você: **Anthropic** (`api.anthropic.com`), **Google** (`generativelanguage.googleapis.com`) ou **OpenAI** (`api.openai.com`). Nenhum outro serviço intermedia. |
| **Chaves de API** (Anthropic, Google e/ou OpenAI) fornecidas por você | Autenticar as chamadas à API do respectivo provedor | Armazenadas **somente** no `chrome.storage.local` do seu navegador (não sincronizam entre dispositivos). Enviadas exclusivamente ao provedor correspondente, como cabeçalho de autenticação. Nunca chegam ao contexto da página do PJe. |
| **Preferências** (modelo, nível de raciocínio, instruções personalizadas, modo de layout) | Funcionamento da interface | Somente `chrome.storage.local`. As instruções personalizadas são anexadas ao prompt enviado ao provedor escolhido. |
| **Prompts salvos** (título e texto que você escreve na biblioteca de prompts) | Reaproveitar instruções suas nas conversas | `chrome.storage.sync`: ficam no seu navegador e, se você usar o Chrome com uma conta Google e a sincronização ligada, o próprio Chrome os replica nos seus outros dispositivos (o desenvolvedor não tem acesso). O texto do prompt vai ao provedor de IA junto da mensagem quando você o usa. |
| **Rascunhos de minuta** (o texto que o modelo gera ao usar “Minutar” ou “Abrir no editor”, com o que você editar) | Permitir reabrir e continuar a minuta depois, inclusive noutro dia | `chrome.storage.local` — **ficam gravados neste computador**, não sincronizam e não saem dele. São apagados automaticamente após 7 dias (mantidos no máximo os 10 mais recentes); o botão **Descartar**, no editor, remove um rascunho na hora. |
| **Sessão do PJe** (cookies do tribunal) | Baixar as peças que você marcar, pelo mesmo mecanismo que o próprio PJe usa | Os cookies são gerenciados pelo navegador e **nunca são lidos, armazenados ou exportados pela extensão** — as requisições ao tribunal usam a sessão já aberta por você, e o conteúdo baixado fica em cache temporário na memória da aba. |

Nenhum dado além dos listados acima é tratado. A coleta limita-se ao estritamente
necessário ao propósito único da extensão (análise, por IA, das peças que **você**
selecionar), em conformidade com a política de Uso Limitado (*Limited Use*) da Chrome
Web Store.

## 2. O que a extensão NÃO faz

- **Não tem servidor próprio**: não existe backend do desenvolvedor; nenhum dado passa
  por infraestrutura nossa.
- **Não coleta telemetria, analytics ou estatísticas de uso** de nenhum tipo.
- **Não vende, aluga ou compartilha dados** com terceiros — o desenvolvedor sequer tem
  acesso a eles.
- **Não lê sua navegação**: o painel só é injetado em telas de autos digitais do PJe
  (páginas `*.jus.br` que contêm a linha do tempo do processo); em qualquer outra
  página `.jus.br` o script termina sem tocar no DOM.
- **Não envia nada automaticamente**: nenhum documento sai do navegador sem uma ação
  explícita sua (marcar peças e enviar uma mensagem).
- **Não usa os dados para publicidade** nem para determinar crédito ou qualquer
  finalidade alheia ao propósito único.

## 3. Provedores de IA (terceiros que recebem os dados)

Ao usar a extensão, as peças marcadas e suas mensagens são processadas pelo provedor do
modelo que **você** escolheu e configurou:

- **Anthropic (modelos Claude)** — [política de privacidade](https://www.anthropic.com/legal/privacy)
  e [termos comerciais](https://www.anthropic.com/legal/commercial-terms). Pela política
  vigente da API comercial, a Anthropic não treina modelos com os dados da API por
  padrão. Arquivos enviados à Files API permanecem na **sua** conta Anthropic (você pode
  excluí-los pelo console ou pela API).
- **Google (modelos Gemini)** — [termos da API Gemini](https://ai.google.dev/gemini-api/terms).
  Atenção: no nível **gratuito** da API do Google, os dados enviados podem ser usados
  para melhorar produtos; no nível **pago**, não. Recomendamos usar chave de conta com
  faturamento ativo para dados sensíveis. Arquivos enviados à File API do Google expiram
  automaticamente em 48 horas.
- **OpenAI (modelos GPT)** — [política de privacidade](https://openai.com/policies/privacy-policy)
  e [termos de uso da API](https://openai.com/policies/row-terms-of-use). Pela política
  vigente, a OpenAI não treina modelos com os dados enviados pela API por padrão. Arquivos
  enviados à Files API permanecem na **sua** conta OpenAI (você pode excluí-los pelo painel
  ou pela API).

A relação contratual com o provedor de IA é **sua** (a chave de API é sua); a extensão é
apenas o cliente técnico dessa comunicação.

## 4. Responsabilidade sobre dados de processos (LGPD)

Autos judiciais podem conter dados pessoais e dados sensíveis de partes, testemunhas e
terceiros, inclusive sob segredo de justiça. **Você** decide quais peças enviar e a qual
provedor — cabe a você observar as normas do seu tribunal, a Lei Geral de Proteção de
Dados (Lei nº 13.709/2018) e eventuais sigilos, na condição de usuário/controlador do
tratamento que iniciar. A extensão exibe avisos sobre isso na configuração e na página
de ajuda.

## 5. Armazenamento, segurança e retenção

- Todos os dados persistentes (chaves e preferências) ficam no `chrome.storage.local`
  do seu navegador. Caches de sessão (uploads, peças baixadas) vivem na memória da aba
  ou no `chrome.storage.session` e desaparecem ao fechar o navegador.
- **Rascunhos de minuta** também ficam no `chrome.storage.local` — é a única
  funcionalidade que grava **trecho dos autos** de forma persistente no disco (para você
  reabrir a minuta depois). São podados sozinhos após 7 dias e limitados aos 10 mais
  recentes; **Descartar**, no editor, apaga na hora. Não sincronizam entre dispositivos.
  Ao gerar o `.docx` ou imprimir a partir do editor, o arquivo resultante é salvo por
  **você**, onde você escolher, e deixa de estar sob controle da extensão.
- A única exceção são os **prompts salvos**, gravados no `chrome.storage.sync` para
  acompanharem você em outros dispositivos: quem os replica é o próprio Chrome, pela
  sincronização da sua conta Google. Sem conta ou com a sincronização desligada, eles
  ficam apenas neste navegador. Não coloque dados sigilosos dos autos no texto de um
  prompt salvo — a biblioteca serve para instruções genéricas e reutilizáveis.
- As chaves de API vivem apenas no *service worker* da extensão e **nunca são expostas
  ao contexto da página** do PJe.
- Toda comunicação usa HTTPS.
- **Exclusão**: desinstalar a extensão apaga todos os dados locais. As chaves também
  podem ser apagadas a qualquer momento na tela de opções. Arquivos na Files API da
  Anthropic e da OpenAI são geridos pela sua respectiva conta; os da File API do Google
  expiram em 48 h.

## 6. Alterações desta política

Mudanças nas práticas de tratamento de dados serão refletidas neste documento (com nova
data no topo) e divulgadas nas notas de versão da extensão antes de entrarem em vigor.

## 7. Contato

Dúvidas, solicitações de acesso ou exclusão de dados:

- **E-mail**: marcosmarf27@gmail.com
- **Issues**: <https://github.com/marcosmarf27/pje-ia/issues>
