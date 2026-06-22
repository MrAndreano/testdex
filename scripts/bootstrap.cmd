@echo off
setlocal
cd /d "%~dp0.."

echo === TestDex bootstrap ===

where node >nul 2>&1
if errorlevel 1 (
    echo Node.js not found. Install Node.js 20+ from https://nodejs.org/
    exit /b 1
)

echo Node:
node -v

if not exist ".env" (
    copy /Y ".env.example" ".env" >nul
    echo Created .env from .env.example — fill WALLET_MNEMONIC and ENDPOINT_KEY
)

copy /Y ".env" "contracts\.env" >nul
copy /Y ".env" "pton\.env" >nul

call npm install
if errorlevel 1 exit /b 1

if not exist "contracts\node_modules" (
    mklink /J "contracts\node_modules" "%CD%\node_modules" >nul
)
if not exist "pton\node_modules" (
    mklink /J "pton\node_modules" "%CD%\node_modules" >nul
)

call npm run build -w contracts
if errorlevel 1 exit /b 1

call npm run build -w pton
if errorlevel 1 exit /b 1

echo.
echo Bootstrap complete.
echo Next steps:
echo   1. Edit .env (mnemonic + toncenter API key)
echo   2. Get testnet TON: https://t.me/testgiver_ton_bot
echo   3. npm run deploy:router
echo   4. npm run deploy:pton
echo   5. npm run deploy:tokens
echo   6. npm run deploy:liquidity
echo   7. npm run export:config
echo   8. npm run dev

endlocal
