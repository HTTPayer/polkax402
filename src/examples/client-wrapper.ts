/**
 * Simple X402 Client Example using wrapFetchWithPayment
 *
 * This example demonstrates the simplified API for making requests
 * to X402-protected endpoints using the fetch wrapper.
 */

import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { wrapFetchWithPayment, createPolkadotSigner } from '../index.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

/**
 * Main function
 */
async function main() {
  console.log('\n🚀 X402 Client Wrapper Example - Starting...\n');

  // Initialize crypto
  await cryptoWaitReady();

  // Create keyring and load account
  const keyring = new Keyring({ type: 'sr25519' });
  const account = keyring.addFromUri('//Bob');

  console.log('👤 Client Account:', account.address);
  console.log('🌐 Server:', SERVER_URL);

  // Create signer using helper function
  const signer = createPolkadotSigner(account);

  // Wrap fetch with payment handling
  const fetchWithPay = wrapFetchWithPayment(fetch, signer);

  // Test 1: Free endpoint (no payment required)
  console.log('\n📋 TEST 1: Free endpoint');
  console.log('━'.repeat(60));
  const healthResponse = await fetchWithPay(`${SERVER_URL}/health`);
  const healthData = await healthResponse.json();
  console.log('✅ Health check:', healthData);

  // Test 2: Protected endpoint (payment required)
  console.log('\n📋 TEST 2: Protected endpoint');
  console.log('━'.repeat(60));
  try {
    const response = await fetchWithPay(`${SERVER_URL}/api/premium/data`);
    const data = await response.json();
    console.log('✅ Success! Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
  }

  // Test 3: Dynamic pricing endpoint
  console.log('\n📋 TEST 3: Dynamic pricing endpoint (complexity=1)');
  console.log('━'.repeat(60));
  try {
    const response = await fetchWithPay(`${SERVER_URL}/api/premium/compute?complexity=1`);
    const data = await response.json();
    console.log('✅ Success! Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
  }

  console.log('\n✅ All tests complete!\n');
}

// Run the client
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
