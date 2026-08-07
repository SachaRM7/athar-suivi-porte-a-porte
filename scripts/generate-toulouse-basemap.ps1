param(
  [switch]$Force,
  [string]$JavaHome = $env:JAVA_HOME,
  [string]$MavenCommand = 'mvn'
)

$ErrorActionPreference = 'Stop'

# Enlarge this single envelope later for Occitanie or France; do not edit the build pipeline.
$West = 1.20
$South = 43.48
$East = 1.62
$North = 43.76
$Bounds = "$West,$South,$East,$North"
$MinZoom = 8
$MaxZoom = 16

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$WorkRoot = Join-Path $ProjectRoot '.athar-local\basemap'
$Sources = Join-Path $WorkRoot 'sources'
$BasemapsRevision = '2697f293a5554e5789500eb5cd2ddd3b0f688dda'
$BasemapsRepository = 'https://github.com/protomaps/basemaps.git'
# Geofabrik distributes the former Midi-Pyrenees extract; the build clips it to
# the Toulouse envelope above, which contains Haute-Garonne and its first ring.
$GeofabrikSource = 'https://download.geofabrik.de/europe/france/midi-pyrenees-latest.osm.pbf'
$Input = Join-Path $Sources 'midi-pyrenees-latest.osm.pbf'
$Output = Join-Path $ProjectRoot 'public\fixtures\toulouse.pmtiles'
$StagingOutput = Join-Path (Split-Path -Parent $Output) 'toulouse.next.pmtiles'
$BasemapsDirectory = Join-Path $WorkRoot 'protomaps-basemaps'
$TilesDirectory = Join-Path $BasemapsDirectory 'tiles'

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name est requis. Installez Java 21+ et Maven, puis relancez ce script."
  }
}

function Ensure-NaturalEarth([string]$Destination) {
  if (Test-Path $Destination) { return }
  $answer = Invoke-RestMethod -Headers @{ accept = 'application/dns-json' } -Uri 'https://cloudflare-dns.com/dns-query?name=naciscdn.org&type=A'
  $address = $answer.Answer | Where-Object { $_.type -eq 1 } | Select-Object -First 1 -ExpandProperty data
  if (-not $address) { throw 'Resolution DNS de naciscdn.org impossible.' }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
  curl.exe --fail --location --retry 3 --resolve "naciscdn.org:443:$address" --output $Destination 'https://naciscdn.org/naturalearth/packages/natural_earth_vector.gpkg.zip'
}

if ($JavaHome) {
  $java = Join-Path $JavaHome 'bin\java.exe'
  if (-not (Test-Path $java)) { throw "JAVA_HOME ne contient pas bin\\java.exe : $JavaHome" }
  $env:PATH = "$(Split-Path $java);$env:PATH"
}

Require-Command 'java'
Require-Command $MavenCommand
New-Item -ItemType Directory -Force -Path $Sources | Out-Null

if (-not (Test-Path $Input)) {
  Write-Host "Telechargement Geofabrik Haute-Garonne..."
  curl.exe --fail --location --retry 3 --output $Input $GeofabrikSource
}

if (-not (Test-Path $BasemapsDirectory)) {
  git clone $BasemapsRepository $BasemapsDirectory
}
git -C $BasemapsDirectory fetch --depth 1 origin $BasemapsRevision
git -C $BasemapsDirectory checkout --detach $BasemapsRevision
Ensure-NaturalEarth (Join-Path $TilesDirectory 'data\sources\natural_earth_vector.gpkg.zip')

Push-Location $TilesDirectory
try {
  & $MavenCommand clean package -DskipTests
  $jar = Get-ChildItem 'target\*-with-deps.jar' | Select-Object -First 1 -ExpandProperty FullName
  if (-not $jar) { throw 'Le JAR Protomaps n a pas ete produit.' }
  if ((Test-Path $Output) -and -not $Force) { throw "Le fond existe deja : $Output. Relancez avec -Force." }
  Remove-Item -LiteralPath $StagingOutput -Force -ErrorAction SilentlyContinue
  Write-Host "Generation PMTiles $Bounds, zoom $MinZoom-$MaxZoom..."
  & java -Xmx3g -jar $jar --download --osm-path=$Input --bounds=$Bounds --minzoom=$MinZoom --maxzoom=$MaxZoom --output=$StagingOutput --force
} finally {
  Pop-Location
}

if (-not (Test-Path $StagingOutput) -or (Get-Item $StagingOutput).Length -lt 1MB) {
  throw 'Le PMTiles produit est absent ou anormalement petit.'
}
Move-Item -LiteralPath $StagingOutput -Destination $Output -Force

Write-Host "Fond offline pret : $Output ($([math]::Round((Get-Item $Output).Length / 1MB, 1)) Mo)"
