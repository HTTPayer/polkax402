/**
 * Polkadot X402 Client - Fetch wrapper with automatic payment handling
 */

import type {
  WrapFetchConfig,
  PaymentFetch,
  FetchFunction,
  X402PaymentRequired,
  PolkadotNetwork,
  PolkadotSigner,
} from '../types/index.js';
import {
  createPaymentHeader,
  parsePaymentRequired,
} from '../utils/payment.js';

/**
 * Wrap fetch with automatic X402 payment handling (simple API)
 *
 * @example
 * ```typescript
 * import { Keyring } from '@polkadot/keyring';
 * import { wrapFetchWithPayment, createPolkadotSigner } from 'dotx402';
 *
 * const keyring = new Keyring({ type: 'sr25519' });
 * const account = keyring.addFromUri('//Bob');
 * const signer = createPolkadotSigner(account);
 *
 * const fetchWithPay = wrapFetchWithPayment(fetch, signer);
 * const response = await fetchWithPay('https://api.example.com/data');
 * ```
 */
export function wrapFetchWithPayment(
  fetchFn: FetchFunction,
  signerOrConfig: PolkadotSigner | WrapFetchConfig
): PaymentFetch {
  // Normalize input to config format
  const config: WrapFetchConfig =
    'sign' in signerOrConfig
      ? { signer: signerOrConfig }
      : signerOrConfig;

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
      // Parse payment requirements from response body (X402 spec)
      let responseBody: any;
      try {
        responseBody = await response.json();
      } catch (error) {
        throw new Error(
          `Failed to parse 402 response body: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      // X402 spec: response body has { x402Version, accepts: [...], error? }
      if (!responseBody.accepts || !Array.isArray(responseBody.accepts) || responseBody.accepts.length === 0) {
        throw new Error('Invalid X402 Payment Required response: missing accepts array');
      }

      // Use the first payment option from accepts array
      const paymentRequired: X402PaymentRequired = responseBody.accepts[0];

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
 * Creates a Polkadot signer from a Keyring account
 *
 * This is a helper function to simplify creating signers from Polkadot accounts.
 * The signer handles message hashing and signing in the format expected by the
 * X402 smart contract.
 *
 * @example
 * ```typescript
 * import { Keyring } from '@polkadot/keyring';
 * import { createPolkadotSigner } from 'dotx402';
 *
 * const keyring = new Keyring({ type: 'sr25519' });
 * const account = keyring.addFromUri('//Bob');
 * const signer = createPolkadotSigner(account);
 * ```
 */
export function createPolkadotSigner(account: any): PolkadotSigner {
  return {
    address: account.address,
    sign: async (payload: string | Uint8Array) => {
      const { blake2AsU8a } = await import('@polkadot/util-crypto');
      const message = typeof payload === 'string'
        ? Buffer.from(payload, 'hex')
        : payload;
      const hash = blake2AsU8a(message, 256);
      const signature = account.sign(hash);
      return { signature: `0x${Buffer.from(signature).toString('hex')}` };
    },
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
