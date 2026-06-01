@echo off
chcp 65001 >nul 2>&1
title Honda accord - Running
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Node.js is not installed.
  echo  Download and install from: https://nodejs.org
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  echo.
  echo  First run: installing packages...
  echo.
  call npm install
  if errorlevel 1 (
    echo  npm install failed.
    pause
    exit /b 1
  )
)

echo.
echo  ============================================
echo    Honda accord - Monthly Tracker
echo  ============================================
echo.
echo    Database: PostgreSQL (see .env.local DATABASE_URL)
echo    App: http://localhost:3000/
echo.
echo    TO CLOSE: STOP-Honda-accord.bat
echo  ============================================
echo.

echo  Starting API server (port 3001)...
start "Honda accord API" /MIN cmd /c "cd /d "%~dp0" && npx tsx server\index.js"
ping -n 4 127.0.0.1 >nul

start /B cmd /c "ping -n 6 127.0.0.1 >nul && start http://localhost:3000/"

node node_modules\vite\bin\vite.js --host --port 3000

echo.
echo  Server stopped.
pause
