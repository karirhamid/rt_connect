@echo off
:: ============================================================================
:: RT Connect — Refresh source from the parent project into the build contexts
:: Run this whenever you change the backend or frontend code.
:: ============================================================================
setlocal enabledelayedexpansion

set "HERE=%~dp0"
set "ROOT=%HERE%.."
set "BACKEND_SRC=%ROOT%\backend-api"
set "FRONTEND_SRC=%ROOT%\frontend"
set "BACKEND_DST=%HERE%backend"
set "FRONTEND_DST=%HERE%frontend"

echo.
echo ========================================
echo   RT Connect — Build context refresh
echo ========================================
echo.

if not exist "%BACKEND_SRC%" (
    echo [ERROR] Backend source not found at %BACKEND_SRC%
    exit /b 1
)
if not exist "%FRONTEND_SRC%" (
    echo [ERROR] Frontend source not found at %FRONTEND_SRC%
    exit /b 1
)

echo [1/2] Copying backend source...
:: Wipe previous source files but keep Dockerfile / .dockerignore
for /f "delims=" %%f in ('dir /b /a "%BACKEND_DST%" 2^>nul ^| findstr /v /b /i "Dockerfile .dockerignore"') do (
    if exist "%BACKEND_DST%\%%f\" (
        rmdir /s /q "%BACKEND_DST%\%%f"
    ) else (
        del /q "%BACKEND_DST%\%%f"
    )
)
xcopy /E /I /Q /Y "%BACKEND_SRC%\*" "%BACKEND_DST%\" >nul
:: Strip dev-only artefacts
if exist "%BACKEND_DST%\venv"     rmdir /s /q "%BACKEND_DST%\venv"
if exist "%BACKEND_DST%\.env"     del   /q   "%BACKEND_DST%\.env"
if exist "%BACKEND_DST%\.pytest_cache" rmdir /s /q "%BACKEND_DST%\.pytest_cache"
for /d /r "%BACKEND_DST%" %%d in (__pycache__) do if exist "%%d" rmdir /s /q "%%d"
del /s /q "%BACKEND_DST%\*.pyc" >nul 2>&1
echo [OK]

echo [2/2] Copying frontend source...
for /f "delims=" %%f in ('dir /b /a "%FRONTEND_DST%" 2^>nul ^| findstr /v /b /i "Dockerfile .dockerignore nginx.conf"') do (
    if exist "%FRONTEND_DST%\%%f\" (
        rmdir /s /q "%FRONTEND_DST%\%%f"
    ) else (
        del /q "%FRONTEND_DST%\%%f"
    )
)
xcopy /E /I /Q /Y /EXCLUDE:%HERE%build_exclude.txt "%FRONTEND_SRC%\*" "%FRONTEND_DST%\" >nul 2>&1
if errorlevel 1 (
    :: Fallback if exclude file missing — copy then strip
    xcopy /E /I /Q /Y "%FRONTEND_SRC%\*" "%FRONTEND_DST%\" >nul
)
if exist "%FRONTEND_DST%\node_modules" rmdir /s /q "%FRONTEND_DST%\node_modules"
if exist "%FRONTEND_DST%\dist"         rmdir /s /q "%FRONTEND_DST%\dist"
if exist "%FRONTEND_DST%\.env"         del   /q   "%FRONTEND_DST%\.env"
if exist "%FRONTEND_DST%\.env.production" del /q "%FRONTEND_DST%\.env.production"
echo [OK]

echo.
echo Build context refreshed. Now run: start.bat
echo.
endlocal
