# -*- coding: utf-8 -*-
"""Roda o modelo ONNX DE VERDADE sobre texto juridico e grava os logits, para o
decodificador em JS ser exercitado com a saida real em vez de um motor falso.

Fecha a ultima lacuna da cadeia: tokenizacao -> janela -> layout do lote ->
indexacao dos logits -> BIO -> offset de caractere. Um erro em qualquer um
desses elos e silencioso, e o sintoma e um nome que nao foi mascarado.

Os nomes, CPFs e enderecos abaixo sao FICTICIOS.
"""
import io, json, os, sys
import numpy as np
import onnxruntime as ort
from tokenizers import BertWordPieceTokenizer

AQUI = os.path.dirname(os.path.abspath(__file__))
MOD = r"C:/extensao_pje/vendor/ner-modelo"

TEXTOS = [
    "Trata-se de acao penal proposta pelo Ministerio Publico do Estado do Ceara "
    "em face de JOAO CARLOS PEREIRA, brasileiro, solteiro, residente na Rua das "
    "Flores, 120, Fortaleza, pela pratica do crime previsto no art. 155 do Codigo "
    "Penal. A vitima, Maria Aparecida de Souza, reconheceu o acusado em juizo.",

    "Vistos. Homologo o acordo celebrado entre BANCO EXEMPLO S.A. e Ana Beatriz "
    "Lima, representada pelo advogado Ricardo Mendes Filho, OAB/CE 12.345. "
    "Publique-se. Fortaleza, 12 de marco de 2024. Carlos Alberto Nogueira, Juiz "
    "de Direito da Vara Unica de Ocara.",

    "A testemunha Elioneudo Evaristo dos Santos afirmou que estava na residencia "
    "de Fernanda Oliveira quando ouviu os disparos. O laudo pericial do Instituto "
    "de Criminalistica confirmou a versao apresentada pela defesa.",

    # COM ACENTO -- o caso comum, e ate aqui a cadeia inteira so tinha visto
    # texto sem acento. O modelo e cased e treinado em portugues de verdade.
    "Cuiás. Defiro o pedido formulado por MARIA DA CONCEIÇÃO ARAÚJO, "
    "assistida pela Defensoria Pública, e determino a intimação de "
    "José Antônio Gonçalves para, no prazo de 15 dias, apresentar "
    "contestação. Cumpra-se. Juíza de Direito Ana Lúcia Barroso.",
]

tok = BertWordPieceTokenizer(
    vocab=os.path.join(MOD, "vocab.txt"), lowercase=False, strip_accents=False,
    clean_text=True, handle_chinese_chars=True, wordpieces_prefix="##",
)
cfg = json.load(io.open(os.path.join(MOD, "config.json"), encoding="utf-8"))
rotulos = [None] * len(cfg["id2label"])
for k, v in cfg["id2label"].items():
    rotulos[int(k)] = v

# argv[1] = caminho do modelo (permite comparar FP32 x INT8); argv[2] = saida
MODELO = sys.argv[1] if len(sys.argv) > 1 else os.path.join(MOD, "model.onnx")
SAIDA_JSON = sys.argv[2] if len(sys.argv) > 2 else os.path.join(AQUI, "logits-reais.json")
print("modelo:", os.path.basename(MODELO))
sess = ort.InferenceSession(MODELO, providers=["CPUExecutionProvider"])

saida = []
for texto in TEXTOS:
    enc = tok.encode(texto, add_special_tokens=True)   # [CLS] ... [SEP]
    ids = np.array([enc.ids], dtype=np.int64)
    mask = np.ones_like(ids)
    tipos = np.zeros_like(ids)
    logits = sess.run(["logits"], {"input_ids": ids, "attention_mask": mask,
                                   "token_type_ids": tipos})[0][0]   # [L, 13]

    # Referencia INDEPENDENTE: decodificacao BIO simples, por SUBTOKEN, feita
    # aqui. Nao e a mesma politica do JS (que decide por PALAVRA), entao ela nao
    # serve como igualdade byte a byte -- serve para dizer QUAIS entidades o
    # modelo viu, que e o que o teste do JS precisa reencontrar.
    ref, atual = [], None
    for i in range(1, len(enc.ids) - 1):                # pula [CLS] e [SEP]
        j = int(np.argmax(logits[i]))
        r = rotulos[j]
        ini, fim = enc.offsets[i]
        if r == "O":
            if atual: ref.append(atual); atual = None
            continue
        pref, _, tipo = r.partition("-")
        if atual and atual["tipo"] == tipo and pref == "I":
            atual["fim"] = fim
        else:
            if atual: ref.append(atual)
            atual = {"tipo": tipo, "ini": ini, "fim": fim}
    if atual: ref.append(atual)

    saida.append({
        "texto": texto,
        "ids": [int(x) for x in enc.ids],
        "logits": [[float(x) for x in linha] for linha in logits],
        "referencia": [{"tipo": e["tipo"], "trecho": texto[e["ini"]:e["fim"]]} for e in ref],
    })
    print("--", texto[:55], "...")
    for e in ref:
        print("     %-14s %s" % (e["tipo"], repr(texto[e["ini"]:e["fim"]])))

with io.open(SAIDA_JSON, "w", encoding="utf-8") as f:
    json.dump(saida, f, ensure_ascii=False)
print("\ngravado logits-reais.json (%d textos)" % len(saida))
