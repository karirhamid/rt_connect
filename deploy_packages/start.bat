@echo off
:: ============================================================================
:: RT Connect — Build and start all services
:: Requires: Docker Desktop installed and running
:: ============================================================================
setlocal

set "HERE=%~dp0"

if not exist "%HERE%.env" (
    echo.
    echo [ERROR] .env not found in %HERE%
    echo.
    echo  Copy .env.example to .env and edit it first:
    echo     copy .env.example .env
    echo     notepad .env
    echo.
    exit /b 1
)

:: Verify Docker is reachable
docker version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running. Start Docker Desktop first.
    exit /b 1
)

echo.
echo ========================================
echo   RT Connect — Starting services
echo ========================================
echo.

cd /d "%HERE%"
docker compose up -d --build
if errorlevel 1 (
    echo [ERROR] docker compose failed
    exit /b 1
)

echo.
echo ========================================
echo   Stack is up
echo ========================================
echo.
echo   View logs    : logs.bat
echo   Stop         : stop.bat
echo   Backup DB    : backup.bat
echo.
echo   Open the app at the HTTP_PORT defined in .env
echo   (default: http://SERVER_IP)
echo.
endlocal
