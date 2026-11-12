# Jan Saathi AI — One-Click Full-Stack Startup Script
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " Jan Saathi AI — Telemedicine Platform Starting" -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Cyan

$root = $PSScriptRoot
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"

Write-Host "1. Launching Backend Server on port 8000..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$backendDir'; `$env:PYTHONPATH='$backendDir'; & '.\venv\Scripts\python.exe' main.py"

Start-Sleep -Seconds 3

Write-Host "2. Launching Frontend Web Client on port 5173..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$frontendDir'; npm run dev"

Start-Sleep -Seconds 2

Write-Host "`n✅ Jan Saathi AI Platform is running!" -ForegroundColor Green
Write-Host " - Patient & Public Portal:  http://localhost:5173" -ForegroundColor White
Write-Host " - Doctor / Staff Login:     http://localhost:5173/doctor/login" -ForegroundColor White
Write-Host " - Admin Management:        http://localhost:5173/admin" -ForegroundColor White
Write-Host " - Backend API & Docs:      http://127.0.0.1:8000/docs" -ForegroundColor White

