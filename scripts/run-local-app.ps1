node scripts/seed-playwright-emulator.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$env:VITE_FIREBASE_API_KEY = 'local-api-key'
$env:VITE_FIREBASE_AUTH_DOMAIN = 'localhost'
$env:VITE_FIREBASE_PROJECT_ID = 'athar-local'
$env:VITE_FIREBASE_APP_ID = '1:1234567890:web:athar-local'
$env:VITE_USE_FIREBASE_EMULATORS = 'true'
$env:VITE_WORKSPACE_ID = 'main'

npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npx vite preview --host 127.0.0.1 --port 5174 --strictPort
exit $LASTEXITCODE
