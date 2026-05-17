@echo off
:: ============================================================================
:: RT Connect — one-command update from GitHub (Windows)
:: Runs: git pull -> build.bat -> docker compose up -d --build
:: ============================================================================
setlocal
cd /d "%~dp0"

echo.
echo ============================================================
echo  1. Fetching latest code
echo ============================================================
git -C ".." pull --ff-only || ( echo [ERROR] git pull failed & exit /b 1 )

echo.
echo ============================================================
echo  2. Refreshing build contexts (build.bat)
echo ============================================================
call build.bat || ( echo [ERROR] build.bat failed & exit /b 1 )

echo.
echo ============================================================
echo  3. Building images + recreating containers
echo ============================================================
docker compose up -d --build || ( echo [ERROR] docker compose failed & exit /b 1 )

echo.
echo ============================================================
echo  4. Services
echo ============================================================
docker compose ps

echo.
echo Update complete. Hard-refresh the browser (Ctrl+Shift+R).
endlocal
