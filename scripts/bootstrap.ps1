#Requires -Version 5.1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=== TestDex bootstrap ===" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js not found. Install Node.js 20+ from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

Write-Host "Node: $(node -v)" -ForegroundColor Green

if (-not (Test-Path "$Root\.env")) {
    Copy-Item "$Root\.env.example" "$Root\.env"
    Write-Host "Created .env from .env.example — fill WALLET_MNEMONIC and ENDPOINT_KEY" -ForegroundColor Yellow
}

Copy-Item "$Root\.env" "$Root\contracts\.env" -Force
Copy-Item "$Root\.env" "$Root\pton\.env" -Force

Set-Location $Root
npm install
npm run build -w contracts
npm run build -w pton

Write-Host ""
Write-Host "Bootstrap complete." -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Edit .env (mnemonic + toncenter API key)"
Write-Host "  2. Get testnet TON: https://t.me/testgiver_ton_bot"
Write-Host "  3. npm run deploy:router"
Write-Host "  4. npm run deploy:pton"
Write-Host "  5. npm run deploy:tokens"
Write-Host "  6. npm run deploy:liquidity"
Write-Host "  7. npm run export:config"
Write-Host "  8. npm run dev"
