#Requires -Version 5.1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent

if (-not (Test-Path "$Root\.env")) {
    Write-Host ".env missing — run scripts/bootstrap.ps1 first" -ForegroundColor Red
    exit 1
}

Set-Location $Root

Write-Host "=== TestDex testnet deploy ===" -ForegroundColor Cyan
Write-Host "Ensure wallet has >= 5 testnet TON" -ForegroundColor Yellow

npm run deploy:router
npm run deploy:pton
npm run deploy:tokens
Start-Sleep -Seconds 30
npm run deploy:liquidity
npm run export:config

Write-Host ""
Write-Host "Deploy pipeline finished. Start UI: npm run dev" -ForegroundColor Green
