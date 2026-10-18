@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Opening index.html directly.
  start "" "%~dp0index.html"
  pause
  exit /b 0
)

start "Cafe POS Server" /min cmd /k "cd /d ""%~dp0"" && node server.cjs"
timeout /t 2 /nobreak >nul
start "" "http://localhost:5509/"
exit /b 0
