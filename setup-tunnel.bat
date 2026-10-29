@echo off
title ALP Panel Setup - Downloading cloudflared
echo.
echo ============================================
echo   ALP Panel - Cloudflare Tunnel Setup
echo ============================================
echo.
echo Downloading cloudflared.exe...
echo.

if not exist "tools" mkdir tools

powershell -Command "& { Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'tools\cloudflared.exe' -UseBasicParsing }"

if exist "tools\cloudflared.exe" (
    echo.
    echo [OK] cloudflared.exe downloaded successfully!
    echo.
    echo You can now run: start-panel.bat
) else (
    echo.
    echo [ERROR] Download failed. Check your internet connection.
)
echo.
pause
