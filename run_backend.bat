@echo off
cd /d d:\JanSaathi_Web\backend
set PYTHONPATH=d:\JanSaathi_Web\backend
venv\Scripts\uvicorn.exe app:app --host 127.0.0.1 --port 8000

