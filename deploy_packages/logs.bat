@echo off
setlocal
cd /d "%~dp0"
:: Tail logs from all services. Pass a service name to tail just one:
::   logs.bat backend       (or postgres, frontend)
if "%~1"=="" (
    docker compose logs -f --tail 200
) else (
    docker compose logs -f --tail 200 %~1
)
endlocal
