@echo off
:: ============================================================================
:: RT Connect — Restore PostgreSQL from a backup file
:: Usage: restore.bat backups\rtzkconnect_db_20260501_140000.sql.gz
:: ============================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

if "%~1"=="" (
    echo Usage: restore.bat path\to\backup.sql.gz
    exit /b 1
)
set "INPUT=%~1"
if not exist "%INPUT%" (
    echo [ERROR] file not found: %INPUT%
    exit /b 1
)

for /f "usebackq tokens=1,2 delims==" %%a in (`findstr /b "DB_NAME DB_USER" .env`) do (
    if "%%a"=="DB_NAME" set "DB_NAME=%%b"
    if "%%a"=="DB_USER" set "DB_USER=%%b"
)

echo This will REPLACE the current database "%DB_NAME%".
set /p "CONFIRM=Type 'yes' to continue: "
if /i not "!CONFIRM!"=="yes" (
    echo Aborted.
    exit /b 0
)

echo Dropping and recreating database...
docker compose exec -T postgres psql -U %DB_USER% -d postgres -c "DROP DATABASE IF EXISTS %DB_NAME%;"
docker compose exec -T postgres psql -U %DB_USER% -d postgres -c "CREATE DATABASE %DB_NAME% OWNER %DB_USER%;"

echo Restoring from %INPUT% ...
:: gunzip the file via a throwaway alpine container, then pipe to psql
docker run --rm -i -v "%CD%:/in" alpine sh -c "gunzip -c /in/%INPUT%" | docker compose exec -T postgres psql -U %DB_USER% -d %DB_NAME%

echo Restarting backend...
docker compose restart backend
echo Done.
endlocal
