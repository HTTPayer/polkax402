/**
 * Polkadot X402 Server Middleware
 *
 * Express/Connect-compatible middleware for handling X402 payment-gated requests
 */

import {
  decodePaymentHeader,
  verifyPaymentSignature,
  isPaymentExpired,
} from '../utils/payment.js';
import type {
  X402PolkadotPayment,
  X402PaymentRequired,
  PolkadotPaymentPayload,
  PolkadotNetwork,
} from '../types/index.js';

/**
 * Facilitator response interface
 */
export interface FacilitatorResponse {
  ok: boolean;
  confirmed?: boolean;
  error?: string;
  blockNumber?: number;
  blockHash?: string;
  extrinsicHash?: string;
}

/**
 * Custom payment validator function
 */
export type PaymentValidator = (
  payment: X402PolkadotPayment,
  parsedPayload: PolkadotPaymentPayload,
  req: any
) => Promise<boolean> | boolean;

/**
 * Custom price calculator function
 */
export type PriceCalculator = (req: any) => Promise<string> | string;

/**
 * Middleware configuration options
 */
export interface X402MiddlewareConfig {
  /**
   * Network to accept payments on
   */
  network: PolkadotNetwork;

  /**
   * Recipient address (your SS58 address)
   */
  recipientAddress: string;

  /**
   * Price per request in smallest unit (planck for DOT, etc.)
   * Can be a string/number or a function that calculates based on request
   */
  pricePerRequest: string | number | PriceCalculator;

  /**
   * Asset ID for non-native tokens (optional)
   */
  asset?: string;

  /**
   * Facilitator endpoint URL for payment verification
   * If not provided, only signature verification will be performed
   */
  facilitatorUrl?: string;

  /**
   * Whether to require facilitator confirmation
   * Default: true if facilitatorUrl is provided
   */
  requireFacilitatorConfirmation?: boolean;

  /**
   * Custom payment validator function
   * Can be used to implement additional validation logic
   */
  customValidator?: PaymentValidator;

  /**
   * Maximum payment age in milliseconds
   * Payments older than this will be rejected
   * Default: 5 minutes (300000 ms)
   */
  maxPaymentAge?: number;

  /**
   * Whether to allow test payments (with 0 amount)
   * Default: false
   */
  allowTestPayments?: boolean;

  /**
   * Custom error messages
   */
  errorMessages?: {
    paymentRequired?: string;
    invalidSignature?: string;
    paymentExpired?: string;
    facilitatorRejected?: string;
    invalidAmount?: string;
  };

  /**
   * Resource description for X-Payment-Required header
   */
  resourceDescription?: string;

  /**
   * Expected response MIME type for X-Payment-Required header
   */
  responseMimeType?: string;

  /**
   * Maximum timeout in seconds for payment validity
   * Default: 300 (5 minutes)
   */
  maxTimeoutSeconds?: number;

  /**
   * Optional schema describing the input/output expectations
   */
  outputSchema?: import('../types/index.js').X402OutputSchema;

  /**
   * Optional custom data to include in payment instructions
   */
  extra?: Record<string, any>;
}

/**
 * Extended request interface with payment information
 */
export interface X402Request {
  x402Payment?: {
    payment: X402PolkadotPayment;
    payload: PolkadotPaymentPayload;
    verified: boolean;
    confirmedOnChain?: boolean;
    facilitatorResponse?: FacilitatorResponse;
  };
}

/**
 * Create X402 payment middleware
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { createX402Middleware } from 'dotx402/server';
 *
 * const app = express();
 *
 * app.use('/api/paid', createX402Middleware({
 *   network: 'paseo',
 *   recipientAddress: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
 *   pricePerRequest: '100000000000', // 0.1 DOT
 *   facilitatorUrl: 'https://facilitator.httpayer.io/execute'
 * }));
 *
 * app.get('/api/paid/data', (req, res) => {
 *   res.json({ message: 'This is paid content!' });
 * });
 * ```
 */
export function createX402Middleware(config: X402MiddlewareConfig) {
  const {
    network,
    recipientAddress,
    pricePerRequest,
    asset,
    facilitatorUrl,
    requireFacilitatorConfirmation = !!facilitatorUrl,
    customValidator,
    maxPaymentAge = 300000, // 5 minutes default
    allowTestPayments = false,
    errorMessages = {},
    resourceDescription,
    responseMimeType,
  } = config;

  return async function x402Middleware(
    req: any,
    res: any,
    next: any
  ): Promise<void> {
    try {
      // Get payment header
      const paymentHeader = req.headers['x-payment'];

      // If no payment header, return 402 Payment Required
      if (!paymentHeader) {
        return sendPaymentRequired(req, res, config);
      }

      // Decode payment
      let payment: X402PolkadotPayment;
      try {
        payment = decodePaymentHeader(paymentHeader);
      } catch (error) {
        res.status(400).send('Invalid payment header format');
        return;
      }

      // Verify network matches
      if (payment.network !== network) {
        res.status(400).send(
          `Invalid network: expected ${network}, got ${payment.network}`
        );
        return;
      }

      // Verify asset matches (if specified)
      if (asset && payment.asset !== asset) {
        res.status(400).send(
          `Invalid asset: expected ${asset}, got ${payment.asset}`
        );
        return;
      }

      // Verify signature
      const signatureValid = await verifyPaymentSignature(payment);
      if (!signatureValid) {
        res.status(403).send(
          errorMessages?.invalidSignature || 'Invalid payment signature'
        );
        return;
      }

      // Check if payment expired
      if (isPaymentExpired(payment)) {
        res.status(400).send(
          errorMessages?.paymentExpired || 'Payment has expired'
        );
        return;
      }

      // Parse payload
      const parsedPayload: PolkadotPaymentPayload = JSON.parse(
        payment.payload.payload
      );

      // Verify payment is to correct recipient
      if (parsedPayload.to !== recipientAddress) {
        res.status(400).send(
          `Invalid recipient: expected ${recipientAddress}, got ${parsedPayload.to}`
        );
        return;
      }

      // Calculate expected price
      const expectedPrice =
        typeof pricePerRequest === 'function'
          ? await pricePerRequest(req)
          : String(pricePerRequest);

      // Verify amount
      const paymentAmount = BigInt(parsedPayload.amount);
      const expectedAmount = BigInt(expectedPrice);

      if (!allowTestPayments && paymentAmount < expectedAmount) {
        res.status(400).send(
          errorMessages?.invalidAmount ||
            `Insufficient payment: expected ${expectedAmount}, got ${paymentAmount}`
        );
        return;
      }

      // Check payment age
      const paymentAge = Date.now() - (parsedPayload.validUntil - maxPaymentAge);
      if (paymentAge > maxPaymentAge) {
        res.status(400).send('Payment is too old');
        return;
      }

      // Run custom validator if provided
      if (customValidator) {
        const customValid = await customValidator(payment, parsedPayload, req);
        if (!customValid) {
          res.status(403).send('Custom validation failed');
          return;
        }
      }

      // Verify with facilitator if configured
      let facilitatorResponse: FacilitatorResponse | undefined;
      if (facilitatorUrl) {
        try {
          const response = await fetch(facilitatorUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...parsedPayload,
              signature: payment.payload.signature,
              network: payment.network,
            }),
          });

          facilitatorResponse = await response.json();

          if (requireFacilitatorConfirmation && !facilitatorResponse?.ok) {
            res.status(402).send(
              errorMessages?.facilitatorRejected ||
                facilitatorResponse?.error ||
                'Payment not settled'
            );
            return;
          }
        } catch (error) {
          console.error('Facilitator verification failed:', error);
          if (requireFacilitatorConfirmation) {
            res.status(502).send('Payment verification service unavailable');
            return;
          }
        }
      }

      // Attach payment info to request
      (req as X402Request).x402Payment = {
        payment,
        payload: parsedPayload,
        verified: true,
        confirmedOnChain: facilitatorResponse?.confirmed,
        facilitatorResponse,
      };

      // Payment verified, proceed to next middleware
      next();
    } catch (error) {
      console.error('X402 middleware error:', error);
      res.status(500).send('Internal server error');
    }
  };
}

/**
 * Send 402 Payment Required response
 */
function sendPaymentRequired(
  req: any,
  res: any,
  config: X402MiddlewareConfig
): void {
  const {
    network,
    recipientAddress,
    pricePerRequest,
    asset,
    resourceDescription,
    responseMimeType,
    maxTimeoutSeconds,
    outputSchema,
    extra,
    errorMessages,
  } = config;

  // Calculate price (can call function since we have req)
  const price =
    typeof pricePerRequest === 'function'
      ? String(pricePerRequest(req))
      : String(pricePerRequest);

  // Build full resource URL (X402 spec requires full URL, not just path)
  const protocol = req.protocol || 'http';
  const host = req.get('host') || 'localhost';
  const path = req.path || req.url || '/';
  const fullResourceUrl = `${protocol}://${host}${path}`;

  // Build payment required object with only defined fields
  const paymentRequired: X402PaymentRequired = {
    scheme: 'exact',
    network,
    payTo: recipientAddress,
    maxAmountRequired: price,
    resource: fullResourceUrl,
    description: resourceDescription || '',
    mimeType: responseMimeType || 'application/json',
    maxTimeoutSeconds: maxTimeoutSeconds || 300, // Default 5 minutes
  };

  // Add optional fields only if defined
  if (asset) {
    paymentRequired.asset = asset;
  }
  if (outputSchema) {
    paymentRequired.outputSchema = outputSchema;
  }
  if (extra) {
    paymentRequired.extra = extra;
  }

  // X402 spec: return JSON body with x402Version and accepts array
  const x402Response = {
    x402Version: 1,
    accepts: [paymentRequired],
    error: errorMessages?.paymentRequired || 'Payment Required'
  };

  res.status(402)
    .header('Content-Type', 'application/json')
    .json(x402Response);
}

/**
 * Helper to create a simple middleware with basic configuration
 */
export function simpleX402Middleware(
  recipientAddress: string,
  network: PolkadotNetwork = 'polkadot',
  pricePerRequest: string | number = '100000000000'
) {
  return createX402Middleware({
    network,
    recipientAddress,
    pricePerRequest,
  });
}
