/**
 * Polkadot X402 Fetch Wrapper
 *
 * Wraps the standard fetch API to automatically handle X402 payment flows
 * with Polkadot/Substrate accounts.
 */

import https from 'https';
import http from 'http';
import type { PolkadotSigner, X402PaymentRequired } from '../types/index.js';
import { createPaymentHeader } from './payment.js';

/**
 * Custom fetch that handles self-signed SSL certificates
 * Uses Node.js native https module for better control over SSL
 */
export async function secureFetch(url: string | URL, options?: RequestInit): Promise<Response> {
  const urlString = url.toString();

  // For non-HTTPS URLs, use standard fetch
  if (!urlString.startsWith('https://')) {
    return fetch(url, options);
  }

  // For HTTPS URLs with self-signed certs, use a custom implementation
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlString);
    const requestOptions: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options?.method || 'GET',
      headers: options?.headers as any,
      rejectUnauthorized: false, // Allow self-signed certificates
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        // Create a Response-like object
        const response = new Response(data, {
          status: res.statusCode || 200,
          statusText: res.statusMessage || 'OK',
          headers: new Headers(res.headers as any),
        });
        resolve(response);
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    // Send request body if present
    if (options?.body) {
      if (typeof options.body === 'string') {
        req.write(options.body);
      } else if (Buffer.isBuffer(options.body)) {
        req.write(options.body);
      }
    }

    req.end();
  });
}

export interface FetchWithPaymentOptions extends RequestInit {
  /**
   * Validity period for payment authorization in minutes
   * @default 5
   */
  validityMinutes?: number;

  /**
   * X402 protocol version
   * @default 1
   */
  x402Version?: number;
}

/**
 * Wraps fetch with automatic X402 payment handling for Polkadot
 *
 * @example
 * ```typescript
 * import { Keyring } from '@polkadot/keyring';
 * import { wrapFetchWithPayment } from './utils/fetch-wrapper.js';
 *
 * const keyring = new Keyring({ type: 'sr25519' });
 * const account = keyring.addFromUri('//Bob');
 *
 * const signer = {
 *   address: account.address,
 *   sign: async (payload) => {
 *     const { blake2AsU8a } = await import('@polkadot/util-crypto');
 *     const message = typeof payload === 'string' ? Buffer.from(payload, 'hex') : payload;
 *     const hash = blake2AsU8a(message, 256);
 *     const signature = account.sign(hash);
 *     return { signature: `0x${Buffer.from(signature).toString('hex')}` };
 *   }
 * };
 *
 * const fetchWithPay = wrapFetchWithPayment(fetch, signer);
 * const response = await fetchWithPay('https://api.example.com/data');
 * ```
 */
export function wrapFetchWithPayment(
  fetchFn: typeof fetch,
  signer: PolkadotSigner
): (input: RequestInfo | URL, init?: FetchWithPaymentOptions) => Promise<Response> {
  return async (input: RequestInfo | URL, init?: FetchWithPaymentOptions): Promise<Response> => {
    const { validityMinutes = 5, x402Version = 1, ...fetchOptions } = init || {};

    // Make initial request using secureFetch
    let response = await secureFetch(input.toString(), fetchOptions);

    // If not a 402, return immediately
    if (response.status !== 402) {
      return response;
    }

    // Handle 402 Payment Required
    try {
      // Parse X402 response body
      const responseBody = await response.json();

      // Validate X402 response format
      if (!responseBody.accepts || !Array.isArray(responseBody.accepts) || responseBody.accepts.length === 0) {
        throw new Error('Invalid X402 Payment Required response: missing accepts array');
      }

      // Use the first payment option
      const paymentRequired: X402PaymentRequired = responseBody.accepts[0];

      // Create payment header
      const paymentHeader = await createPaymentHeader(
        signer,
        paymentRequired,
        undefined, // Use network from paymentRequired
        validityMinutes,
        x402Version
      );

      // Retry request with payment header
      const headers = new Headers(fetchOptions.headers);
      headers.set('X-Payment', paymentHeader);

      response = await secureFetch(input.toString(), {
        ...fetchOptions,
        headers,
      });

      return response;
    } catch (error) {
      // If payment handling fails, throw the error
      throw new Error(
        `X402 payment handling failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };
}

/**
 * Creates a Polkadot signer from a Keyring account
 * Helper function to simplify signer creation
 *
 * @example
 * ```typescript
 * import { Keyring } from '@polkadot/keyring';
 * import { createPolkadotSigner } from './utils/fetch-wrapper.js';
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
      const message = typeof payload === 'string' ? Buffer.from(payload, 'hex') : payload;
      const hash = blake2AsU8a(message, 256);
      const signature = account.sign(hash);
      return { signature: `0x${Buffer.from(signature).toString('hex')}` };
    },
  };
}
