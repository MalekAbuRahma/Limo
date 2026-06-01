@echo off
chcp 65001 >nul 2>&1
title Setup admin user
cd /d "%~dp0"

echo.
echo  ============================================
echo    Create admin:  admin / 1234
echo  ============================================
echo.
echo  1. Edit .env — set DATABASE_URL with your real PostgreSQL password
echo  2. Stop old servers: STOP-VIP-limousine-CARS.bat
echo  3. This script creates the admin user in the database
echo.

call npm run user:ensure-admin
if errorlevel 1 (
  echo.
  echo  If connection failed, fix DATABASE_URL in .env then run again.
  echo  Example: postgresql://postgres:YOUR_PASSWORD@localhost:5432/vip_limousine_cars
  echo.
  pause
  exit /b 1
)

echo  Start the app: START-VIP-limousine-CARS.bat
echo  Login: username admin   password 1234
echo.
pause
