$nodeMajor = & node -p "process.versions.node.split('.')[0]"
if ($LASTEXITCODE -ne 0) {
  throw 'Node.js est introuvable.'
}

if ($nodeMajor -ne '22') {
  $portableNode = Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '..\tools\node-22.23.2') -Recurse -Filter node.exe -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
  if (-not $portableNode) {
    throw 'Node 22 est requis. Lancez npm run prepare:node22, puis réessayez.'
  }
  $env:Path = "$(Split-Path -Parent $portableNode);$env:Path"
}

& node (Join-Path $PSScriptRoot 'assert-node22.mjs')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
