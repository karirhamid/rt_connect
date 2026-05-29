@echo off
REM Live-tail the detached backend's log so you can watch it from any console.
REM Ctrl+C to stop tailing — the backend keeps running.

set "LOGFILE=%LOCALAPPDATA%\rt_connect_backend.log"
echo Tailing %LOGFILE%
echo Ctrl+C to stop tailing (backend keeps running).
echo.
powershell -NoProfile -Command "Get-Content -Path '%LOGFILE%' -Wait -Tail 30"
