#Requires -Version 5.1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
$Source = Join-Path (Split-Path -Parent $Root) "TestDex\config\testnet.json"

if (-not (Test-Path $Source)) {
    Write-Host "Not found: $Source" -ForegroundColor Red
    Write-Host "Deploy contracts in TestDex first, then run export:config" -ForegroundColor Yellow
    exit 1
}

Copy-Item $Source (Join-Path $Root "public\testnet.json") -Force
Write-Host "Synced public/testnet.json from TestDex" -ForegroundColor Green
Get-Content (Join-Path $Root "public\testnet.json") | Write-Host
