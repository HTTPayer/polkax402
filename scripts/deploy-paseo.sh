#!/bin/bash
# Quick deploy to Paseo testnet

echo "🚀 Deploying to Paseo Testnet..."
echo ""

# Check if seed is set
if [ -z "$DEPLOYER_SEED" ]; then
    echo "❌ Error: DEPLOYER_SEED not set"
    echo ""
    echo "Please set your deployment seed phrase:"
    echo "  export DEPLOYER_SEED=\"your twelve word seed phrase\""
    echo ""
    echo "Or add it to your .env file:"
    echo "  DEPLOYER_SEED=\"your twelve word seed phrase\""
    exit 1
fi

# Set network
export DEPLOY_NETWORK=paseo

# Run deployment
node scripts/deploy-contract.js
