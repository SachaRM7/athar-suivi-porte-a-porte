$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\select-node22.ps1"

$required = @(
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID'
)

foreach ($name in $required) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
    throw "Variable $name manquante pour le build athar-dev31."
  }
}

if ($env:VITE_FIREBASE_PROJECT_ID -ne 'athar-dev31') {
  throw 'Le build cloud exige VITE_FIREBASE_PROJECT_ID=athar-dev31.'
}

if ($env:VITE_USE_FIREBASE_EMULATORS -eq 'true') {
  throw 'Le build cloud refuse VITE_USE_FIREBASE_EMULATORS=true.'
}

$env:VITE_WORKSPACE_ID = 'main'
$env:VITE_BASE_PATH = '/'

npm run build
exit $LASTEXITCODE
