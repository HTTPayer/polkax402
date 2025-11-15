#!/bin/bash
# Build the X402 Payment Executor smart contract

set -e

echo "Building X402 Payment Executor Contract..."

cd "$(dirname "$0")/../contracts"

# Check if cargo-contract is installed
if ! command -v cargo-contract &> /dev/null; then
    echo "Error: cargo-contract not found!"
    echo "Install it with: cargo install cargo-contract --force"
    exit 1
fi

# Build the contract
cargo contract build --release

echo ""
echo "✅ Contract built successfully!"
echo ""
echo "Artifacts location:"
echo "  📦 Contract bundle: target/ink/x402_payment_executor.contract"
echo "  🔧 WASM code: target/ink/x402_payment_executor.wasm"
echo "  📄 Metadata: target/ink/metadata.json"
echo ""
echo "Next steps:"
echo "  1. Deploy using Contracts UI: https://contracts-ui.substrate.io/"
echo "  2. Or deploy using CLI (see scripts/deploy-contract.md)"
