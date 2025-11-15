# Deploying the X402 Payment Executor Contract to Paseo

This guide walks you through deploying the X402 payment executor smart contract to Paseo testnet.

## Prerequisites

### 1. Install Rust and cargo-contract

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add wasm target
rustup target add wasm32-unknown-unknown

# Install cargo-contract (ink! CLI tool)
cargo install cargo-contract --force
```

### 2. Install Substrate Contracts Node (for local testing)

```bash
cargo install contracts-node --git https://github.com/paritytech/substrate-contracts-node.git
```

## Building the Contract

Navigate to the contracts directory and build:

```bash
cd packages/dotx402/contracts

# Build the contract
cargo contract build --release

# This will create:
# - target/ink/x402_payment_executor.contract (deployment bundle)
# - target/ink/x402_payment_executor.wasm (contract code)
# - target/ink/metadata.json (contract metadata/ABI)
```

## Deploying to Paseo Testnet

### Option 1: Using Contracts UI (Easiest)

1. Go to [Contracts UI](https://contracts-ui.substrate.io/)

2. Connect to Paseo:
   - Click the network dropdown (top left)
   - Select "Add New Network"
   - Add Paseo RPC: `wss://paseo.rpc.amforc.com` or `wss://rpc.ibp.network/paseo`
   - Or use the Asset Hub Paseo parachain

3. Upload & Deploy:
   - Click "Add New Contract"
   - Choose "Upload New Contract Code"
   - Select the `.contract` file from `target/ink/`
   - Set constructor parameters:
     - `facilitator_fee_bps`: e.g., `100` (1% fee)
   - Click "Next" and sign the transaction
   - Note the contract address!

### Option 2: Using cargo-contract CLI

```bash
# Make sure you have a funded account on Paseo
# Get free testnet tokens from: https://faucet.polkadot.io/paseo

# Deploy the contract
cargo contract instantiate \
  --constructor new \
  --args 100 \
  --suri "//YourSecretPhrase" \
  --url wss://paseo.rpc.amforc.com \
  --skip-confirm

# Save the contract address from the output!
```

### Option 3: Using Polkadot.js Apps

1. Go to [Polkadot.js Apps](https://polkadot.js.org/apps/)
2. Connect to Paseo network
3. Navigate to Developer > Contracts
4. Click "Upload & deploy code"
5. Upload the `.contract` file
6. Set constructor parameters and deploy

## Getting Paseo Testnet Tokens

You need PAS tokens to deploy and interact with contracts:

1. Create an account using [Polkadot.js Extension](https://polkadot.js.org/extension/)
2. Get testnet tokens from the faucet:
   - **Paseo Faucet**: https://faucet.polkadot.io/paseo
   - **Matrix Faucet**: Join the Paseo channel on Matrix

## Verifying Deployment

After deployment, test the contract:

```bash
# Check if nonce is used (should return false initially)
cargo contract call \
  --contract <CONTRACT_ADDRESS> \
  --message is_nonce_used \
  --args <ACCOUNT_ID> "test-nonce" \
  --suri "//YourAccount" \
  --url wss://paseo.rpc.amforc.com \
  --dry-run

# Get facilitator fee
cargo contract call \
  --contract <CONTRACT_ADDRESS> \
  --message get_facilitator_fee \
  --suri "//YourAccount" \
  --url wss://paseo.rpc.amforc.com \
  --dry-run
```

## Contract Addresses

Save your deployed contract addresses here:

- **Paseo Testnet**: `<YOUR_CONTRACT_ADDRESS>`
- **Asset Hub Paseo**: `<YOUR_CONTRACT_ADDRESS>`
- **Local Development**: `<YOUR_CONTRACT_ADDRESS>`

## Next Steps

1. Update the facilitator service to use the contract address
2. Configure the middleware to point to your facilitator
3. Test the payment flow end-to-end

## Troubleshooting

### "Insufficient balance" error
- Make sure your account has enough PAS tokens
- Get more from the faucet

### "ContractTrapped" error
- Check that all constructor parameters are correct
- Verify the contract compiled successfully
- Check the contract's error events

### RPC connection issues
- Try alternative Paseo RPC endpoints:
  - `wss://paseo-rpc.dwellir.com`
  - `wss://rpc.ibp.network/paseo`
  - `wss://paseo.rpc.amforc.com`

## Resources

- [ink! Documentation](https://use.ink/)
- [Substrate Contracts Workshop](https://docs.substrate.io/tutorials/smart-contracts/)
- [Paseo Network Info](https://wiki.polkadot.network/docs/paseo-testnet)
- [Contracts UI](https://contracts-ui.substrate.io/)
