@echo off
echo ========================================
echo ZKTeco Device Management System
echo Full Stack Startup
echo ========================================
echo.
echo Starting Backend API and Frontend...
echo.

cd /d "%~dp0"

REM Start backend in new window
echo [1/2] Starting Backend API...
start "ZKTeco Backend API" cmd /k "start_backend.bat"

REM Wait a bit for backend to start
timeout /t 3 /nobreak >nul

REM Start frontend in new window
echo [2/2] Starting Frontend...
start "ZKTeco Frontend" cmd /k "start_frontend.bat"

echo.
echo ========================================
echo Startup Complete!
echo ========================================
echo.
echo Backend API: http://localhost:8000
echo API Docs: http://localhost:8000/docs
echo Frontend: http://localhost:5173
echo.
echo Both servers are running in separate windows
echo Close the windows to stop the servers
echo ========================================

