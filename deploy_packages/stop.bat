@echo off
setlocal
cd /d "%~dp0"
echo Stopping RT Connect services...
docker compose down
echo Stopped.
endlocal
