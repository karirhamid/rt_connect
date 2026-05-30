@echo off
REM Manually stop backend + frontend (free ports 8000 and 5173).
REM Normally unnecessary — closing the start window already stops them —
REM but handy if a server was launched some other way.
powershell -NoProfile -Command ^
  "foreach ($port in 8000,5173) {" ^
  "  $ids = (Get-NetTCPConnection -LocalPort $port -State Listen -EA SilentlyContinue).OwningProcess | Select-Object -Unique;" ^
  "  if ($ids) { $ids | ForEach-Object { try { Stop-Process -Id $_ -Force } catch {} }; Write-Host ('stopped port ' + $port) }" ^
  "  else { Write-Host ('nothing on port ' + $port) } }"
