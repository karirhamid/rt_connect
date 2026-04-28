@echo off
:: ============================================================
:: RT Connect — Windows build + package script
:: Run from the project root: build_package.bat
:: Requires: Node.js, npm, PostgreSQL client (pg_dump) in PATH
:: ============================================================
setlocal enabledelayedexpansion

set "PROJECT_ROOT=%~dp0"
set "FRONTEND_DIR=%PROJECT_ROOT%frontend"
set "BACKEND_DIR=%PROJECT_ROOT%backend-api"
set "DIST_DIR=%PROJECT_ROOT%dist"
set "PACKAGE_DIR=%PROJECT_ROOT%rtconnect_package"
set "ZIP_NAME=rtconnect_v2_%date:~-4,4%%date:~-7,2%%date:~0,2%.zip"

:: ── Colors via ANSI (requires Windows 10+) ──────────────────
echo.
echo ========================================
echo   RT Connect — Build Package
echo ========================================
echo.

:: ── Ask for API URL ─────────────────────────────────────────
set /p "API_URL=Server IP or domain for API URL (e.g. 192.168.1.100): "
set "VITE_API_URL=http://!API_URL!"

:: ── Ask whether to dump DB ──────────────────────────────────
set /p "DUMP_DB=Dump local PostgreSQL database? [y/N]: "

if /i "!DUMP_DB!"=="y" (
    set /p "PG_USER=PostgreSQL username [postgres]: "
    if "!PG_USER!"=="" set "PG_USER=postgres"
    set /p "PG_DB=Database name [rtzkconnect_db]: "
    if "!PG_DB!"=="" set "PG_DB=rtzkconnect_db"
    set /p "PG_PASSWORD=PostgreSQL password for !PG_USER! (leave blank if no auth): "
)

echo.
echo [1/4] Building frontend with API URL: !VITE_API_URL!
echo.

:: Write a temporary .env.production
echo VITE_API_URL=!VITE_API_URL! > "%FRONTEND_DIR%\.env.production"

cd /d "%FRONTEND_DIR%"
call npm install --silent
if errorlevel 1 ( echo [ERROR] npm install failed & exit /b 1 )

call npm run build
if errorlevel 1 ( echo [ERROR] Frontend build failed & exit /b 1 )

echo [OK] Frontend built successfully

:: ── Stage package directory ──────────────────────────────────
echo.
echo [2/4] Staging package directory...

if exist "%PACKAGE_DIR%" rmdir /s /q "%PACKAGE_DIR%"
mkdir "%PACKAGE_DIR%"
mkdir "%PACKAGE_DIR%\frontend"
mkdir "%PACKAGE_DIR%\backend"
mkdir "%PACKAGE_DIR%\deploy"

:: Copy built frontend
xcopy /E /I /Q "%FRONTEND_DIR%\dist\*" "%PACKAGE_DIR%\frontend\" >nul

:: Copy backend (exclude dev artefacts)
xcopy /E /I /Q "%BACKEND_DIR%\*" "%PACKAGE_DIR%\backend\" /EXCLUDE:"%PROJECT_ROOT%build_exclude.txt" >nul 2>&1
:: Fallback if exclude file missing
if not exist "%PROJECT_ROOT%build_exclude.txt" (
    xcopy /E /I /Q "%BACKEND_DIR%\*" "%PACKAGE_DIR%\backend\" >nul
)

:: Remove venv and __pycache__ from staged backend
if exist "%PACKAGE_DIR%\backend\venv" rmdir /s /q "%PACKAGE_DIR%\backend\venv"
for /d /r "%PACKAGE_DIR%\backend" %%d in (__pycache__) do (
    if exist "%%d" rmdir /s /q "%%d"
)
:: Remove .pyc files
del /s /q "%PACKAGE_DIR%\backend\*.pyc" >nul 2>&1
:: Remove local .env (install.sh generates it on server)
del /q "%PACKAGE_DIR%\backend\.env" >nul 2>&1

:: Copy deploy scripts
xcopy /E /I /Q "%PROJECT_ROOT%deploy\*" "%PACKAGE_DIR%\deploy\" >nul

echo [OK] Package staged

:: ── Dump database ────────────────────────────────────────────
if /i "!DUMP_DB!"=="y" (
    echo.
    echo [3/4] Dumping database !PG_DB! ...
    set "PGPASSWORD=!PG_PASSWORD!"
    pg_dump -U "!PG_USER!" -h localhost "!PG_DB!" > "%PACKAGE_DIR%\db_dump.sql"
    set "PGPASSWORD="
    if errorlevel 1 (
        echo [WARN] pg_dump failed - continuing without database dump
        del /q "%PACKAGE_DIR%\db_dump.sql" >nul 2>&1
    ) else (
        echo [OK] Database dumped to db_dump.sql
    )
) else (
    echo.
    echo [3/4] Skipping database dump
)

:: ── Create zip archive ───────────────────────────────────────
echo.
echo [4/4] Creating archive !ZIP_NAME! ...

cd /d "%PROJECT_ROOT%"
powershell -NoProfile -Command "Get-ChildItem -Path '%PACKAGE_DIR%' | Compress-Archive -DestinationPath '%PROJECT_ROOT%!ZIP_NAME!' -Force"
if errorlevel 1 ( echo [ERROR] Failed to create zip archive & exit /b 1 )

echo.
echo ========================================
echo   Package ready: !ZIP_NAME!
echo ========================================
echo.
echo   Transfer to your Ubuntu server and run:
echo     sudo bash deploy/install.sh
echo.
echo   To include the DB dump in the restore:
echo     Answer 'y' to the restore prompt in install.sh
echo.

:: Cleanup temp .env.production
del /q "%FRONTEND_DIR%\.env.production" >nul 2>&1

endlocal
pause
