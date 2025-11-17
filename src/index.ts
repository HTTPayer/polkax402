/**
 * dotx402 - Polkadot X402 Protocol SDK
 *
 * A TypeScript SDK for implementing the X402 payment protocol on Polkadot.
 * Provides client and server utilities for payment-gated HTTP APIs.
 */

// Re-export client functionality
export {
  wrapFetchWithPayment,
  createPolkadotSigner,
  createPaymentHeader,
  parsePaymentRequired,
} from './client/index.js';

// Re-export utilities
export {
  generateNonce,
  createPaymentPayload,
  signPaymentPayload,
  createX402Payment,
  encodePaymentHeader,
  decodePaymentHeader,
  verifyPaymentSignature,
  isPaymentExpired,
} from './utils/payment.js';

// Re-export all types
export type {
  PolkadotNetwork,
  PolkadotPaymentPayload,
  PolkadotSignedPayment,
  X402PolkadotPayment,
  X402PaymentRequired,
  PolkadotSigner,
  WrapFetchConfig,
  FetchFunction,
  PaymentFetch,
  PaymentVerificationResult,
} from './types/index.js';
