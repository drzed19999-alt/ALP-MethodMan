@echo off
title Stopping ALP Panel
echo.
echo Stopping ALP Panel...
echo.

:: Kill node server
taskkill /f /im node.exe >nul 2>&1
echo [OK] Node server stopped.

:: Kill cloudflared
taskkill /f /im cloudflared.exe >nul 2>&1
echo [OK] Cloudflare tunnel stopped.

echo.
echo Panel is fully stopped.
timeout /t 2 /nobreak > nul
