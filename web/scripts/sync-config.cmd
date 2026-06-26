@echo off
setlocal
set "SRC=%~dp0..\..\TestDex\config\testnet.json"
set "DST=%~dp0..\public\testnet.json"
if not exist "%SRC%" (
    echo ERROR: TestDex config not found: %SRC%
    echo Run deploy in C:\Project\TestDex first.
    exit /b 1
)
copy /Y "%SRC%" "%DST%" >nul
echo Synced testnet.json to dexpages\public\
endlocal
