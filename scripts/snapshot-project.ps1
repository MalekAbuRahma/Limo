# Creates a standalone copy (code + database). Run from SAVE-SNAPSHOT.bat
param([string]$Destination = "")

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$CarrentRoot = Split-Path -Parent (Split-Path -Parent $ProjectRoot)
$Stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$DefaultName = "vip-limousine-cars-saved-$Stamp"

if ([string]::IsNullOrWhiteSpace($Destination)) {
  $Destination = Join-Path $CarrentRoot $DefaultName
}

Write-Host ""
Write-Host "  Save standalone copy"
Write-Host "  ===================="
Write-Host "  From: $ProjectRoot"
Write-Host "  To:   $Destination"
Write-Host ""

if (Test-Path $Destination) {
  Write-Host "  ERROR: Destination already exists." -ForegroundColor Red
  exit 1
}

New-Item -ItemType Directory -Path $Destination | Out-Null

$robolog = Join-Path $env:TEMP "honda-snapshot-robocopy.log"
$null = robocopy $ProjectRoot $Destination /E /XD node_modules dist dist-ssr .git /XF *.log /NFL /NDL /NJH /NJS /nc /ns /np
if ($LASTEXITCODE -ge 8) {
  Write-Host "  ERROR: robocopy failed. See $robolog" -ForegroundColor Red
  exit 1
}

$dataDest = Join-Path $Destination "data"
if (-not (Test-Path $dataDest)) {
  New-Item -ItemType Directory -Path $dataDest | Out-Null
}

$dbSrc = Join-Path $ProjectRoot "data\taxi.db"
$dbDest = Join-Path $dataDest "taxi.db"
if (Test-Path $dbSrc) {
  Copy-Item $dbSrc $dbDest -Force
  Write-Host "  Database copied: data\taxi.db" -ForegroundColor Green
} else {
  Write-Host "  Note: No data\taxi.db yet." -ForegroundColor Yellow
}

$when = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$meta = "VIP limousine CARS Monthly Tracker`r`nSaved: $when`r`nSource: $ProjectRoot`r`n`r`nRun: npm install then START-VIP-limousine-CARS.bat`r`nSee PROJECT-STANDALONE.md`r`n"
[System.IO.File]::WriteAllText((Join-Path $Destination "SNAPSHOT.txt"), $meta)

Write-Host ""
Write-Host "  Done." -ForegroundColor Green
Write-Host "  Folder: $Destination"
Write-Host ""
