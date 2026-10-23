$nodeSupported = & node -p "(() => { const [major, minor, patch] = process.versions.node.split('.').map(Number); return major === 22 && (minor > 23 || (minor === 23 && patch >= 4)); })()"
if ($LASTEXITCODE -ne 0) {
  throw 'Node.js est introuvable.'
}

if ($nodeSupported -ne 'true') {
  $portableNode = Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '..\tools\node-22.23.4') -Recurse -Filter node.exe -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
  if (-not $portableNode) {
    throw 'Node 22.23.4 minimum est requis. Lancez npm run prepare:node22, puis réessayez.'
  }
  $env:Path = "$(Split-Path -Parent $portableNode);$env:Path"
}

& node (Join-Path $PSScriptRoot 'assert-node22.mjs')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
