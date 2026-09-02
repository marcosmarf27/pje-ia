# Modelo de NER — procedência, contrato e como refazer

Este diretório guarda os arquivos **pequenos** do modelo de reconhecimento de
entidades usado pela anonimização local. O `model.onnx` **não** é versionado —
ver "Por que o `.onnx` fica fora", abaixo — e o `.gitignore` o exclui junto com
qualquer `*.onnx_data`.

## O modelo

| campo | valor |
|---|---|
| repositório | `pierreguillou/ner-bert-base-cased-pt-lenerbr` |
| base | `neuralmind/bert-base-portuguese-cased` (BERTimbau base) |
| tarefa | `BertForTokenClassification`, 13 rótulos BIO do **LeNER-Br** |
| arquitetura | 12 camadas, hidden 768, 12 cabeças, vocab 29.794 |
| revisão fixada | `4ca0a39767b49788a93b59b632b19f614d12e26c` |
| formato embarcado | **INT8 dinamico**, quantizado a partir do FP32 exportado |
| SHA-256 do `model.onnx` | `a7a68d3e71736754c4a408f6b31d51663ed78f680b4391a3566067c9a1bfdeba` |
| tamanho embarcado | 109.166.704 bytes (65 MB comprimidos no ZIP) |
| SHA-256 do FP32 (insumo) | `f1e111f6315f130a635b0756000c913c3835140f6a22509a481e3db71101d292` (433.629.049 bytes) |

Rótulos (`config.json`, `id2label`): `O`, `B/I-ORGANIZACAO`, `B/I-PESSOA`,
`B/I-TEMPO`, `B/I-LOCAL`, `B/I-LEGISLACAO`, `B/I-JURISPRUDENCIA`.
Três deles são **preservados** e não mascarados (`TEMPO`, `LEGISLACAO`,
`JURISPRUDENCIA`) — a razão está em `POLITICA_PADRAO`, em `src/anonimizar.js`:
prazo é o eixo do produto e "art. 5º da CF" é a fundamentação.

## Como a identidade foi estabelecida

Não por memória nem pelo nome do diretório — por **impressão digital**, com três
evidências que se sustentam sozinhas:

1. `tokenizer_config.json` traz `special_tokens_map_file` apontando para
   `models--neuralmind--bert-base-portuguese-cased/snapshots/94d69c95…`. É a
   **base**, não a large — o que descarta o irmão
   `ner-bert-large-cased-pt-lenerbr`.
2. `config.json` declara `hidden_size: 768` e `num_hidden_layers: 12`. A variante
   large tem 1024 e 24. (Confirmado contra a large de fato: ela está no cache
   local do HuggingFace desta máquina e mede 1024/24.)
3. `vocab.txt` é **byte a byte idêntico** ao do repositório remoto na revisão
   fixada (209.528 bytes) — conferido por download direto.

E o fechamento, feito contra o próprio repositório: o `config.json` embarcado
difere do remoto em **exatamente dois campos**, `_name_or_path` e
`transformers_version` (4.23.1 aqui, 4.15.0 lá); o `tokenizer_config.json`
difere em **exatamente dois**, ambos caminhos de máquina (`name_or_path` e
`special_tokens_map_file`). **`id2label`, `vocab_size` e toda a arquitetura são
idênticos**, e os cinco campos que `conferirConfig` lê também. Ou seja: os
arquivos daqui SÃO os do modelo canônico, re-salvos por outra versão do
`transformers` em outra máquina — não são de um fork.

Armadilha catalogada, para quem for procurar um ONNX pronto:
**`kallebysantos/ner-bert-large-cased-pt-lenerbr-onnx` está mal nomeado** — o
`config.json` dele é 768/12, isto é, é o **base**. Confiar no nome levaria a
embarcar um modelo diferente do que se pensa estar embarcando.

## O contrato que o código valida em runtime

Os arquivos pequenos deste diretório **não são documentação, são contrato**, e é
por isso que continuam versionados:

- `Tokenizador.conferirConfig(tokenizer_config.json)` **lança** se o modelo pedir
  `do_lower_case` ou remoção de acento. O tokenizador embarcado
  (`src/tokenizador.js`) foi escrito para um modelo **cased e com acento**, e
  tokenizar diferente do treino desloca o rótulo previsto — num anonimizador, o
  efeito de um rótulo deslocado é **um nome que não foi mascarado**.
  A armadilha específica: `strip_accents` tem default `null`, que significa
  "siga o `do_lower_case`". Ler o `null` como `false` sem olhar o outro campo é
  exatamente o erro que a função existe para impedir.
- `ner-worker.js` confere `vocab.size === config.vocab_size` (29.794) e a
  presença das entradas `input_ids`/`attention_mask` na sessão ONNX — os nomes
  variam com a versão do exportador, e alimentar a mais ou a menos dá erro de
  runtime.
- `ANON.conferirPolitica(POLITICA_PADRAO, config.id2label)` **lança** se o modelo
  devolver um rótulo que a política não conhece. Um modelo novo com uma classe a
  mais vira recusa explícita, nunca um mapa silenciosamente incompleto.

## Por que o `.onnx` fica fora do repositório

O `model.onnx` em FP32 tem ~433 MB e o GitHub **recusa blob acima de 100 MB**.
`vendor/**` é versionado sem LFS (`.gitattributes`), então commitá-lo faz o
`git push` falhar depois de tudo pronto. Ele é **insumo de build, não fonte**: o
repositório guarda a revisão fixada, o SHA-256 e o comando de exportação; quem
empacota confere o hash antes de compactar.

## Como refazer a exportação

```
pip install "optimum[exporters]" onnx
optimum-cli export onnx \
  --model pierreguillou/ner-bert-base-cased-pt-lenerbr \
  --task token-classification \
  --revision <REVISÃO FIXADA> \
  vendor/ner-modelo/
```

**A exportação não é aceita sem conferência contra o PyTorch.** `exportar.py`
roda os dois sobre as mesmas entradas aleatórias em quatro formas — incluindo
lote 3, comprimento 510 (o teto útil da janela) e `attention_mask` com padding
real — e RECUSA acima de 1e-3. Medido nesta exportação: **pior diferença
absoluta 5,114e-05**.

```
# PowerShell (o mesmo que o empacotar.ps1 usa):
Get-FileHash vendor/ner-modelo/model.onnx -Algorithm SHA256
node --check src/tokenizador.js
```

E rodar a bateria do scratchpad: o tokenizador embarcado é conferido contra a
implementação Rust do HuggingFace (`tokenizers`), ids **e** offsets, e não contra
asserções escritas à mão — escritor conferido pelo próprio escritor não prova
nada, a mesma regra que fez o `ZipW` ser validado pelo `zipfile` do Python e o QR
do PIX pelo `jsQR`.

## Por que INT8, e por que a medicao decidiu

O FP32 sao 434 MB e **nao comprimem** (93% do tamanho no ZIP): o pacote
publicado saltaria de 13,9 MB para ~416 MB. E o Chrome baixa toda atualizacao de
extensao para a base inteira — a v0.45–0.46 teve sete versoes em dois dias —,
entao um recurso que so parte dos usuarios liga custaria isso a **todos**, a cada
release.

O INT8 dinamico (`quantize_dynamic`, `QuantType.QInt8`) foi medido, nao suposto:

| | FP32 | INT8 |
|---|---|---|
| tamanho | 433,6 MB | 109,2 MB (4,0x menor) |
| comprimido no ZIP | 402 MB (93%) | 65 MB (60%) |
| inferencia, janela de 384 tokens | 1192 ms | 916 ms (23% mais rapido) |
| entidades achadas nos 4 textos | 71/71 | **71/71, identicas** |

**O criterio de aceitacao MUDA com a quantizacao, e isso e o ponto.** Contra o
PyTorch, o FP32 tinha de bater em 5e-05. O INT8 nao bate e nao precisa: os
logits diferem em **todos** os 3.614 valores medidos, com diferenca maxima de
2,85 — e mesmo assim o argmax nao muda de lado em lugar nenhum. A pergunta certa
deixou de ser "os logits sao iguais?" e passou a ser "as mesmas entidades saem?",
que e o que `t-ponta-a-ponta.mjs` responde. Ao trocar de modelo ou de esquema de
quantizacao, **regravar os logits e rodar aquele teste** — comparar logits nao
diz nada aqui.

O FP32 continua sendo o insumo: e dele que a quantizacao sai, e e ele que foi
conferido contra o PyTorch. Guarde-o fora do repositorio; o hash esta na tabela.

## O modelo foi exercitado de verdade

Com o `.onnx` em mãos, a cadeia inteira foi rodada sobre texto jurídico
(tokenização → janela → lote → logits → agregação por palavra → BIO → offset de
caractere → máscara → trava → reidentificação), com os **logits reais** do
modelo em vez de um motor falso. O que isso mostrou:

- A decodificação **por subtoken** parte nome próprio em pedaços de uma letra
  (`'J'`, `'O'`, `'A'`, `'O CARLOS PEREIRA'`). A agregação **por palavra** do
  `ner-nucleo.js` os remonta: `JOAO CARLOS PEREIRA` sai num span só. É a
  demonstração de por que aquela função existe.
- A política preserva o que tem de preservar: `art. 155 do Código Penal`
  (LEGISLACAO), `12 de março de 2024` (TEMPO) e `Fortaleza` (LOCAL) atravessam
  intactos.
- O span do regex vence o do modelo por união onde deve: o modelo fragmentou
  `OAB`, `/`, `CE` em três ORGANIZACAO e o resultado final foi um `[OAB_1]`.

## Limitação conhecida da deny list

Ela casa o **valor inteiro normalizado**, e as formas que aparecem nos autos
carregam qualificador: `"Ministério Público"` está na lista e é negado, mas
`"Ministério Público do Estado do Ceará"` — que é o que o modelo devolve — não
casa e **é mascarado**. Idem `"vara unica"` contra `"Vara Única de Ocara"`.
O erro é na direção segura (mascara demais), mas contraria o que a lista existe
para fazer: um `[ORGANIZACAO_1]` no lugar do MP não protege ninguém e piora a
leitura do documento. Alargar o casamento (prefixo com fronteira de palavra é o
candidato) mexe no envelope de segurança e é decisão a tomar com medição, não
de passagem.
