$jdkHome = Get-ChildItem -LiteralPath 'tools\jdk-21' -Directory | Select-Object -First 1 -ExpandProperty FullName
if (-not $jdkHome) {
  throw 'JDK 21 introuvable dans tools/jdk-21. Lance la preparation locale 2B-A.'
}

$env:JAVA_HOME = $jdkHome
$env:Path = "$jdkHome\bin;$env:Path"
npx firebase emulators:exec --project athar-local --only auth,firestore,functions "powershell -ExecutionPolicy Bypass -File scripts/run-playwright-emulator.ps1"
exit $LASTEXITCODE
