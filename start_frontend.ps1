# Jan Saathi AI — Start Frontend Web Application
$ErrorActionPreference = "Stop"

$frontendDir = Join-Path $PSScriptRoot "frontend"
Set-Location $frontendDir

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " Jan Saathi AI — Frontend Client Portal" -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Cyan

if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    Write-Host "Installing npm dependencies..." -ForegroundColor Yellow
    npm install
}

Write-Host "Starting Vite development server at http://localhost:5173 ..." -ForegroundColor Green
npm run dev

