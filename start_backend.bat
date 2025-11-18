@echo off
echo ========================================
echo Starting ZKTeco Device Management API
echo ========================================
echo.

cd /d "%~dp0backend"

REM Check if virtual environment exists
if not exist "..\venv\Scripts\python.exe" (
    echo Error: Virtual environment not found!
    echo Please run: python -m venv venv
    echo Then run: venv\Scripts\pip install -r backend\requirements.txt
    pause
    exit /b 1
)

echo Starting FastAPI server...
echo API will be available at: http://localhost:8000
echo API Documentation: http://localhost:8000/docs
echo.
echo Press CTRL+C to stop the server
echo ========================================
echo.

REM Run the FastAPI application
"..\venv\Scripts\python.exe" main.py
