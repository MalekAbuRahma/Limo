@echo off
chcp 65001 >nul 2>&1
title Save standalone copy
cd /d "%~dp0"

echo.
echo  Creating a separate saved copy of this system...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\snapshot-project.ps1"
if errorlevel 1 (
  echo.
  echo  Snapshot failed.
  pause
  exit /b 1
)

echo.
pause
