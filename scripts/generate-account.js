#!/usr/bin/env node
/**
 * Simple Polkadot account generator for local development
 *
 * Usage:
 *   node scripts/generate-account.js
 *   node scripts/generate-account.js --network kusama
 */

import { cryptoWaitReady, mnemonicGenerate } from '@polkadot/util-crypto';
import { Keyring } from '@polkadot/keyring';

await cryptoWaitReady();

// Parse command line args
const args = process.argv.slice(2);
const networkIndex = args.indexOf('--network');
const network = networkIndex >= 0 ? args[networkIndex + 1] : 'polkadot';

// SS58 prefixes for different networks
const SS58_FORMATS = {
  polkadot: 0,
  kusama: 2,
  westend: 42,
  rococo: 42,
  substrate: 42,
};

const ss58Format = SS58_FORMATS[network] ?? 0;

console.log('\n🔑 Generating new Polkadot account...\n');

// Generate mnemonic (12-word seed phrase)
const mnemonic = mnemonicGenerate(12);

// Create keyring with network prefix
const keyring = new Keyring({
  type: 'sr25519',
  ss58Format
});

// Create account from mnemonic
const account = keyring.addFromMnemonic(mnemonic);

console.log('═══════════════════════════════════════════════════════════');
console.log('📋 ACCOUNT DETAILS');
console.log('═══════════════════════════════════════════════════════════');
console.log(`Network:        ${network.toUpperCase()}`);
console.log(`Crypto Type:    SR25519`);
console.log('───────────────────────────────────────────────────────────');
console.log(`Seed Phrase:    ${mnemonic}`);
console.log('───────────────────────────────────────────────────────────');
console.log(`Address:        ${account.address}`);
console.log(`Public Key:     ${Buffer.from(account.publicKey).toString('hex')}`);
console.log('═══════════════════════════════════════════════════════════\n');

console.log('⚠️  IMPORTANT:');
console.log('   • Store the seed phrase securely');
console.log('   • Never share your seed phrase');
console.log('   • This is for development/testing only\n');

console.log('📝 Usage in code:');
console.log(`   const account = keyring.addFromUri('${mnemonic}');\n`);

console.log('💡 Environment variable:');
console.log(`   POLKADOT_SEED="${mnemonic}"\n`);
