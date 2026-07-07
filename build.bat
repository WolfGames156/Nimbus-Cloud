@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js gerekli: https://nodejs.org
  pause
  exit /b 1
)
npm install
npm run build
pause
