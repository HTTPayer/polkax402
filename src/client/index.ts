/**
 * Polkadot X402 Client - Fetch wrapper with automatic payment handling
 */

import type {
  WrapFetchConfig,
  PaymentFetch,
  FetchFunction,
  X402PaymentRequired,
  PolkadotNetwork,
} from '../types/index.js';
import {
  createPaymentHeader,
  parsePaymentRequired,
} from '../utils/payment.js';

/**
 * Wrap fetch with automatic X402 payment handling
 *
 * Usage:
 * ```typescript
 * import { wrapFetchWithPayment } from 'dotx402/client';
 *
 * const fetchWithPay = wrapFetchWithPayment(fetch, {
 *   signer: polkadotSigner,
 *   network: 'polkadot',
 *   maxPayment: '1000000000000' // 1 DOT in planck
 * });
 *
 * const response = await fetchWithPay('https://api.example.com/data');
 * ```
 */
export function wrapFetchWithPayment(
  fetchFn: FetchFunction,
  config: WrapFetchConfig
): PaymentFetch {
  const {
    signer,
    network,
    maxPayment,
    x402Version = 1,
  } = config;

  return async function fetchWithPayment(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    // Make initial request
    let response = await fetchFn(input, init);

    // Check if payment is required
    if (response.status === 402) {
      const paymentRequiredHeader = response.headers.get('X-Payment-Required');

      if (!paymentRequiredHeader) {
        throw new Error(
          'Received 402 status but no X-Payment-Required header found'
        );
      }

      // Parse payment requirements
      let paymentRequired: X402PaymentRequired;
      try {
        paymentRequired = parsePaymentRequired(paymentRequiredHeader);
      } catch (error) {
        throw new Error(
          `Failed to parse X-Payment-Required header: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      // Validate payment amount if maxPayment is set
      if (maxPayment) {
        const requiredAmount = BigInt(paymentRequired.maxAmountRequired);
        const maxAmount = BigInt(maxPayment);

        if (requiredAmount > maxAmount) {
          throw new Error(
            `Payment required (${requiredAmount}) exceeds maximum allowed (${maxAmount})`
          );
        }
      }

      // Validate network if specified
      const paymentNetwork = network || paymentRequired.network;
      if (network && network !== paymentRequired.network) {
        console.warn(
          `Network mismatch: configured for ${network}, but server requires ${paymentRequired.network}`
        );
      }

      // Create payment header
      const paymentHeader = await createPaymentHeader(
        signer,
        paymentRequired,
        paymentNetwork,
        5, // 5 minute validity
        x402Version
      );

      // Retry request with payment
      const headersWithPayment = new Headers(init?.headers);
      headersWithPayment.set('X-Payment', paymentHeader);

      response = await fetchFn(input, {
        ...init,
        headers: headersWithPayment,
      });

      // Check if payment was accepted
      if (response.status === 402) {
        throw new Error('Payment was rejected by the server');
      }
    }

    return response;
  };
}

/**
 * Create a payment header manually (for advanced use cases)
 *
 * This allows you to create and send payment headers manually
 * instead of using the automatic wrapper.
 */
export { createPaymentHeader, parsePaymentRequired } from '../utils/payment.js';

/**
 * Re-export types for convenience
 */
export type {
  WrapFetchConfig,
  PaymentFetch,
  PolkadotSigner,
  PolkadotNetwork,
  X402PaymentRequired,
  X402PolkadotPayment,
  PolkadotPaymentPayload,
} from '../types/index.js';
