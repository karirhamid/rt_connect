@echo off
:: ============================================================================
:: RT Connect — PostgreSQL backup (gzipped) into ./backups/
:: ============================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

if not exist "backups" mkdir "backups"

:: Read DB credentials from .env
for /f "usebackq tokens=1,2 delims==" %%a in (`findstr /b "DB_NAME DB_USER" .env`) do (
    if "%%a"=="DB_NAME" set "DB_NAME=%%b"
    if "%%a"=="DB_USER" set "DB_USER=%%b"
)

set "STAMP=%DATE:~-4%%DATE:~3,2%%DATE:~0,2%_%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%"
set "STAMP=%STAMP: =0%"
set "OUT=backups\%DB_NAME%_%STAMP%.sql.gz"

echo Backing up %DB_NAME% to %OUT% ...
docker compose exec -T postgres pg_dump -U %DB_USER% %DB_NAME% | docker run --rm -i alpine sh -c "gzip" > "%OUT%"
if errorlevel 1 (
    echo [ERROR] backup failed
    exit /b 1
)
echo Done: %OUT%
endlocal
