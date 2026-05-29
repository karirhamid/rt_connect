@echo off
REM Stop the RT Connect dev backend by freeing whatever holds port 8000.
REM Pair with start-backend.bat.

powershell -NoProfile -Command "$p=(Get-NetTCPConnection -LocalPort 8000 -State Listen -EA SilentlyContinue).OwningProcess; if($p){Stop-Process -Id $p -Force; Write-Host ('stopped PID ' + $p)}else{Write-Host 'nothing listening on 8000'}"
