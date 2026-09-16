@echo off
REM ---------------------------------------------------------------
REM  PaperStack - start the Metro dev server
REM
REM  Uses --dev-client (Expo Go can't load this app's native modules)
REM  and port 8082 (8081 is in use on this machine).
REM
REM  Extra flags pass straight through, e.g.:
REM      run.bat -c           clear the Metro cache
REM      run.bat --tunnel     route via Expo's servers (VPN / firewall)
REM ---------------------------------------------------------------

setlocal

cd /d "%~dp0"

REM If Metro advertises an unreachable address (a VMware VMnet or OpenVPN
REM adapter beating your real LAN adapter), uncomment the line below and
REM set it to your actual LAN IP from `ipconfig`.
REM set REACT_NATIVE_PACKAGER_HOSTNAME=192.168.1.138

echo Starting Expo on port 8082 (dev client)...
echo.

call npx expo start --dev-client --port 8082 %*

endlocal

echo.
echo Expo exited.
pause
