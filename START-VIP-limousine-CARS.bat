@echo off
chcp 65001 >nul 2>&1
title VIP limousine CARS - Running
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

if not exist ".env" (
  if exist ".env.example" copy /Y ".env.example" ".env" >nul
)

echo.
echo  ============================================
echo    VIP limousine CARS - Monthly Tracker
echo  ============================================
echo.
echo    Database: PostgreSQL (see .env DATABASE_URL)
echo    App: http://localhost:3000/  (API :3001)
echo.
echo    First time: docker compose up -d
echo    Migrate old data: npm run db:migrate
echo    Admin setup: SETUP-ADMIN.bat
echo.
echo    TO CLOSE: STOP-VIP-limousine-CARS.bat
echo  ============================================
echo.

echo  Stopping old servers on ports 3000-3005...
call npm run stop >nul 2>&1
ping -n 2 127.0.0.1 >nul

echo  Starting API server (port 3001)...
start "VIP limousine CARS API" /MIN cmd /c "cd /d "%~dp0" && npx tsx server\index.js"
ping -n 5 127.0.0.1 >nul

start /B cmd /c "ping -n 6 127.0.0.1 >nul && start http://localhost:3000/"

node node_modules\vite\bin\vite.js --host --port 3000

echo.
echo  Server stopped.
pause
