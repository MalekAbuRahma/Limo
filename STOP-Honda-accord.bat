@echo off
chcp 65001 >nul 2>&1
title Honda accord - Stop
cd /d "%~dp0"

echo.
echo  Stopping Honda accord app...
echo.

set STOPPED=0

for %%P in (3000 3001 3002 3003 3004 3005) do (
  for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":%%P " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
    if not errorlevel 1 set STOPPED=1
  )
)

if "%STOPPED%"=="1" (
  echo  Done. The app is closed.
) else (
  echo  No running server found on ports 3000-3004.
  echo  If the app is still open, close the black START window.
)

echo.
timeout /t 4
