$env:VITE_FIREBASE_API_KEY = 'local-api-key'
$env:VITE_FIREBASE_AUTH_DOMAIN = 'localhost'
$env:VITE_FIREBASE_PROJECT_ID = 'athar-local'
$env:VITE_FIREBASE_APP_ID = '1:1234567890:web:athar-local'
$env:VITE_USE_FIREBASE_EMULATORS = 'true'
$env:VITE_WORKSPACE_ID = 'main'
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
$rng.Dispose()
$env:ATHAR_E2E_BOOTSTRAP_CODE = [System.BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()

node scripts/seed-playwright-emulator.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx playwright test tests/field-sync-emulator.spec.ts tests/onboarding-emulator.spec.ts --grep-invert "desktop dashboard"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Les projections volontairement invalides de la recette admin ne doivent pas
# rendre la fixture terrain illisible. On les injecte uniquement pour ce test.
node scripts/seed-playwright-emulator.mjs --with-regressions
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npx playwright test tests/field-sync-emulator.spec.ts --grep "desktop dashboard"
exit $LASTEXITCODE
