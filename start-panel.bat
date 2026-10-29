@echo off
title ALP Panel
color 0A
echo.
echo ============================================
echo   ALP Panel - Starting...
echo ============================================
echo.

:: Check cloudflared exists
if not exist "tools\cloudflared.exe" (
    echo [ERROR] cloudflared.exe not found.
    echo Please run setup-tunnel.bat first!
    echo.
    pause
    exit /b 1
)

:: Check node is available
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js first.
    pause
    exit /b 1
)

:: Install dependencies if node_modules missing
if not exist "node_modules" (
    echo [INFO] Installing dependencies...
    npm install
    echo.
)

echo [1/2] Starting ALP Panel server on port 3000...
start "ALP Server" /min cmd /c "node server.js & pause"

:: Wait for server to be ready
echo [INFO] Waiting for server to start...
timeout /t 3 /nobreak > nul

echo [2/2] Starting Cloudflare Quick Tunnel...
echo.
echo ============================================
echo   YOUR PANEL URL WILL APPEAR BELOW
echo   Look for: https://xxxx.trycloudflare.com
echo   Copy it and open it in your browser
echo ============================================
echo.

tools\cloudflared.exe tunnel --url http://localhost:3000

echo.
echo [INFO] Tunnel closed.
pause
