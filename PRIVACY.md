# Política de Privacidade — TecJustiça PJe (Análise de Processos)

**Última atualização: 1º de outubro de 2026**

A extensão **TecJustiça PJe — Análise de Processos** ("a extensão") adiciona um painel de chat
com IA à tela de autos digitais do PJe (Processo Judicial Eletrônico). Esta política
descreve, de forma completa, quais dados a extensão trata, para onde eles vão e o que
**nunca** é feito com eles.

**Resumo em uma frase:** a extensão não coleta telemetria e, no funcionamento padrão, não
passa por servidor nenhum do desenvolvedor — os documentos que você selecionar são enviados
diretamente do seu navegador à API do provedor de IA que você escolheu (Anthropic, Google,
OpenAI ou OpenRouter), autenticados pela **sua própria chave de API**.

**A única exceção é opcional e vem desligada:** a **triagem na conta TecJustiça**
(`pjece.tecjustica.com`, serviço do mesmo desenvolvedor). Ela só funciona depois que **você**
cola nas opções a chave de integração da **sua** conta e autoriza o acesso ao site; a partir
daí, os processos que você mandar à triagem vão para a sua conta — o número do processo e os
dados que o painel do PJe já mostra, **nunca** as peças, as partes ou o teor dos autos. O
processo sigiloso vai com a marca de sigilo, e o modo de sigilo da sua conta decide o que fazer
com ele. Detalhes na seção 3-B.

## 1. Dados tratados e finalidade

| Dado | Finalidade | Para onde vai |
|---|---|---|
| **Peças processuais que você marcar** (PDFs/HTML dos autos) e **suas mensagens de chat** | Análise por IA — uma das duas funções do propósito único da extensão (ver o fim desta seção) | Diretamente à API do provedor escolhido por você: **Anthropic** (`api.anthropic.com`), **Google** (`generativelanguage.googleapis.com`), **OpenAI** (`api.openai.com`) ou **OpenRouter** (`openrouter.ai`). Nos três primeiros nenhum outro serviço intermedia; o OpenRouter é, por definição, um **intermediário** — ver a seção 6. |
| **Chaves de API** (Anthropic, Google, OpenAI e/ou OpenRouter) fornecidas por você | Autenticar as chamadas à API do respectivo provedor | Armazenadas **somente** no `chrome.storage.local` do seu navegador (não sincronizam entre dispositivos). Enviadas exclusivamente ao provedor correspondente, como cabeçalho de autenticação. Nunca chegam ao contexto da página do PJe. |
| **Preferências** (modelo, nível de raciocínio, instruções personalizadas, modo de layout) | Funcionamento da interface | Somente `chrome.storage.local`. As instruções personalizadas são anexadas ao prompt enviado ao provedor escolhido. |
| **Prompts salvos** (título e texto que você escreve na biblioteca de prompts) | Reaproveitar instruções suas nas conversas | `chrome.storage.sync`: ficam no seu navegador e, se você usar o Chrome com uma conta Google e a sincronização ligada, o próprio Chrome os replica nos seus outros dispositivos (o desenvolvedor não tem acesso). O texto do prompt vai ao provedor de IA junto da mensagem quando você o usa. |
| **Rascunhos de minuta** (o texto que o modelo gera ao usar “Minutar” ou “Abrir no editor”, com o que você editar) | Permitir reabrir e continuar a minuta depois, inclusive noutro dia | `chrome.storage.local` — **ficam gravados neste computador**, não sincronizam e não saem dele. São apagados automaticamente após 7 dias (mantidos no máximo os 10 mais recentes); o botão **Descartar**, no editor, remove um rascunho na hora. |
| **Modelos de peças** (as peças-modelo que você cadastra na biblioteca “Modelos”: título, categoria, descrição e texto) | Servir de referência de **forma** ao gerar minutas — o assistente segue a estrutura e o estilo dos seus modelos | `chrome.storage.local` — **ficam gravados neste computador**, não sincronizam e não saem dele. Se você colar uma peça real, ela pode conter dados de **outro** processo; use o botão **excluir** da biblioteca para removê-la a qualquer momento. Ao gerar uma minuta com uma categoria escolhida, os textos das peças-modelo daquela categoria (até um teto) vão ao provedor de IA junto do pedido, com a instrução expressa de aproveitar apenas a forma e a linguagem, nunca os fatos. |
| **Arquivos que você anexa no chat** (o clipe 📎: PDF, Word `.docx`, RTF, TXT e Markdown) | Analisar, junto das peças do processo ou sozinhos, um documento que não está nos autos | Ao provedor de IA que você escolheu, como as peças — e **a nada mais**. **Não são gravados neste computador**: existem apenas na memória da aba enquanto a conversa dura, e some tudo ao clicar em “Nova conversa”, ao remover o anexo no ✕ do chip ou ao fechar a aba. A memória de processos **não os guarda** (ao retomar uma conversa antiga eles não voltam, e a extensão avisa que você pode anexá-los de novo). Os arquivos `.docx` e `.rtf` são lidos **dentro do próprio navegador** — o texto é extraído aqui e só ele é enviado. **Atenção**: um arquivo anexado pode conter dados de outro processo ou de terceiros; vale para ele a mesma responsabilidade da seção 4. |
| **Arquivos `.docx` ou `.rtf` que você importa** para a biblioteca de modelos | Cadastrar peças-modelo sem copiar e colar uma a uma | O arquivo é aberto e lido **dentro do seu próprio navegador** (a extensão descompacta o `.docx`, ou interpreta a marcação do `.rtf`, e extrai o texto localmente): ele **não é enviado a nenhum servidor**, nem ao desenvolvedor, nem ao provedor de IA. Só o texto extraído é gravado, e apenas nas fichas que você confirmar — o que ficar de fora da conferência é descartado ao fechar a tela. A partir daí vale exatamente a regra da linha acima. |
| **Memória de processos** (o texto das peças que você marcou, os dados de cada peça — id, título, nº de páginas, tamanho —, a lista do que estava selecionado e a conversa daquele processo) | Retomar a análise ao reabrir um processo já trabalhado, sem baixar tudo do tribunal de novo | Um banco local (IndexedDB) **da própria extensão**, neste computador. Não sincroniza, não sai daqui e **não guarda os PDFs nem as imagens** das peças — só o texto e as referências. Apagada sozinha após **14 dias** (no máximo 20 processos); o botão **Esquecer este processo**, na faixa do topo da conversa, remove na hora, e desligar “Lembrar dos processos entre sessões” nas opções apaga tudo imediatamente. Junto vai um **resumo irreversível da sua chave de API** (8 dígitos de um hash SHA-256), usado só para detectar que você trocou de chave e invalidar os arquivos enviados na conta anterior — a chave em si nunca é gravada. |
| **Texto extraído das peças** (a saída de “Extrair o texto”, num `.md` único ou num `.zip` com um arquivo por peça) e o **pacote de carta precatória** | Levar o processo para fora da extensão — outra ferramenta, um script, um arquivo de caso; ou montar um envio de malote digital | **A lugar nenhum**: o arquivo é montado dentro do seu navegador e entregue pelo download comum. Nesta operação o único servidor acessado é o **do próprio tribunal**, com a sua sessão. Nada vai ao desenvolvedor nem a provedor de IA. O arquivo resultante é salvo por **você**, onde você escolher, e a partir daí deixa de estar sob controle da extensão. |
| **Reconhecimento de texto (OCR) das páginas digitalizadas** | Ler a folha escaneada, que não tem camada de texto, ao extrair o texto do processo | **A lugar nenhum — o reconhecimento é inteiramente local.** O modelo de OCR (PP-OCRv6) vem dentro do pacote da extensão e roda no seu computador, num documento interno dela (`offscreen`). Nenhuma imagem de página é enviada a serviço de OCR, ao desenvolvedor ou a qualquer provedor de IA. |
| **Sessão do PJe** (cookies do tribunal) | Baixar as peças que você marcar, pelo mesmo mecanismo que o próprio PJe usa | Os cookies são gerenciados pelo navegador e **nunca são lidos, armazenados ou exportados pela extensão** — as requisições ao tribunal usam a sessão já aberta por você, e o conteúdo baixado fica em cache temporário na memória da aba. |
| **Triagem na conta TecJustiça** (opcional, desligada até você conectar a sua conta nas opções) | Mandar os processos que você marcar no lote para a triagem da **sua** conta TecJustiça e mostrar o resultado de volta no lote e no card do painel do PJe | A `pjece.tecjustica.com`, na **sua** conta, autenticado pela chave de integração que você colou. Vai **só o que o painel do PJe já mostra**: número do processo, grau, tarefa (fila) e etiquetas em que ele está, classe, assunto, prioridade, órgão julgador, datas de chegada e do último movimento e os identificadores internos do painel. **Não vão** peças, partes, nem o teor dos autos — quem lê os autos é o servidor, com o cadastro do PJe que você fez nele. **Processo sigiloso vai com a marca de sigilo** do PJe; se ele é lido, bloqueado ou anonimizado quem decide é o modo de sigilo da sua conta no TecJustiça, não a extensão. Com a conta conectada, a extensão também consulta o resultado dos processos que estão na tela (lote e painel), mandando **só os números**. A chave fica no `chrome.storage.local`, só no *service worker*; **Desconectar**, nas opções, a apaga e devolve a permissão de acesso ao site. |
| **Ações em lote** (pôr ou retirar etiqueta e movimentar processos, pelo botão do popup) | Executar no PJe, em vários processos de uma vez, a ação que **você** escolheu e confirmou | As requisições vão **somente ao próprio tribunal**, com a sua sessão — nada vai ao desenvolvedor nem a provedor de IA. Fica gravado **neste computador** (`chrome.storage.local`) um **registro de cada ação**: data, número do processo, etiqueta ou saída escolhida, resultado e o seu perfil no PJe — sem cookie e sem conteúdo dos autos. Apagado sozinho após **30 dias**; o botão **Baixar registro** gera uma planilha, que você salva onde quiser. |

Nenhum dado além dos listados acima é tratado. A coleta limita-se ao estritamente
necessário ao propósito único da extensão — **ser o assistente de trabalho de quem opera
o PJe**: analisar com IA as peças que **você** selecionar; executar no PJe, em lote, as
etiquetas e movimentações que **você** escolher e confirmar; e, se **você** conectar a sua
conta TecJustiça, mandar os processos que escolher para a triagem dela e mostrar o
resultado —, em conformidade com a política de Uso Limitado (*Limited Use*) da Chrome
Web Store.

## 2. O que a extensão NÃO faz

- **Não passa por servidor do desenvolvedor, salvo a triagem que você ligar**: o chat, o
  lote, as exportações e o modo sigiloso não passam por infraestrutura nossa. A única
  exceção é a triagem na conta TecJustiça (seção 3-B), que vem **desligada** e só funciona
  com a chave da **sua** conta.
- **Não coleta telemetria, analytics ou estatísticas de uso** de nenhum tipo.
- **Não vende, aluga ou compartilha dados** com terceiros — o desenvolvedor sequer tem
  acesso a eles.
- **Não lê sua navegação**: o painel só é injetado em telas de autos digitais do PJe
  (páginas `*.jus.br` que contêm a linha do tempo do processo); em qualquer outra
  página `.jus.br` o script termina sem tocar no DOM. O painel de **ações em lote** só é
  montado quando você o pede pelo botão do popup (ou pelo botão "Ações em lote nesta fila" do
  painel), na aba que está na frente. No painel do usuário, alguns tribunais carregam a lista
  de processos de `frontend.prd.cnj.cloud` (o sistema do CNJ que serve o PJe); ali a extensão
  só entra **se você permitir** (o Chrome pergunta quando você pede o botão no popup ou conecta a
  triagem), e só põe esse botão e, com a triagem conectada, a faixa do resultado em cada card — ela lê o
  número do processo, e nunca as partes.
- **Não escreve no PJe por conta própria**: pôr ou retirar etiqueta e movimentar processos
  só acontecem nos processos que você marcou, com a ação que você escolheu e confirmou em dois
  cliques. A extensão nunca faz isso sozinha, e o assistente de IA não tem como acioná-las.
- **Não envia nada automaticamente**: nenhum documento sai do navegador sem uma ação
  explícita sua (marcar peças e enviar uma mensagem). Com a triagem conectada, a consulta
  do **resultado** dos processos na tela é automática, mas leva só os números deles — e
  **mandar** processos à triagem é sempre um gesto seu, confirmado em dois cliques.
- **Não usa serviço externo de OCR**: o reconhecimento das páginas digitalizadas é feito por um
  modelo que acompanha a extensão e roda **no seu computador** — a imagem da folha não sai daqui.
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
- **OpenRouter** — [política de privacidade](https://openrouter.ai/privacy) e
  [termos](https://openrouter.ai/terms). Este é o único provedor que **é um
  intermediário**: ele recebe o pedido e o encaminha à empresa que hospeda o modelo
  escolhido, e é ela quem processa as peças. Duas consequências, e as duas importam num
  processo judicial:
  - **A extensão exige, em TODO envio, que o OpenRouter use apenas fornecedores que não
    retêm os dados para treinamento** (parâmetro `data_collection: "deny"`). Não é uma
    configuração que você precise lembrar de ligar: vai no pedido, sempre. Se nenhum
    fornecedor elegível estiver disponível para o modelo escolhido, o envio **falha** com
    esse aviso — em vez de seguir por um caminho menos protegido.
  - Mesmo assim, **há um intermediário a mais na cadeia** em relação aos outros três, e a
    escolha do fornecedor final é dele. Para material sob segredo de justiça, considere a
    anonimização na origem (ver a seção do TecJustiça Sigilo no guia) ou um dos provedores
    diretos.
  - O OpenRouter **não recebe arquivos por referência** no fluxo de chat: cada mensagem
    reenvia as peças marcadas. Nada fica guardado numa "conta de arquivos" dele — em
    compensação, o mesmo conteúdo trafega a cada pergunta.

Não há nenhum outro terceiro além do provedor de chat que você escolheu (e, no caso do
OpenRouter, do fornecedor que ele acionar para atender o pedido).

A relação contratual com o provedor de IA é **sua** (a chave de API é sua); a extensão é
apenas o cliente técnico dessa comunicação.

## 3-A. Modo sigiloso (anonimização local)

Com o botão **🔒 Sigiloso** ligado no painel, o tratamento muda:

- **As peças deixam de ser enviadas como arquivo.** Elas são lidas no seu
  computador (camada de texto do PDF e, nas páginas digitalizadas, OCR local) e
  o que vai ao provedor de IA é apenas TEXTO com os dados pessoais substituídos
  por rótulos — `[PESSOA_1]`, `[CPF_2]`, `[PROCESSO_1]`. **O PDF não sai da
  máquina**, e nenhum arquivo é enviado à Files API do provedor.
- **O reconhecimento é 100% local.** O modelo de reconhecimento de entidades
  (BERT em português, ~109 MB) vem dentro do pacote da extensão e roda no seu
  navegador. Nenhum serviço externo é consultado para anonimizar.
- **O que é mascarado**: nomes de pessoas e organizações, CPF, CNPJ, RG, OAB,
  número do processo (CNJ), e-mail, telefone, CEP e NIT — nas peças, no título
  de cada peça, na ficha do processo, no inventário, na linha do tempo, nas suas
  instruções personalizadas, na tese que você informa ao minutar, nas peças-modelo
  que você cadastrou e no texto que você digita.
- **O RG é detectado pelo rótulo**, e isso é uma limitação real: ele não tem
  dígito verificador padronizado, e um número solto de 7 a 9 dígitos é
  indistinguível de qualquer outro. "RG 12.345.678-9", "cédula de identidade nº…"
  e "registro geral…" são detectados; um número sem nenhuma dessas âncoras, não —
  salvo quando pertence a uma parte, caso em que os dados da ficha do processo o
  alcançam.
- **O que é PRESERVADO, de propósito**: datas e prazos, legislação e
  jurisprudência. Mascará-los destruiria a utilidade jurídica do documento sem
  proteger ninguém.
- **A tabela que desfaz a anonimização** (qual rótulo corresponde a qual nome)
  é gravada **apenas no seu computador**, no banco local da extensão, por
  processo. Ela nunca é enviada a lugar nenhum e nunca vai para a sincronização
  da conta Google. Apagar a memória de caso nas opções a apaga junto.
- **Barreira final**: antes de qualquer envio, a extensão confere o corpo da
  requisição e **recusa o envio** se algum dos valores originais aparecer nele.
  O bloqueio é do turno inteiro — nada é enviado pela metade. A bolha mostra o
  valor e onde ele estava e pergunta se é um dado pessoal: manter protegido e
  reenviar (a máscara é refeita; o raciocínio guardado do modelo que o carregava
  é descartado) ou liberar — neste processo ou em todos —, além de tirar a peça
  da conversa. Valores liberados "em todos os processos" ficam em
  `chrome.storage.local` (normalizados), nunca em sincronização.

- **Você APROVA antes de sair.** Quando o envio traz peça recém-anonimizada,
  uma caixa mostra o texto exatamente como vai sair, peça por peça, e espera a
  sua aprovação — dá para editar, mascarar à mão ou liberar um valor antes.
  Cancelar não envia nada. A conferência pode ser dispensada nas Configurações
  (e religada lá).

- **Você pode CONFERIR o que saiu.** Clicando no selo `🔒 sigiloso` do painel
  abre-se uma caixa de auditoria com: quanto foi mascarado e de que tipo; cada
  peça enviada, com o **texto exato que o provedor recebeu**; e a tabela que liga
  cada rótulo ao valor original. O botão **Baixar relatório de conferência**
  gera um arquivo `.md` com o que foi substituído e o texto integral que saiu —
  **sem** a tabela de reidentificação, para que o relatório possa ser mostrado a
  terceiros sem revelar ninguém.

**Limites, ditos com honestidade.** Nenhum anonimizador automático é perfeito: o
que escapar da detecção vai INTEIRO para o provedor. A barreira final cobre os
valores que a extensão reconheceu; ela não inventa o que não foi detectado. A
revisão do que sai continua sendo sua — e a caixa de conferência antes do envio
é o momento de fazê-la.

## 3-B. Triagem na conta TecJustiça (opcional)

Nas **Ações em lote** (botão do popup), os processos marcados podem ir para a triagem da sua
conta no **TecJustiça** (`pjece.tecjustica.com`), serviço do mesmo desenvolvedor.

- **Vem desligada.** Nada é enviado até você, nas opções da extensão, colar a **chave de
  integração** da sua conta (criada no site, em *Configuração › Usar no Claude e outros*) e
  clicar em **Conectar**. É nesse clique que o Chrome pede a permissão de acesso ao site —
  quem nunca usar o recurso não recebe essa permissão.
- **O que vai**: o número do processo, o grau, a tarefa e as etiquetas em que ele está no
  painel, a classe, o assunto, a prioridade, o órgão julgador, as datas que o painel mostra e
  os identificadores internos do painel. **Não vão** peças, partes, nem o teor dos autos: o
  servidor lê os autos por conta própria, com o cadastro do PJe que você fez nele — isso é
  regido pelos termos do próprio TecJustiça, não por esta política.
- **Processo sigiloso vai com a marca de sigilo** (`sigiloso: true`), como o PJe o marca. Se ele
  é lido, bloqueado ou anonimizado é decisão do **modo de sigilo da sua conta** no TecJustiça
  (desde 29/09/2026), não da extensão; a tela da extensão diz isso antes de você mandar.
- **A conferência é na extensão.** Antes de mandar, você vê a lista dos processos e escolhe o
  modelo, se quer a minuta do próximo ato e uma observação livre — e a **observação vai junto**
  para o TecJustiça, com a escolha. Ao mandar, a leitura começa na sua conta (enquanto o serviço
  não tiver esse recurso, o lote fica em rascunho e a extensão oferece o botão para começar no
  site). Nenhuma aba abre sozinha.
- **O resultado volta** ao lado de cada processo no lote e no card do painel do PJe. Para
  isso, com a conta conectada, a extensão consulta o site com os **números** dos processos
  que estão na tela, e só enquanto a aba está visível. Só a sua conta vê os seus resultados.
- **Etiqueta no PJe**: gravar a etiqueta sugerida pela triagem é um gesto seu — pelo botão, com
  confirmação, ou marcando **"Pôr a etiqueta no PJe sozinho"** ao mandar os processos (é esse
  clique que autoriza). Com a opção marcada, qualquer aba do PJe do mesmo endereço aberta neste
  navegador grava a etiqueta quando o resultado chega, mesmo com a janela fechada, e cada uma
  fica no registro das ações; vale para todos os processos, sigilosos inclusive, e a autorização
  vence em 48 horas. Para a triagem escolher, vão ao TecJustiça os **nomes das etiquetas da sua
  unidade** (o cadastro do PJe, não as peças). Depois de gravar, a extensão conta ao TecJustiça
  **qual etiqueta ficou no processo** (o nome, se foi posta, se o processo já a tinha ou se não
  gravou, e a hora), para a ficha do site mostrar "Etiqueta posta no PJe em…". A extensão só grava um nome que já existe no
  cadastro ou que está na lista configurada no site (os `TRIAGEM - …` e as etiquetas próprias);
  esses, se a unidade ainda não os tem, o próprio PJe cria ao gravar, e passam a aparecer para
  a unidade. Nome fora dessas listas é recusado.
- **Partes confirmadas no site**: a triagem pode apontar pessoas que faltam no cadastro de
  partes; você confirma cada uma no site, e a ação **"Incluir partes confirmadas"** da janela as
  inclui no PJe — com prévia, dois cliques, uma pessoa por vez e conferência no PJe depois. A
  extensão busca no TecJustiça só as que você confirmou (número, nome, papel) e devolve a ele o
  resultado de cada uma. O **nome de cada pessoa incluída** fica no registro das ações deste
  computador, pelos mesmos 30 dias. Não há desfazer: o PJe não tem como retirar parte por aqui.
- **Onde fica a chave**: no `chrome.storage.local` deste navegador, lida só pelo *service
  worker* da extensão; nunca chega à página do PJe e nunca vai na URL. **Desconectar**, nas
  opções, apaga a chave e devolve a permissão.
- Cada envio fica no **registro das ações em lote** deste computador (data, número do lote
  no TecJustiça, quantidade de processos), pelos mesmos 30 dias.
- **Andamento ao vivo**: com um lote em leitura e a janela ou o card à vista, a extensão mantém
  uma conexão de acompanhamento com o site (a chave vai no cabeçalho, nunca na URL), que traz o
  resultado de cada processo assim que fica pronto. Ela fecha sozinha quando o lote termina ou
  quando nada mais está sendo mostrado. Cada envio leva um identificador aleatório para o
  servidor não criar um lote repetido se o mesmo envio chegar duas vezes.

## 3-C. Assistente do acervo (na janela de ações em lote)

A aba **Assistente** da janela de ações em lote atende pedidos em português ("os processos da
tarefa X com a etiqueta Y") conversando com um modelo de IA pela **sua** chave: a da **OpenAI**, a
do **Google (Gemini)** ou a do **OpenRouter** — o provedor do modelo que você usa no chat, quando
ele serve; senão, o primeiro com chave, nessa ordem. A tela diz qual está em uso.

- **Só age quando você pede, e não grava nada sozinho.** Ele responde com um cartão que lista os
  processos e oferece as ações; pôr ou retirar etiqueta e mandar à triagem acontecem só com o seu
  clique de confirmação no cartão, pelos mesmos caminhos (e o mesmo registro de 30 dias) da aba
  Manual.
- **O que vai ao provedor**: o seu pedido; os **nomes** de **todas** as tarefas (com a quantidade de
  processos) e de **todas** as etiquetas da unidade, lidos ao abrir o assistente, para ele entender
  "a fila de analisar" sem o nome exato;
  quantidades; **números de processos** (os sigilosos inclusive, marcados) e, quando ele olha o que há
  numa fila ou etiqueta, os **dados que o painel do PJe já mostra** de cada um (assunto, classe,
  tarefa, etiquetas, prioridade, data de chegada e último movimento — **nunca as partes**); se uma
  fila anda em lote e as **saídas** dela; e, quando você pergunta por um
  processo, a **lista das peças** (tipo oficial e data), os **movimentos** e — quando você pede
  para ele ler ou analisar o processo — o **TEOR das peças que ele lê** (o texto de peças do
  editor, de PDFs e das folhas digitalizadas, reconhecidas por OCR no seu computador). Esse texto
  contém **nomes, documentos e fatos das partes**, e vai sem anonimização. **Processo sigiloso é
  tratado como qualquer outro** (desde 30/09/2026): o número vai ao modelo, marcado como sigiloso, e
  quando ele consulta ou lê o processo, peças, movimentos e teor vão ao provedor, sem anonimização.
  Na primeira vez em cada processo, a conversa mostra um aviso lembrando a Res. CNJ
  615/2025 (art. 19, §3º, IV), que veda IA privada ou externa em documento sigiloso salvo
  anonimização na origem: a decisão, e a observância da regra do seu tribunal, são suas.
- Na OpenAI o pedido vai com **`store: false`** (ela não guarda a conversa para reuso); no
  OpenRouter, com a mesma recusa de provedores que treinam com os dados usada no chat. Vai direto do
  seu navegador ao provedor, pela página interna da extensão — a chave não passa pela página do
  tribunal.
- A conversa vive só enquanto a janela está aberta; fechar a aba a apaga. O custo aproximado aparece
  embaixo da caixa de escrever.

## 3-D. Leitor dos autos e cores das etiquetas (sem IA)

- O **Leitor dos autos** não usa IA nem envia nada a terceiro: as peças e os movimentos são lidos
  do PJe, pela sua sessão já aberta, e mostrados só no seu computador. O conteúdo das peças é
  desenhado numa página interna da extensão e não fica guardado depois que você fecha o leitor.
- O que o leitor **guarda**, no `chrome.storage.local` do seu navegador: por processo (pelo
  endereço do tribunal, o grau e o número interno do processo), quais peças você marcou como
  **lidas** ou **favoritas** e a página em que parou; e as suas preferências de exibição. Não guarda
  o conteúdo das peças. Fica limitado aos 400 processos mais recentes e a um ano.
- As **cores das etiquetas** são da extensão, não do PJe: ficam no `chrome.storage.local`, junto com
  os **nomes** das etiquetas que o Acervo e o leitor já viram (para a lista das configurações, no
  máximo 500). Nada disso é gravado no PJe nem sai do navegador.

## 4. Responsabilidade sobre dados de processos (LGPD)

Autos judiciais podem conter dados pessoais e dados sensíveis de partes, testemunhas e
terceiros, inclusive sob segredo de justiça. **Você** decide quais peças enviar e a qual
provedor — cabe a você observar as normas do seu tribunal, a Lei Geral de Proteção de
Dados (Lei nº 13.709/2018) e eventuais sigilos, na condição de usuário/controlador do
tratamento que iniciar. A extensão exibe avisos sobre isso na configuração e na página
de ajuda.

Em processo **sob segredo de justiça**, o art. 19, §3º, IV da Resolução CNJ 615/2025 veda
usar solução de IA privada ou externa — como esta — **salvo** anonimização na origem. O
caminho para isso é anonimizar o documento antes de enviá-lo, com uma ferramenta que rode
na sua máquina; a extensão indica o
[TecJustiça Sigilo](https://github.com/marcosmarf27/tecjustica-sigilo), programa separado
e gratuito, e aceita o arquivo anonimizado pelo clipe de anexo. Ele é **de terceiros em
relação a este documento**: não é parte da extensão, não recebe dado nenhum dela e tem a
própria licença e o próprio funcionamento — a política aqui descrita não o alcança.

## 5. Armazenamento, segurança e retenção

- Todos os dados persistentes (chaves e preferências) ficam no `chrome.storage.local`
  do seu navegador. Caches de sessão (uploads, peças baixadas) vivem na memória da aba
  ou no `chrome.storage.session` e desaparecem ao fechar o navegador.
- **Rascunhos de minuta** também ficam no `chrome.storage.local` — é uma das
  funcionalidades que gravam **trecho dos autos** de forma persistente no disco (para você
  reabrir a minuta depois). São podados sozinhos após 7 dias e limitados aos 10 mais
  recentes; **Descartar**, no editor, apaga na hora. Não sincronizam entre dispositivos.
  Ao gerar o `.docx` ou imprimir a partir do editor, o arquivo resultante é salvo por
  **você**, onde você escolher, e deixa de estar sob controle da extensão.
- **Registro das ações em lote** fica no `chrome.storage.local` por 30 dias (no máximo
  5.000 linhas): número do processo, ação, etiqueta ou saída, resultado e o perfil do PJe.
  Não guarda cookie nem conteúdo dos autos, e não sai deste computador.
- **Modelos de peças** (biblioteca “Modelos”) também ficam no `chrome.storage.local`, sem
  poda automática e sem sincronizar. Se você cadastrar uma peça real como modelo, o texto
  pode conter dados de **outro** processo; ele fica só neste navegador e o botão **excluir**
  da biblioteca o remove quando você quiser. Ao gerar uma minuta com uma categoria escolhida,
  os textos das peças-modelo daquela categoria (até um teto de quantidade/tamanho) vão ao
  provedor de IA numa moldura `<modelos_de_referencia>` com a instrução expressa de que
  servem **apenas de forma e linguagem** — nenhum fato dos modelos pode entrar na minuta, que
  se baseia só nas peças do processo em tela.
- **Memória de processos** é a terceira funcionalidade que grava **trecho dos autos** no
  disco, e a única que faz isso **por conta própria** (as duas anteriores gravam o que você
  mandou salvar). Ela vive num **IndexedDB da extensão** — não no banco do site do tribunal
  —, o que significa que só a extensão o enxerga e que limpar os dados do site do PJe não o
  afeta. O que fica gravado: o **texto** das peças de editor (HTML/RTF), os dados de cada
  peça (id, título, páginas, tamanho), a referência do arquivo já enviado ao provedor, a
  conversa daquele processo e a lista do que estava marcado. O que **não** fica: os
  **PDFs** e as **imagens** — eles são o volume dos autos e são rebaixados do tribunal
  quando necessário. Três formas de apagar: o botão **Esquecer este processo** na faixa do
  topo da conversa; desligar **“Lembrar dos processos entre sessões”** nas opções (apaga
  tudo na hora); ou não fazer nada — nada sobrevive a **14 dias**, e só os **20** processos
  mais recentes são mantidos.
- **Arquivos anexados no chat** (o clipe 📎) **não são gravados no disco** — e isso é
  deliberado, não omissão. Eles vivem só na memória da aba: some ao remover o anexo, ao
  clicar em **Nova conversa** ou ao fechar a aba, e a memória de processos os descarta de
  propósito (uma conversa retomada volta sem eles, com aviso na tela). A razão é que, ao
  contrário de uma peça do PJe, um arquivo seu **não tem de onde ser rebaixado** — guardá-lo
  seria a extensão criando uma cópia permanente de um documento que você só quis mostrar
  uma vez. Enquanto a conversa dura, o conteúdo vai ao provedor de IA como as peças (PDF
  por envio de arquivo; `.docx`, `.rtf`, `.txt` e `.md` como texto extraído aqui mesmo).
- **Exportação em `.zip`** (“⬇ Baixar .zip”, abaixo da lista de peças): monta o arquivo
  **dentro do seu navegador** e o entrega pelo download comum — nada trafega para o
  desenvolvedor nem para nenhum provedor de IA nesta operação; o único servidor
  acessado é o **do próprio tribunal**, com a sua sessão, exatamente como quando você
  baixa uma peça clicando nela. O arquivo resultante é salvo por **você**, onde você
  escolher, e a partir daí deixa de estar sob controle da extensão. Note que ele contém
  **as peças integrais** e um índice com a ficha do processo — inclusive **CPF/CNPJ das
  partes e inscrição na OAB dos advogados**, quando a página os exibe. Se o processo
  tramitar em **segredo de justiça**, o `LEIA-ME.md` e o `indice.txt` avisam disso logo
  no topo, mas o cuidado com o arquivo é seu. A extensão **não** pede a permissão
  `downloads` do Chrome: ela não enxerga nem gerencia a sua pasta de downloads.
- **Extração do texto e pacote de carta precatória** seguem exatamente a mesma regra da
  exportação em `.zip` acima: montados no navegador, entregues pelo download comum, sem passar
  por servidor nosso nem por provedor de IA. Duas observações próprias. Primeira: o texto
  extraído das páginas digitalizadas é produzido por um **OCR local** — o modelo vem no pacote
  da extensão e roda num documento interno dela; a imagem da folha **não é enviada a lugar
  nenhum**, e é por isso que a extração funciona até sem conexão com os provedores de IA.
  Segunda: o texto extraído **não entra em nenhum pedido à IA** — o destino dele é o seu disco.
  Como o `.zip` de peças, esses arquivos contêm **os autos**, com os dados pessoais que eles
  trouxerem; o cuidado com o arquivo depois de salvo é seu.
- A única exceção são os **prompts salvos**, gravados no `chrome.storage.sync` para
  acompanharem você em outros dispositivos: quem os replica é o próprio Chrome, pela
  sincronização da sua conta Google. Sem conta ou com a sincronização desligada, eles
  ficam apenas neste navegador. Não coloque dados sigilosos dos autos no texto de um
  prompt salvo — a biblioteca serve para instruções genéricas e reutilizáveis.
- As chaves de API — e a chave de integração do TecJustiça, quando você conecta a triagem —
  vivem apenas no *service worker* da extensão e **nunca são expostas ao contexto da
  página** do PJe.
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
