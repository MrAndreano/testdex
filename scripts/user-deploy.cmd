@echo off
setlocal
cd /d "%~dp0.."

if not exist ".env" (
    echo ERROR: .env missing. Run bootstrap.cmd first, then fill .env
    exit /b 1
)

findstr /C:"word1 word2" .env >nul && (
    echo ERROR: .env still has placeholder mnemonic. Edit .env first.
    exit /b 1
)

copy /Y ".env" "contracts\.env" >nul
copy /Y ".env" "pton\.env" >nul

set TESTDEX_AUTO_CONFIRM=1

echo === TestDex automated deploy (testnet) ===
echo Wallet signs via mnemonic in .env - no Tonkeeper needed for deploy.
echo.

call npm run check:wallet -w contracts
if errorlevel 1 exit /b 1

call npm run deploy:router -w contracts
if errorlevel 1 exit /b 1

call npm run deploy:pton -w pton
if errorlevel 1 exit /b 1

call npm run deploy:tokens -w contracts
if errorlevel 1 exit /b 1

echo Waiting 30 seconds for jetton wallets...
timeout /t 30 /nobreak >nul

call npm run deploy:liquidity -w contracts
if errorlevel 1 exit /b 1

call npm run export:config
if errorlevel 1 exit /b 1

echo.
echo === Deploy DONE ===
echo Config: config\testnet.json
echo UI:     npm run dev
echo Pages:  cd ..\dexpages ^& scripts\sync-config.cmd
echo.

endlocal
