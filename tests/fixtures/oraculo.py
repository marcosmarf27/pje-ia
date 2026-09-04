# -*- coding: utf-8 -*-
# Oraculo independente: a implementacao Rust de referencia do WordPiece do BERT.
# Emite ids, tokens e offsets para o comparador em node conferir o tokenizador.js.
import json, unicodedata, io, sys
from tokenizers import BertWordPieceTokenizer

VOCAB = r"C:/extensao_pje/vendor/ner-modelo/vocab.txt"

# Contrato do tokenizer_config.json do modelo: cased, sem remocao de acento.
tok = BertWordPieceTokenizer(
    vocab=VOCAB, lowercase=False, strip_accents=False,
    clean_text=True, handle_chinese_chars=True, wordpieces_prefix="##",
)

CASOS = [
    "",
    "Maria da Silva",
    "MARIA DA SILVA, CPF 123.456.789-09",
    "Jose Antonio Goncalves",
    "Jos\u00e9 Ant\u00f4nio Gon\u00e7alves",
    "Excelent\u00edssimo Senhor Doutor Juiz de Direito da Vara \u00danica",
    "JO\u00adÃO DA SILVA",                    # soft hyphen DENTRO da palavra
    "Ma\u0000ria",                            # nulo (removido pela limpeza)
    "Ma\ufffdria",                            # replacement char (removido)
    "Maria\n\tSilva",                         # espaco em branco variado
    "Av. Brasil, 62755-000",
    "jo\u00e3o@exemplo.com.br",               # e-mail com acento
    "A" * 101,                                # estoura max_input_chars_per_word
    "A" * 100,                                # exatamente no teto
    "\U000103be teste astral",                # plano astral (par UTF-16)
    "A\u00e7\u00e3o \U0001f642 penal",        # emoji
    "\u4e2d\u6587 teste",                     # CJK
    "R$ 1.234,56 \u2014 art. 5\u00ba da CF/88",
    "OAB/CE 12.345",
    "Processo n\u00ba 0001234-56.2020.8.06.0128",
    "PETI\u00c7\u00c3O INICIAL \u2013 autor: ANA MARIA",
    "Ana-Maria dos Santos",
    "\ufb01lipe",                             # ligadura tipografica
    "  espacos   colapsados  ",
    "contesta\u00e7\u00e3o de m\u00e9rito, fls. 30/45",
]

# NFD: o acento vem como code point SEPARADO. So o paraCanonico compoe -- sem
# ele o fluxo de tokens muda, que e o "erro de acento" de que o guia avisa.
CASOS += [
    "José Antônio",
    "MARIA JOSÉ DA CONCEIÇÃO",
    "ação penal, fls. 12",
]

saida = []
for c in CASOS:
    # A MESMA entrada dos dois lados: o pipeline real chama paraCanonico (NFC)
    # uma vez, na entrada. O normalizador Rust nao faz NFC, entao normalizamos
    # aqui para comparar o mesmo texto.
    canon = unicodedata.normalize("NFC", c)
    enc = tok.encode(canon, add_special_tokens=False)
    saida.append({
        "bruto": c,
        "texto": canon,
        "ids": enc.ids,
        "tokens": enc.tokens,
        "offsets": [list(o) for o in enc.offsets],
    })

with io.open(sys.argv[1], "w", encoding="utf-8") as f:
    json.dump(saida, f, ensure_ascii=False)
print("casos:", len(saida))
