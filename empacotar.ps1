# Empacota a extensão para a Chrome Web Store.
# Uso: pwsh ./empacotar.ps1  →  gera tecjustica-pje-v<versão>.zip na raiz (ignorado pelo git).
# O ZIP contém APENAS o que a extensão precisa em runtime: manifest.json, src/, icons/, vendor/.

$ErrorActionPreference = "Stop"
$raiz = $PSScriptRoot

$manifest = Get-Content (Join-Path $raiz "manifest.json") -Raw | ConvertFrom-Json
$versao = $manifest.version
$zip = Join-Path $raiz "tecjustica-pje-v$versao.zip"

# Valida a sintaxe dos scripts antes de empacotar (não há build step)
Get-ChildItem (Join-Path $raiz "src\*.js") | ForEach-Object {
  node --check $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "Erro de sintaxe em $($_.Name) — pacote NÃO gerado." }
}

# O modelo de NER (anonimizacao local) NAO e versionado -- 433 MB passam do teto
# de 100 MB por blob do GitHub, e vendor/** nao usa LFS. Ele e insumo de build, e
# quem garante que o insumo e o CERTO e este bloco: sem ele, empacotar numa
# maquina onde o arquivo esta faltando gera um ZIP que instala e falha so quando
# o usuario liga o modo sigiloso -- e empacotar com um .onnx de OUTRA exportacao
# embarca um modelo diferente do que a PROCEDENCIA.md afirma.
#
# O hash esperado e lido de vendor/ner-modelo/PROCEDENCIA.md, nunca copiado para
# ca: duas fontes para a mesma verdade divergem quando alguem mexe num lado so.
$modelo = Join-Path $raiz "vendor/ner-modelo/model.onnx"
$procedencia = Join-Path $raiz "vendor/ner-modelo/PROCEDENCIA.md"
if (-not (Test-Path $procedencia)) { throw "vendor/ner-modelo/PROCEDENCIA.md nao existe - sem ele nao ha hash a conferir." }
# O padrao exige `model.onnx` NA MESMA LINHA: a PROCEDENCIA.md declara DOIS
# hashes (o do INT8 que vai no pacote e o do FP32 que e insumo da
# quantizacao), e um padrao so de 'SHA-256' pegaria o errado.
$linha = Select-String -Path $procedencia -Pattern 'model\.onnx.*`([0-9a-f]{64})`' | Select-Object -First 1
if (-not $linha) { throw "PROCEDENCIA.md nao declara o SHA-256 do model.onnx - pacote NAO gerado." }
$esperado = $linha.Matches[0].Groups[1].Value
if (-not (Test-Path $modelo)) {
  throw "vendor/ner-modelo/model.onnx nao esta aqui (ele fica FORA do git). Exporte-o antes de empacotar - o procedimento esta em vendor/ner-modelo/PROCEDENCIA.md."
}
$obtido = (Get-FileHash $modelo -Algorithm SHA256).Hash.ToLower()
if ($obtido -ne $esperado) {
  throw "o model.onnx nao e o que a PROCEDENCIA.md declara.`n  esperado: $esperado`n  obtido  : $obtido`nPacote NAO gerado."
}
Write-Host "✔ model.onnx confere com a PROCEDENCIA.md ($([math]::Round((Get-Item $modelo).Length/1MB)) MB)" -ForegroundColor Green

$staging = Join-Path ([System.IO.Path]::GetTempPath()) "tecjustica-pje-pack-$versao"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging | Out-Null

Copy-Item (Join-Path $raiz "manifest.json") $staging
Copy-Item (Join-Path $raiz "src") (Join-Path $staging "src") -Recurse
Copy-Item (Join-Path $raiz "icons") (Join-Path $staging "icons") -Recurse
# vendor/: d3+markmap (mapa), Jodit+docx (editor), pdf.js+ORT+PP-OCRv6 (extração),
# fontes (painel) e o modelo de NER (anonimização) — este último conferido acima.
Copy-Item (Join-Path $raiz "vendor") (Join-Path $staging "vendor") -Recurse

if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $zip
Remove-Item $staging -Recurse -Force

# Cópia com nome FIXO, para o release. O botão "⬇️ Baixar a extensão" do
# README aponta para .../releases/latest/download/pje-ia.zip — um endereço que
# só continua valendo se o asset tiver sempre o mesmo nome. Enquanto o release
# levava apenas o zip versionado, esse link respondia 404: quem chegava pelo
# GitHub não conseguia baixar a extensão, e nada na página dizia o porquê.
# Anexe OS DOIS ao release (`gh release create <tag> tecjustica-pje-v*.zip pje-ia.zip`).
$fixo = Join-Path $raiz "pje-ia.zip"
if (Test-Path $fixo) { Remove-Item $fixo -Force }
Copy-Item $zip $fixo

$tam = "{0:N0} KB" -f ((Get-Item $zip).Length / 1KB)
Write-Host "✔ Pacote gerado: $zip ($tam)" -ForegroundColor Green
Write-Host "  Cópia para o release: $fixo (nome fixo — é o link do README)"
Write-Host "  Envie o versionado na aba 'Pacote' do painel do desenvolvedor da Chrome Web Store."
