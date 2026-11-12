# Jan Saathi AI — Administrator Account Provisioning CLI
$backendDir = Join-Path $PSScriptRoot "backend"
Set-Location $backendDir

$pythonExe = Join-Path $backendDir "venv\Scripts\python.exe"
$env:PYTHONPATH = $backendDir

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " Jan Saathi AI — Administrator Management CLI" -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Cyan

& $pythonExe -m app.cli

