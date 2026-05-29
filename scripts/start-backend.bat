@echo off
REM ==========================================================================
REM Start the RT Connect dev backend detached.
REM
REM - Uses the venv at .\venv (where fastapi & deps actually live).
REM - If something is already listening on 8000, kill it first (lets you
REM   double-click this file as your "fresh restart" shortcut).
REM - Launches python in a hidden window so it survives this console closing.
REM - Logs to %LOCALAPPDATA%\rt_connect_backend.log so you can tail later.
REM
REM Usage: double-click in Explorer, or `scripts\start-backend.bat` from cmd.
REM ==========================================================================
setlocal

REM Resolve repo root from this script's location
set "REPO=%~dp0.."
pushd "%REPO%" >NUL

REM Pick the venv python — fallback to PATH only if venv is missing
set "PYEXE=%REPO%\venv\Scripts\python.exe"
if not exist "%PYEXE%" set "PYEXE=python"

REM Kill anything on port 8000 (your previous backend, if any)
powershell -NoProfile -Command "$p=(Get-NetTCPConnection -LocalPort 8000 -State Listen -EA SilentlyContinue).OwningProcess; if($p){Stop-Process -Id $p -Force; Write-Host ('killed PID ' + $p)}else{Write-Host 'port 8000 free'}"

REM Launch detached + hidden, with stdout/stderr captured
set "LOGFILE=%LOCALAPPDATA%\rt_connect_backend.log"
powershell -NoProfile -Command ^
  "$d=Get-Date -Format 'yyyy-MM-dd HH:mm:ss';" ^
  "\"=== $d start ===\" | Out-File -Append -Encoding utf8 '%LOGFILE%';" ^
  "Start-Process -FilePath '%PYEXE%' " ^
                "-ArgumentList 'backend-api\main.py' " ^
                "-WorkingDirectory '%REPO%' " ^
                "-WindowStyle Hidden " ^
                "-RedirectStandardOutput '%LOGFILE%' " ^
                "-RedirectStandardError '%LOGFILE%.err'"

echo.
echo Backend launching in the background using: %PYEXE%
echo Log file: %LOGFILE%
echo.
echo Wait ~5s then open http://localhost:8000/health to verify.
echo To stop it:        scripts\stop-backend.bat
echo To tail the log:   scripts\tail-backend.bat
echo.
timeout /t 4 >NUL
popd >NUL
endlocal
