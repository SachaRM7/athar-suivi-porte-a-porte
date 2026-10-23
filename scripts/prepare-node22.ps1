$ErrorActionPreference = 'Stop'

$version = 'v22.23.4'
$archiveName = "node-$version-win-x64.zip"
$expectedSha256 = 'cbc74b5e0982c9dbb41525fd8fb5dcd32fbee237863f7829072f4639a1ce5f20'
$toolsRoot = Join-Path $PSScriptRoot '..\tools'
$installRoot = Join-Path $toolsRoot 'node-22.23.4'
$archivePath = Join-Path $toolsRoot $archiveName
$existingNode = Get-ChildItem -LiteralPath $installRoot -Recurse -Filter node.exe -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty FullName

if ($existingNode) {
  & $existingNode (Join-Path $PSScriptRoot 'assert-node22.mjs')
  exit $LASTEXITCODE
}
if (Test-Path -LiteralPath $installRoot) {
  throw "Installation Node 22 incomplète : $installRoot"
}

Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$version/$archiveName" -OutFile $archivePath
$actualSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
if ($actualSha256 -ne $expectedSha256) {
  throw "Archive Node 22 invalide (SHA-256 $actualSha256)."
}

New-Item -ItemType Directory -Path $installRoot | Out-Null
Expand-Archive -LiteralPath $archivePath -DestinationPath $installRoot
$portableNode = Get-ChildItem -LiteralPath $installRoot -Recurse -Filter node.exe |
  Select-Object -First 1 -ExpandProperty FullName
if (-not $portableNode) { throw 'node.exe manque après extraction.' }

& $portableNode (Join-Path $PSScriptRoot 'assert-node22.mjs')
exit $LASTEXITCODE
