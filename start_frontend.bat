@echo off
echo ========================================
echo Starting ZKTeco Frontend (React)
echo ========================================
echo.

cd /d "%~dp0frontend"

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo Error: Failed to install dependencies
        echo Please ensure Node.js is installed
        pause
        exit /b 1
    )
)

echo Starting React development server...
echo Frontend will be available at: http://localhost:5173
echo.
echo Press CTRL+C to stop the server
echo ========================================
echo.

call npm run dev
