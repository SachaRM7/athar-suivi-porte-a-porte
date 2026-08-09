$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $projectRoot 'public\icons'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

function New-AtharIcon {
  param(
    [Parameter(Mandatory = $true)] [int] $Size,
    [Parameter(Mandatory = $true)] [string] $OutputPath
  )

  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#16324F'))

  $pen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#FCFCFB'), [single]($Size * 0.09))
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

  $graphics.DrawLines($pen, [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new([single]($Size * 0.277), [single]($Size * 0.740)),
    [System.Drawing.PointF]::new([single]($Size * 0.500), [single]($Size * 0.250)),
    [System.Drawing.PointF]::new([single]($Size * 0.723), [single]($Size * 0.740))
  ))
  $graphics.DrawLine(
    $pen,
    [single]($Size * 0.389),
    [single]($Size * 0.578),
    [single]($Size * 0.611),
    [single]($Size * 0.578)
  )

  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $pen.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

New-AtharIcon -Size 180 -OutputPath (Join-Path $outputDirectory 'athar-180.png')
New-AtharIcon -Size 192 -OutputPath (Join-Path $outputDirectory 'athar-192.png')
New-AtharIcon -Size 512 -OutputPath (Join-Path $outputDirectory 'athar-512.png')

Write-Output "Generated Athar PWA icons in $outputDirectory"
