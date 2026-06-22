@echo off
setlocal
cd /d "%~dp0.."

if not exist ".env" (
    echo .env missing — run scripts\bootstrap.cmd first
    exit /b 1
)

echo === TestDex testnet deploy ===
echo Ensure wallet has ^>= 5 testnet TON

call npm run deploy:router
if errorlevel 1 exit /b 1

call npm run deploy:pton
if errorlevel 1 exit /b 1

call npm run deploy:tokens
if errorlevel 1 exit /b 1

echo Waiting 30 seconds for jetton wallets...
timeout /t 30 /nobreak >nul

call npm run deploy:liquidity
if errorlevel 1 exit /b 1

call npm run export:config
if errorlevel 1 exit /b 1

echo.
echo Deploy pipeline finished. Start UI: npm run dev

endlocal
