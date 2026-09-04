// Cliente da memória de caso: a ponte fina entre o content script e o banco que
// vive no service worker (src/casodb.js). Não guarda estado nem decide nada —
// quem sabe O QUE é um caso é o content.js, quem sabe guardá-lo é o casodb.js.
//
// A ponte existe porque o banco NÃO PODE morar aqui: content scripts rodam na
// origem da página, e um indexedDB.open() daqui abriria o banco do tribunal —
// os autos ficariam legíveis pela própria página e sumiriam quando o usuário
// limpasse os dados do site. O motivo completo está no cabeçalho de casodb.js.
//
// Toda função devolve um valor NEUTRO em vez de lançar. A memória de caso é uma
// comodidade: ela pode falhar (worker morto, cota cheia, contexto de extensão
// invalidado por um reload) e nada do que o usuário está fazendo deveria parar
// por causa disso. O caminho de erro é sempre "segue sem memória", nunca "cai o
// turno" — a mesma regra da tolerância a falha de download.
var CASO = (function () {
  // Depois de um reload da extensão, o content script antigo continua na página
  // com um `chrome.runtime` órfão: toda chamada lança "Extension context
  // invalidated". Conferimos o id em vez de deixar estourar dentro do rpc.
  function vivo() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function rpc(msg) {
    return new Promise((resolve) => {
      if (!vivo()) return resolve(null);
      try {
        chrome.runtime.sendMessage(msg, (r) => {
          // Ler o lastError é OBRIGATÓRIO mesmo sem usá-lo: sem isso o Chrome
          // reporta "Unchecked runtime.lastError" no console da página a cada
          // gravação, e o console do usuário é onde o diagnóstico de download
          // acontece (as linhas "[PJe IA] peça …").
          void chrome.runtime.lastError;
          resolve(r || null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  return {
    // Devolve `{caso, desligado}`. `caso` é `{...registro, pecas:[]}` ou null
    // (não há memória deste processo, ou o worker não respondeu). `desligado`
    // distingue o terceiro caso — o usuário desligou a memória nas opções —,
    // que o chamador trata diferente: em vez de só não hidratar, ele para de
    // TENTAR gravar, e cada mudança de seleção deixa de custar uma ida ao
    // worker para ser recusada lá.
    async ler(chave) {
      const r = await rpc({ type: "casoLer", chave });
      return { caso: (r && r.caso) || null, desligado: !!(r && r.desligado) };
    },

    // Mescla `patch` sobre o caso — metadados do PROCESSO (ficha, grid, qual
    // conversa está aberta). O conteúdo de uma sessão de trabalho vai por
    // `salvarConversa`. `{ok:false, cheio:true}` avisa que o disco encheu mesmo
    // depois da poda de emergência: é o único erro que o chamador precisa
    // distinguir, porque a resposta certa a ele é parar de tentar.
    // `baseSigilo` é o `sigilo.rev` que esta aba leu, e só o mapa de sigilo o
    // usa. Passando-o, a gravação daquele campo vira compare-and-swap: se outra
    // aba gravou nesse meio-tempo, a resposta traz `conflitoSigilo` e o que
    // está no disco, em vez de sobrescrever. Omitindo-o, o comportamento é o de
    // sempre — que é o certo para os campos aditivos.
    salvar(chave, patch, baseSigilo) {
      return rpc({ type: "casoSalvar", chave, patch, baseSigilo });
    },

    // Uma conversa inteira, para quando o usuário troca de conversa na lista.
    async lerConversa(chave, convId) {
      const r = await rpc({ type: "convLer", chave, convId });
      return (r && r.conversa) || null;
    },

    // Grava a conversa. `convId` nulo cria uma nova (o id nasce no worker).
    // `base` detecta outra aba trabalhando na MESMA conversa: em vez de
    // sobrescrever, o banco RAMIFICA e devolve `{ramificou:true, convId}` com o
    // id do ramo — nenhum dos dois trabalhos se perde.
    salvarConversa(chave, convId, patch, base) {
      return rpc({ type: "convSalvar", chave, convId, patch, base });
    },

    apagarConversa(chave, convId) {
      return rpc({ type: "convApagar", chave, convId });
    },

    // Lote de peças. Chamado com o que mudou desde a última gravação, nunca com
    // a lista inteira: as peças são o volume do banco.
    pecas(chave, lista) {
      if (!lista || !lista.length) return Promise.resolve(null);
      return rpc({ type: "casoPecas", chave, pecas: lista });
    },

    // Sem `chave`, esquece TUDO. Funciona mesmo com a memória desligada nas
    // opções — é justamente o que alguém que acabou de desligá-la quer fazer.
    esquecer(chave) {
      return rpc({ type: "casoEsquecer", chave: chave || null });
    },

    async listar() {
      const r = await rpc({ type: "casoListar" });
      return (r && r.casos) || [];
    },
  };
})();

// Rodapé de teste: permite exercitar o cliente fora do navegador.
if (typeof module !== "undefined" && module.exports) module.exports = CASO;
