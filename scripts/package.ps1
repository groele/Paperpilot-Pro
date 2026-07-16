param(
  [string]$OutputDir = "dist"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root "manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $manifest.version
$packageName = "paperpilot-pro-$version.zip"
$dist = Join-Path $root $OutputDir
$outFile = Join-Path $dist $packageName

if (!(Test-Path -LiteralPath $dist)) {
  New-Item -ItemType Directory -Path $dist | Out-Null
}
if (Test-Path -LiteralPath $outFile) {
  Remove-Item -LiteralPath $outFile
}

$items = @(
  "manifest.json",
  "background",
  "content",
  "core",
  "lib",
  "popup",
  "icons",
  "README.md"
)

$temp = Join-Path $env:TEMP ("paperpilot-package-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
  foreach ($item in $items) {
    $src = Join-Path $root $item
    if (Test-Path -LiteralPath $src) {
      Copy-Item -LiteralPath $src -Destination $temp -Recurse
    }
  }
  Compress-Archive -Path (Join-Path $temp "*") -DestinationPath $outFile
  Write-Host "Created $outFile"
} finally {
  if (Test-Path -LiteralPath $temp) {
    Remove-Item -LiteralPath $temp -Recurse -Force
  }
}
