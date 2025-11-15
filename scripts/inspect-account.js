#!/usr/bin/env node
/**
 * Inspect a Polkadot account from seed phrase or test account
 *
 * Usage:
 *   node scripts/inspect-account.js "your twelve word seed phrase"
 *   node scripts/inspect-account.js //Alice
 *   node scripts/inspect-account.js --network kusama "seed phrase"
 */

import { cryptoWaitReady } from '@polkadot/util-crypto';
import { Keyring } from '@polkadot/keyring';

await cryptoWaitReady();

// Parse command line args
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('\n❌ Please provide a seed phrase or derivation path\n');
  console.log('Usage:');
  console.log('  node scripts/inspect-account.js "your seed phrase"');
  console.log('  node scripts/inspect-account.js //Alice');
  console.log('  node scripts/inspect-account.js --network kusama "seed phrase"\n');
  process.exit(1);
}

const networkIndex = args.indexOf('--network');
const network = networkIndex >= 0 ? args[networkIndex + 1] : 'polkadot';

// Get seed phrase (everything that's not --network or its value)
const seedArgs = args.filter((arg, i) => {
  if (arg === '--network') return false;
  if (networkIndex >= 0 && i === networkIndex + 1) return false;
  return true;
});

let seedPhrase = seedArgs.join(' ').trim();

// Handle common test accounts (case-insensitive)
const testAccounts = {
  'alice': '//Alice',
  'bob': '//Bob',
  'charlie': '//Charlie',
  'dave': '//Dave',
  'eve': '//Eve',
  'ferdie': '//Ferdie',
};

const lowerSeed = seedPhrase.toLowerCase();
if (testAccounts[lowerSeed]) {
  seedPhrase = testAccounts[lowerSeed];
}

// Fix Git Bash path mangling on Windows (//Alice becomes /Alice)
if (seedPhrase.startsWith('/') && !seedPhrase.startsWith('//')) {
  const possibleAccount = seedPhrase.slice(1).toLowerCase();
  if (testAccounts[possibleAccount]) {
    seedPhrase = testAccounts[possibleAccount];
  }
}

// Debug output
if (process.env.DEBUG) {
  console.log('DEBUG - args:', args);
  console.log('DEBUG - seedArgs:', seedArgs);
  console.log('DEBUG - seedPhrase:', JSON.stringify(seedPhrase));
}

// SS58 prefixes for different networks
const SS58_FORMATS = {
  polkadot: 0,
  kusama: 2,
  westend: 42,
  rococo: 42,
  paseo: 42,
  'asset-hub-polkadot': 0,
  'asset-hub-kusama': 2,
  'asset-hub-paseo': 42,
  substrate: 42,
};

const ss58Format = SS58_FORMATS[network] ?? 0;

try {
  // Create keyring with network prefix
  const keyring = new Keyring({
    type: 'sr25519',
    ss58Format
  });

  // Create account from seed (trim whitespace)
  const account = keyring.addFromUri(seedPhrase.trim());

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🔍 ACCOUNT INSPECTION');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Network:        ${network.toUpperCase()}`);
  console.log(`Crypto Type:    SR25519`);
  console.log('───────────────────────────────────────────────────────────');
  console.log(`Seed/Path:      ${seedPhrase}`);
  console.log('───────────────────────────────────────────────────────────');
  console.log(`Address:        ${account.address}`);
  console.log(`Public Key:     ${Buffer.from(account.publicKey).toString('hex')}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // Show addresses for all networks
  console.log('📍 Same account on other networks:');
  Object.entries(SS58_FORMATS).forEach(([net, format]) => {
    const kr = new Keyring({ type: 'sr25519', ss58Format: format });
    const acc = kr.addFromUri(seedPhrase);
    console.log(`   ${net.padEnd(12)} ${acc.address}`);
  });
  console.log('');

} catch (error) {
  console.error('\n❌ Error:', error.message, '\n');
  process.exit(1);
}
