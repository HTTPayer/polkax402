/**
 * Polkadot payment header creation utilities
 */

import { cryptoWaitReady } from '@polkadot/util-crypto';
import { stringToU8a, u8aToHex } from '@polkadot/util';
import { randomAsU8a } from '@polkadot/util-crypto';
import type {
  PolkadotPaymentPayload,
  PolkadotSignedPayment,
  X402PolkadotPayment,
  X402PaymentRequired,
  PolkadotSigner,
  PolkadotNetwork,
} from '../types/index.js';

/**
 * Ensure crypto library is ready
 */
let cryptoReady = false;
async function ensureCryptoReady(): Promise<void> {
  if (!cryptoReady) {
    await cryptoWaitReady();
    cryptoReady = true;
  }
}

/**
 * Generate a random nonce for payment
 * Returns hex WITHOUT 0x prefix to match Rust String format
 */
export function generateNonce(): string {
  const bytes = randomAsU8a(16);
  return Buffer.from(bytes).toString('hex');
}

/**
 * Create a payment payload from payment requirements
 */
export function createPaymentPayload(
  from: string,
  paymentRequired: X402PaymentRequired,
  validityMinutes: number = 5
): PolkadotPaymentPayload {
  const nonce = generateNonce();
  const validUntil = Date.now() + validityMinutes * 60 * 1000;

  return {
    from,
    to: paymentRequired.payTo,
    amount: paymentRequired.maxAmountRequired,
    nonce,
    validUntil,
    asset: paymentRequired.asset,
  };
}

/**
 * Sign a payment payload using a Polkadot signer
 *
 * This creates the same message format that the contract expects:
 * SCALE(from, to, amount, nonce, valid_until)
 */
export async function signPaymentPayload(
  payload: PolkadotPaymentPayload,
  signer: PolkadotSigner
): Promise<PolkadotSignedPayment> {
  await ensureCryptoReady();

  const { encodeAddress, decodeAddress } = await import('@polkadot/util-crypto');
  const { u8aConcat, stringToU8a, bnToU8a, u8aToHex, hexToU8a } = await import('@polkadot/util');

  // SCALE encode the payload to match contract's expected format
  // Contract expects: from + to + amount + nonce + valid_until (all SCALE encoded)
  const fromBytes = decodeAddress(payload.from);
  const toBytes = decodeAddress(payload.to);

  // Amount as u128 (16 bytes, little-endian)
  const amountBn = BigInt(payload.amount);
  const amountBytes = bnToU8a(amountBn, { bitLength: 128, isLe: true });

  // Nonce as raw bytes (contract uses nonce.as_bytes())
  // In Rust, String.as_bytes() returns UTF-8 bytes, so "0x1a2b..." -> bytes for '0','x','1','a'...
  const nonceBytes = stringToU8a(payload.nonce);

  // validUntil as u64 (8 bytes, little-endian)
  const validUntilBytes = bnToU8a(payload.validUntil, { bitLength: 64, isLe: true });

  // Concatenate all parts (this matches the contract's verify_signature logic)
  const message = u8aConcat(
    fromBytes,
    toBytes,
    amountBytes,
    nonceBytes,
    validUntilBytes
  );

  // Debug: Log the message being signed
  console.log('DEBUG: Signing message:');
  console.log('  from bytes:', u8aToHex(fromBytes));
  console.log('  to bytes:', u8aToHex(toBytes));
  console.log('  amount bytes:', u8aToHex(amountBytes));
  console.log('  nonce bytes:', u8aToHex(nonceBytes));
  console.log('  validUntil bytes:', u8aToHex(validUntilBytes));
  console.log('  full message:', u8aToHex(message));

  // Sign the raw message (KeyringPair.sign will hash it with Blake2-256 automatically)
  const result = await signer.sign(message);
  console.log('  signature:', result.signature);
  console.log('  signature length:', result.signature.length);

  // Store the JSON payload for transport (server will reconstruct from individual fields)
  const payloadString = JSON.stringify(payload);

  return {
    payload: payloadString,
    signature: result.signature,
    signerPublicKey: signer.address,
  };
}

/**
 * Create X402 payment header from signed payment
 */
export function createX402Payment(
  signedPayment: PolkadotSignedPayment,
  network: PolkadotNetwork,
  asset?: string,
  x402Version: number = 1
): X402PolkadotPayment {
  return {
    x402Version,
    scheme: 'exact',
    network,
    payload: signedPayment,
    asset,
  };
}

/**
 * Encode X402 payment as base64 header value
 */
export function encodePaymentHeader(payment: X402PolkadotPayment): string {
  const jsonString = JSON.stringify(payment);
  return Buffer.from(jsonString).toString('base64');
}

/**
 * Decode X402 payment header
 */
export function decodePaymentHeader(headerValue: string): X402PolkadotPayment {
  const jsonString = Buffer.from(headerValue, 'base64').toString('utf-8');
  return JSON.parse(jsonString) as X402PolkadotPayment;
}

/**
 * Parse X402-PAYMENT-REQUIRED header
 */
export function parsePaymentRequired(headerValue: string): X402PaymentRequired {
  return JSON.parse(headerValue) as X402PaymentRequired;
}

/**
 * Create complete payment header from payment requirements
 * This is the main function that combines all steps
 */
export async function createPaymentHeader(
  signer: PolkadotSigner,
  paymentRequired: X402PaymentRequired,
  network?: PolkadotNetwork,
  validityMinutes: number = 5,
  x402Version: number = 1
): Promise<string> {
  // Use network from payment requirements or override
  const paymentNetwork = network || paymentRequired.network;

  // Create payload
  const payload = createPaymentPayload(
    signer.address,
    paymentRequired,
    validityMinutes
  );

  // Sign payload
  const signedPayment = await signPaymentPayload(payload, signer);

  // Create X402 payment structure
  const x402Payment = createX402Payment(
    signedPayment,
    paymentNetwork,
    paymentRequired.asset,
    x402Version
  );

  // Encode as base64
  return encodePaymentHeader(x402Payment);
}

/**
 * Verify a payment signature (for server-side use)
 */
export async function verifyPaymentSignature(
  payment: X402PolkadotPayment
): Promise<boolean> {
  try {
    const { blake2AsU8a, decodeAddress, signatureVerify } = await import('@polkadot/util-crypto');
    const { u8aConcat, stringToU8a, bnToU8a } = await import('@polkadot/util');

    // Ensure crypto is ready AFTER imports
    await ensureCryptoReady();
    const { payload, signature, signerPublicKey } = payment.payload;

    if (!signerPublicKey) {
      console.error('No signerPublicKey provided');
      return false;
    }

    // Parse the payload to reconstruct the signed message
    const parsedPayload: PolkadotPaymentPayload = JSON.parse(payload);

    // Reconstruct the SCALE-encoded message that was signed
    // This must match exactly what the client signed in signPaymentPayload()
    const fromBytes = decodeAddress(parsedPayload.from);
    const toBytes = decodeAddress(parsedPayload.to);
    const amountBytes = bnToU8a(BigInt(parsedPayload.amount), { bitLength: 128, isLe: true });
    const nonceBytes = stringToU8a(parsedPayload.nonce);
    const validUntilBytes = bnToU8a(parsedPayload.validUntil, { bitLength: 64, isLe: true });

    const message = u8aConcat(
      fromBytes,
      toBytes,
      amountBytes,
      nonceBytes,
      validUntilBytes
    );

    // Hash the message with Blake2-256 (same as client)
    const hash = blake2AsU8a(message, 256);

    // Verify the signature against the hash
    const result = signatureVerify(
      hash,
      signature,
      signerPublicKey
    );

    console.log('Signature verification result:', result.isValid);

    // Check that signer matches the 'from' address
    return result.isValid && parsedPayload.from === signerPublicKey;
  } catch (error) {
    console.error('Payment signature verification failed:', error);
    return false;
  }
}

/**
 * Check if payment has expired
 */
export function isPaymentExpired(payment: X402PolkadotPayment): boolean {
  try {
    const parsedPayload: PolkadotPaymentPayload = JSON.parse(
      payment.payload.payload
    );
    return Date.now() > parsedPayload.validUntil;
  } catch {
    return true;
  }
}
