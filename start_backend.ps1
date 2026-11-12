# Jan Saathi AI — Start Backend Server
$ErrorActionPreference = "Stop"

$backendDir = Join-Path $PSScriptRoot "backend"
Set-Location $backendDir

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " Jan Saathi AI — Production Healthcare Backend" -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Cyan

$pythonExe = Join-Path $backendDir "venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
    Write-Host "Creating Python virtual environment..." -ForegroundColor Yellow
    python -m venv (Join-Path $backendDir "venv")
    & $pythonExe -m pip install --upgrade pip
    & $pythonExe -m pip install -r (Join-Path $backendDir "requirements.txt")
}

$env:PYTHONPATH = $backendDir
Write-Host "Starting backend at http://127.0.0.1:8000 ..." -ForegroundColor Green
& $pythonExe main.py

