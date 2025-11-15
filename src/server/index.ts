/**
 * Polkadot X402 Server - Express/HTTP server middleware
 *
 * This module provides server-side utilities for handling X402 payments.
 */

// Re-export verification utilities for server use
export {
  verifyPaymentSignature,
  isPaymentExpired,
  decodePaymentHeader,
  parsePaymentRequired,
} from '../utils/payment.js';

// Re-export middleware
export {
  createX402Middleware,
  simpleX402Middleware,
} from './middleware.js';

// Re-export types
export type {
  X402PolkadotPayment,
  X402PaymentRequired,
  PolkadotPaymentPayload,
  PaymentVerificationResult,
} from '../types/index.js';

// Re-export middleware types
export type {
  X402MiddlewareConfig,
  X402Request,
  FacilitatorResponse,
  PaymentValidator,
  PriceCalculator,
} from './middleware.js';
