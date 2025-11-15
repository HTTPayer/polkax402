/**
 * Polkadot X402 Protocol Type Definitions
 */

/**
 * Supported Polkadot networks
 */
export type PolkadotNetwork =
  | 'local'              // Local development node (substrate-contracts-node)
  | 'polkadot'           // Polkadot mainnet
  | 'kusama'             // Kusama canary network
  | 'westend'            // Westend testnet
  | 'rococo'             // Rococo testnet
  | 'paseo'              // Paseo testnet (community-run)
  | 'asset-hub-polkadot' // Asset Hub parachain (Polkadot)
  | 'asset-hub-kusama'   // Asset Hub parachain (Kusama)
  | 'asset-hub-paseo';   // Asset Hub parachain (Paseo)

/**
 * Payment authorization payload for Polkadot
 */
export interface PolkadotPaymentPayload {
  from: string;          // SS58 address of payer
  to: string;            // SS58 address of recipient
  amount: string;        // Amount in smallest unit (planck)
  nonce: string;         // Random nonce for replay protection
  validUntil: number;    // Unix timestamp (ms) when payment expires
  asset?: string;        // Optional asset ID for non-native tokens
}

/**
 * Signed payment authorization
 */
export interface PolkadotSignedPayment {
  payload: string;       // JSON-stringified PaymentPayload
  signature: string;     // Hex-encoded signature
  signerPublicKey?: string; // Optional public key for verification
}

/**
 * X402 payment header structure for Polkadot
 */
export interface X402PolkadotPayment {
  x402Version: number;
  scheme: 'exact';
  network: PolkadotNetwork;
  payload: PolkadotSignedPayment;
  asset?: string;        // Asset ID or token contract
}

/**
 * Payment required response header
 */
/**
 * Output schema definition for X402 payment instructions
 */
export interface X402OutputSchema {
  input?: {
    type?: 'http';
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    bodyType?: 'json' | 'form-data' | 'multipart-form-data' | 'text' | 'binary';
    queryParams?: Record<string, any>;
    bodyFields?: Record<string, any>;
    headerFields?: Record<string, any>;
  };
  output?: Record<string, any>;
}

/**
 * X402 Payment Required specification (Accepts array item)
 * Per X402 spec, all fields should be provided for complete payment instructions
 */
export interface X402PaymentRequired {
  scheme: 'exact';
  network: PolkadotNetwork;
  payTo: string;              // SS58 address
  maxAmountRequired: string;  // Amount in smallest unit
  asset?: string;             // Asset/contract address (required for token payments)
  resource: string;           // Full URL to the resource requiring payment
  description?: string;       // Human-readable description
  mimeType?: string;          // Expected response content type
  maxTimeoutSeconds?: number; // Payment validity window in seconds
  outputSchema?: X402OutputSchema; // Optional schema describing input/output
  extra?: Record<string, any>;     // Optional custom provider data
}

/**
 * Polkadot signer interface - compatible with polkadot.js injected wallet
 */
export interface PolkadotSigner {
  address: string;
  sign: (payload: string | Uint8Array) => Promise<{ signature: string }> | { signature: string };
}

/**
 * Configuration for wrapFetchWithPayment
 */
export interface WrapFetchConfig {
  signer: PolkadotSigner;
  network?: PolkadotNetwork;
  maxPayment?: string;   // Maximum amount willing to pay
  x402Version?: number;  // Default: 1
}

/**
 * Fetch function type
 */
export type FetchFunction = typeof fetch;

/**
 * Enhanced fetch function with payment support
 */
export type PaymentFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

/**
 * Payment verification result
 */
export interface PaymentVerificationResult {
  verified: boolean;
  confirmed: boolean;
  details?: {
    blockNumber?: number;
    blockHash?: string;
    extrinsicHash?: string;
  };
}
