# polkax402

> TypeScript SDK for implementing the X402 payment protocol on Substrate

A lightweight, type-safe SDK that brings HTTP 402 Payment Required to the Polkadot ecosystem through the polkax402 Substrate blockchain. Enable pay-per-use APIs with cryptographic payment proofs using the HTTPUSD contract's `transferWithAuthorization` for non-EVM assets.

## Features

- **Cryptographic Payment Proofs** - Sign payments with Polkadot keypairs
- **Multi-Network Support** - Works with Polkadot, Kusama, testnets, and custom substrate chains
- **Type-Safe** - Full TypeScript support with comprehensive type definitions
- **Auto-Retry Logic** - Automatic 402 detection and payment handling
- **Wallet Integration** - Compatible with Polkadot.js extension and injected wallets
- **ESM Only** - Modern JavaScript modules

## The polkax402 Blockchain

**polkax402** is an X402-enabled Substrate blockchain that provides `transferWithAuthorization` capabilities for non-EVM assets. Unlike traditional EVM-based payment systems, polkax402 brings cryptographic payment authorization directly to the Polkadot ecosystem through the HTTPUSD smart contract.

### HTTPUSD Contract

The HTTPUSD contract is an ink! smart contract deployed on polkax402 that enables:

- **Transfer with Authorization**: Users can cryptographically authorize payments without directly sending transactions, allowing third-party facilitators to execute transfers on their behalf
- **Non-EVM Asset Support**: Works natively with Substrate-based tokens, eliminating the need for EVM compatibility layers
- **Nonce-based Replay Protection**: Prevents duplicate payment execution with secure nonce tracking
- **Signature Verification**: Validates user signatures to ensure only authorized transfers are executed

### Future Development

A **bridge wrapper contract** will be deployed to enable compatibility with other Substrate parachains and standalone chains, allowing cross-chain X402 payments across the broader Polkadot ecosystem.

### Network Configuration

- **RPC Endpoint**: https://bov424mc35ckd0qqjgd7cb6888.ingress.akash-palmito.org/
- **Network Name**: polkax402
- **Chain Type**: Custom Substrate blockchain with ink! smart contract support

## Installation

```bash
npm install polkax402
```

## CLI Tools

This package includes CLI tools for account management:

```bash
# Generate a new Polkadot account
npm run account:generate

# Inspect an existing account
npm run account:inspect -- Alice
npm run account:inspect -- "your seed phrase"

# Check account balance
npm run account:balance -- YOUR_ADDRESS
npm run account:balance -- --network westend Alice
```

See [CLI.md](./CLI.md) for complete CLI documentation.

**Need testnet tokens?**
- Paseo (recommended): See [PASEO.md](./PASEO.md)
- Westend/Rococo: See [TESTNET_FAUCETS.md](./TESTNET_FAUCETS.md)

## Quick Start

### Client Usage

```typescript
import { wrapFetchWithPayment } from 'polkax402/client';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';

await cryptoWaitReady();

// Setup your Polkadot account
const keyring = new Keyring({ type: 'sr25519' });
const account = keyring.addFromUri('your seed phrase');

// Create a signer
const signer = {
  address: account.address,
  sign: async (payload) => {
    const signature = account.sign(payload);
    return { signature: Buffer.from(signature).toString('hex') };
  },
};

// Wrap fetch with automatic payment handling
const fetchWithPay = wrapFetchWithPayment(fetch, {
  signer,
  network: 'polkax402',  // Custom substrate network
  maxPayment: '1000000000000', // Maximum amount willing to pay
});

// Use it just like regular fetch - payments happen automatically!
const response = await fetchWithPay('https://api.example.com/premium-data');
const data = await response.json();
```

### How It Works

1. **Initial Request**: Client makes a request without payment
2. **402 Response**: Server returns `402 Payment Required` with payment details in `X-Payment-Required` header
3. **Auto-Payment**: SDK automatically creates a signed payment and retries the request
4. **Success**: Server validates payment and returns the requested data

### Payment Flow Example

```
Client                          Server
  |                               |
  |-- GET /api/data ------------->|
  |                               |
  |<-- 402 Payment Required ------| (X-Payment-Required header)
  |                               |
  |-- GET /api/data ------------->| (X-Payment header with signature)
  |                               |
  |<-- 200 OK with data -----------|
```

## API Reference

### Client Functions

#### `wrapFetchWithPayment(fetchFn, config)`

Wraps a fetch function with automatic X402 payment handling.

**Parameters:**
- `fetchFn: FetchFunction` - The native fetch function to wrap
- `config: WrapFetchConfig` - Configuration object
  - `signer: PolkadotSigner` - Signer with address and sign method
  - `network?: PolkadotNetwork` - Polkadot network to use
  - `maxPayment?: string` - Maximum amount willing to pay (in planck)
  - `x402Version?: number` - X402 protocol version (default: 1)

**Returns:** `PaymentFetch` - Enhanced fetch function

#### `createPaymentHeader(signer, paymentRequired, network?, validityMinutes?, x402Version?)`

Manually create a payment header for advanced use cases.

**Parameters:**
- `signer: PolkadotSigner` - Account signer
- `paymentRequired: X402PaymentRequired` - Payment requirements from server
- `network?: PolkadotNetwork` - Network override
- `validityMinutes?: number` - Payment validity window (default: 5)
- `x402Version?: number` - Protocol version (default: 1)

**Returns:** `Promise<string>` - Base64-encoded payment header

### Types

#### `PolkadotSigner`

```typescript
interface PolkadotSigner {
  address: string;  // SS58-encoded address
  sign: (payload: string) => Promise<{ signature: string }> | { signature: string };
}
```

#### `PolkadotNetwork`

```typescript
type PolkadotNetwork =
  | 'polkadot'           // Polkadot mainnet
  | 'kusama'             // Kusama canary network
  | 'westend'            // Westend testnet
  | 'rococo'             // Rococo testnet
  | 'paseo'              // Paseo testnet (community-run)
  | 'polkax402'          // Custom polkax402 substrate chain
  | 'asset-hub-polkadot' // Asset Hub parachain (Polkadot)
  | 'asset-hub-kusama'   // Asset Hub parachain (Kusama)
  | 'asset-hub-paseo';   // Asset Hub parachain (Paseo)
```

#### `X402PaymentRequired`

```typescript
interface X402PaymentRequired {
  scheme: 'exact';
  network: PolkadotNetwork;
  payTo: string;              // SS58 recipient address
  maxAmountRequired: string;  // Amount in planck
  asset?: string;             // Optional asset ID
  resource: string;           // API resource path
  description?: string;       // Human-readable description
  mimeType?: string;          // Expected content type
  maxTimeoutSeconds?: number; // Payment validity
}
```

## Advanced Usage

### Using with Polkadot.js Browser Extension

```typescript
import { web3Enable, web3Accounts, web3FromAddress } from '@polkadot/extension-dapp';
import { wrapFetchWithPayment } from 'polkax402/client';

// Enable extension
await web3Enable('My DApp');

// Get accounts
const accounts = await web3Accounts();
const selectedAccount = accounts[0];

// Get injected signer
const injector = await web3FromAddress(selectedAccount.address);

const signer = {
  address: selectedAccount.address,
  sign: async (payload) => {
    const result = await injector.signer.signRaw({
      address: selectedAccount.address,
      data: payload,
      type: 'bytes',
    });
    return { signature: result.signature };
  },
};

const fetchWithPay = wrapFetchWithPayment(fetch, {
  signer,
  network: 'polkax402'
});
```

### Manual Payment Header Creation

```typescript
import { createPaymentHeader, parsePaymentRequired } from 'polkax402/client';

// Parse payment requirements from 402 response
const paymentRequired = parsePaymentRequired(
  response.headers.get('X-Payment-Required')
);

// Create payment header
const paymentHeader = await createPaymentHeader(signer, paymentRequired);

// Use in request
await fetch(url, {
  headers: {
    'X-Payment': paymentHeader,
  },
});
```

### Error Handling

```typescript
try {
  const response = await fetchWithPay(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
} catch (error) {
  if (error.message.includes('exceeds maximum allowed')) {
    console.error('Payment too expensive');
  } else if (error.message.includes('Payment was rejected')) {
    console.error('Server rejected payment');
  } else {
    console.error('Request failed:', error);
  }
}
```

## Server Implementation

Server-side utilities for validating X402 payments are coming soon. The server module will provide:

- Express/HTTP middleware for payment validation
- Signature verification
- On-chain payment confirmation
- Payment requirement generation

```typescript
// Future API (coming soon)
import { createX402Middleware } from 'polkax402/server';

app.use(createX402Middleware({
  network: 'polkax402',
  recipientAddress: '5GrwvaEF...',
  pricePerRequest: '100000000000', // Price in smallest unit
}));
```

## Examples

See the `examples/` directory for complete examples:

- `simple-client.ts` - Minimal client setup
- `client-basic.ts` - Comprehensive client examples including browser integration

## Payment Structure

The X-Payment header contains a base64-encoded JSON object:

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "polkadot",
  "payload": {
    "payload": "{\"from\":\"5Gj...\",\"to\":\"5Ff...\",\"amount\":\"1000000000000\",\"nonce\":\"0x...\",\"validUntil\":1234567890}",
    "signature": "0x...",
    "signerPublicKey": "5Gj..."
  },
  "asset": "DOT"
}
```

## Development

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Watch mode
npm run watch

# Clean build artifacts
npm run clean
```

## Docker Deployment

All services (facilitator, server, explorer) can be run using Docker:

```bash
# Start all services with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

**Services available:**
- **Server (API)**: http://localhost:3000
- **Facilitator**: http://localhost:4000
- **Explorer**: http://localhost:5000

For complete Docker deployment guide, see [DOCKER.md](./DOCKER.md)

## Security Considerations

- **Never hardcode private keys** - Use environment variables or secure key management
- **Validate payment amounts** - Always set `maxPayment` to prevent overpaying
- **Check network** - Ensure you're on the correct network (mainnet vs testnet)
- **Verify signatures** - Server must validate signatures before granting access
- **Use HTTPS** - Always use encrypted connections for API calls

## License

ISC

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Related Projects

- [x402-fetch](https://www.npmjs.com/package/x402-fetch) - X402 client for EVM chains
- [x402-express](https://www.npmjs.com/package/x402-express) - X402 server for Express.js
- [HTTPayer](https://github.com/HTTPayer) - HTTP payment protocol infrastructure

## Support

- GitHub Issues: https://github.com/HTTPayer/polkax402/issues
- X402 Spec: [Coming soon]
