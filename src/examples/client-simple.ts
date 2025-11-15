/**
 * Simple X402 Client Example
 *
 * This example demonstrates how to make requests to X402-protected endpoints
 * and handle payments through the facilitator.
 */

import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import {
  createPaymentPayload,
  signPaymentPayload,
  createX402Payment,
  encodePaymentHeader,
  parsePaymentRequired,
} from '../utils/payment.js';
import type { PolkadotSigner, X402PaymentRequired } from '../types/index.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'http://localhost:4000';

/**
 * Make a request to an X402-protected endpoint
 */
async function makeProtectedRequest(
  endpoint: string,
  signer: PolkadotSigner
): Promise<void> {
  console.log(`\n📡 Requesting: ${endpoint}`);
  console.log('━'.repeat(60));

  try {
    // Step 1: Make initial request
    console.log('1️⃣  Making initial request...');
    let response = await fetch(endpoint);

    // Check if payment is required
    if (response.status !== 402) {
      const data = await response.json();
      console.log('✅ Success (no payment required):', data);
      return;
    }

    console.log('💰 Payment required (402)');

    // Step 2: Parse payment requirements from response body (X402 spec)
    const responseBody = await response.json();

    // X402 spec: response body has { x402Version, accepts: [...], error? }
    if (!responseBody.accepts || !Array.isArray(responseBody.accepts) || responseBody.accepts.length === 0) {
      throw new Error('Invalid X402 Payment Required response: missing accepts array');
    }

    // Use the first payment option from accepts array
    const paymentRequired: X402PaymentRequired = responseBody.accepts[0];
    console.log('2️⃣  Payment details:');
    console.log(`   Pay to:  ${paymentRequired.payTo}`);
    console.log(`   Amount:  ${paymentRequired.maxAmountRequired} (smallest unit)`);
    console.log(`   Network: ${paymentRequired.network}`);

    // Step 3: Create and sign payment
    console.log('3️⃣  Creating payment authorization...');
    // Convert server's maxTimeoutSeconds to minutes for createPaymentPayload
    const validityMinutes = paymentRequired.maxTimeoutSeconds
      ? paymentRequired.maxTimeoutSeconds / 60
      : 5;
    const payload = createPaymentPayload(signer.address, paymentRequired, validityMinutes);
    const signedPayment = await signPaymentPayload(payload, signer);
    const x402Payment = createX402Payment(
      signedPayment,
      paymentRequired.network,
      paymentRequired.asset,
      1
    );

    console.log(`   From:    ${payload.from}`);
    console.log(`   Nonce:   ${payload.nonce}`);
    console.log(`   Valid:   ${new Date(payload.validUntil).toLocaleString()}`);

    // Step 4: Retry request with payment authorization
    // The SERVER will forward to facilitator for execution
    console.log('4️⃣  Retrying request with payment authorization...');
    const paymentHeader = encodePaymentHeader(x402Payment);

    response = await fetch(endpoint, {
      headers: {
        'X-Payment': paymentHeader,
      },
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('✅ Success! Response:', JSON.stringify(data, null, 2));

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
  }

  console.log('━'.repeat(60));
}

/**
 * Main function
 */
async function main() {
  console.log('\n🚀 X402 Client Example - Starting...\n');

  // Initialize crypto
  await cryptoWaitReady();

  // Create keyring and load account
  const keyring = new Keyring({ type: 'sr25519' });

  // Use Bob's account for testing (in production, use a real account)
  const account = keyring.addFromUri('//Bob');

  console.log('👤 Client Account:', account.address);
  console.log('🌐 Server:', SERVER_URL);
  console.log('🔄 Facilitator:', FACILITATOR_URL);

  // Create signer
  const signer: PolkadotSigner = {
    address: account.address,
    sign: async (payload: string | Uint8Array) => {
      // The contract hashes with Blake2-256 before verifying,
      // so we need to hash before signing to match
      const { blake2AsU8a } = await import('@polkadot/util-crypto');
      const message = typeof payload === 'string' ? Buffer.from(payload, 'hex') : payload;
      const hash = blake2AsU8a(message, 256);
      const signature = account.sign(hash);
      return { signature: `0x${Buffer.from(signature).toString('hex')}` };
    },
  };

  // Test 1: Free endpoint
  console.log('\n📋 TEST 1: Free endpoint');
  console.log('━'.repeat(60));
  const healthResponse = await fetch(`${SERVER_URL}/health`);
  const healthData = await healthResponse.json();
  console.log('✅ Health check:', healthData);

  // Test 2: Protected endpoint
  console.log('\n📋 TEST 2: Protected endpoint');
  await makeProtectedRequest(`${SERVER_URL}/api/premium/data`, signer);

  // Test 3: Dynamic pricing endpoint
  console.log('\n📋 TEST 3: Dynamic pricing endpoint (complexity=2)');
  await makeProtectedRequest(`${SERVER_URL}/api/premium/compute?complexity=1`, signer);

  console.log('\n✅ All tests complete!\n');
}

// Run the client
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
