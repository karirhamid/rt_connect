@echo off
:: ============================================================================
:: RT Connect — Extract the local Caddy CA certificate.
:: Give the resulting rtconnect-ca.crt to every client computer that needs to
:: trust the LAN HTTPS site (no more "not secure" warnings).
:: ============================================================================
setlocal
cd /d "%~dp0"

set "OUT=rtconnect-ca.crt"

docker compose ps --status running | findstr /c:"rtconnect-proxy" >nul
if errorlevel 1 (
    echo [ERROR] The Caddy container is not running. Run start.bat first.
    exit /b 1
)

echo Extracting CA certificate from Caddy...
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt "%OUT%"
if errorlevel 1 (
    echo [ERROR] Could not extract CA cert.
    exit /b 1
)

echo.
echo Saved: %CD%\%OUT%
echo.
echo INSTALL ON CLIENT COMPUTERS
echo   Windows : double-click %OUT% then Install Certificate
echo             - Local Machine
echo             - Place in: Trusted Root Certification Authorities
echo   macOS   : open %OUT% in Keychain Access (System keychain)
echo             - Set "Always Trust" for SSL
echo   Android : Settings - Security - Install from storage
echo.
echo After installing, restart the browser. The padlock will turn green.
endlocal
