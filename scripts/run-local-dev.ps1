$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\select-node22.ps1"

$jdkHome = Get-ChildItem -LiteralPath 'tools\jdk-21' -Directory | Select-Object -First 1 -ExpandProperty FullName
if (-not $jdkHome) {
  throw 'JDK 21 introuvable dans tools/jdk-21.'
}

$env:JAVA_HOME = $jdkHome
$env:Path = "$jdkHome\bin;$env:Path"

npx firebase emulators:exec --project athar-local --only auth,firestore,functions "powershell -ExecutionPolicy Bypass -File scripts/run-local-app.ps1"
exit $LASTEXITCODE
