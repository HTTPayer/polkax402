# Build the X402 Payment Executor smart contract (Windows PowerShell)

$ErrorActionPreference = "Stop"

Write-Host "Building X402 Payment Executor Contract..." -ForegroundColor Cyan

$contractDir = Join-Path $PSScriptRoot "..\contracts"
Set-Location $contractDir

# Check if cargo-contract is installed
if (-not (Get-Command cargo-contract -ErrorAction SilentlyContinue)) {
    Write-Host "Error: cargo-contract not found!" -ForegroundColor Red
    Write-Host "Install it with: cargo install cargo-contract --force"
    exit 1
}

# Build the contract
cargo contract build --release

Write-Host ""
Write-Host "✅ Contract built successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Artifacts location:" -ForegroundColor Yellow
Write-Host "  📦 Contract bundle: target/ink/x402_payment_executor.contract"
Write-Host "  🔧 WASM code: target/ink/x402_payment_executor.wasm"
Write-Host "  📄 Metadata: target/ink/metadata.json"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Deploy using Contracts UI: https://contracts-ui.substrate.io/"
Write-Host "  2. Or deploy using CLI (see scripts/deploy-contract.md)"
