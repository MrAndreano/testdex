@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0.."

echo.
echo ========================================
echo   TestDex - YOUR CHECKLIST (3 steps)
echo ========================================
echo.
echo [1] Fill C:\Project\TestDex\.env
echo     WALLET_MNEMONIC=24 words (testnet wallet only!)
echo     ENDPOINT_KEY=from @toncenter
echo.
echo [2] Get testnet TON for that wallet
echo     https://t.me/testgiver_ton_bot
echo.
echo [3] Run deploy (auto, no Enter prompts):
echo     scripts\user-deploy.cmd
echo.
echo After deploy - test swaps in Tonkeeper (testnet).
echo GitHub Pages: create repo dexpages, push C:\Project\dexpages
echo.
pause
