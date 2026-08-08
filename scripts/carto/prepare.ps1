param(
  [Parameter(Mandatory = $true)][string]$Gpkg,
  [Parameter(Mandatory = $true)][string]$RnbZip,
  [string]$OutputDirectory = 'data/carto-work'
)

$ErrorActionPreference = 'Stop'
$ogr2ogr = Get-ChildItem 'C:\Program Files' -Directory -Filter 'QGIS*' | ForEach-Object { Get-ChildItem $_.FullName -Recurse -Filter ogr2ogr.exe -ErrorAction SilentlyContinue } | Select-Object -First 1 -ExpandProperty FullName
if (-not $ogr2ogr) { throw 'ogr2ogr (GDAL/QGIS) est requis.' }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
& 7z x $RnbZip "-o$OutputDirectory" -y
$where = "(usage_1 IS NULL OR usage_1 NOT IN ('Annexe','Agricole','Industriel','Commercial et services','Sportif','Religieux')) AND (construction_legere IS NULL OR construction_legere = 0)"
& $ogr2ogr -f GeoJSONSeq (Join-Path $OutputDirectory 'batiments_filtres.geojsonl') $Gpkg batiment -t_srs EPSG:4326 -dialect SQLITE -where $where -select 'cleabs,usage_1,nombre_d_etages,nombre_de_logements,hauteur,identifiants_rnb'
