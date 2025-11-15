import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { blake2AsU8a, signatureVerify } from '@polkadot/util-crypto';
import { u8aConcat, stringToU8a, bnToU8a, u8aToHex } from '@polkadot/util';

async function main() {
  await cryptoWaitReady();

  const keyring = new Keyring({ type: 'sr25519' });
  const bob = keyring.addFromUri('//Bob');

  console.log('Testing signature creation and verification\n');

  // Create test payload
  const from = bob.publicKey;  // 32 bytes
  const to = keyring.addFromUri('//Alice').publicKey;  // 32 bytes
  const amount = 100000000000n;
  const nonce = "0xcf1022b57ddc6beaa4e87d1e57685cda";
  const validUntil = 1731627413019;

  // Build message exactly like contract
  const amountBytes = bnToU8a(amount, { bitLength: 128, isLe: true });
  const nonceBytes = stringToU8a(nonce);
  const validUntilBytes = bnToU8a(validUntil, { bitLength: 64, isLe: true });

  const message = u8aConcat(from, to, amountBytes, nonceBytes, validUntilBytes);

  console.log('Message components:');
  console.log('  from:', u8aToHex(from));
  console.log('  to:', u8aToHex(to));
  console.log('  amount:', u8aToHex(amountBytes));
  console.log('  nonce:', u8aToHex(nonceBytes));
  console.log('  validUntil:', u8aToHex(validUntilBytes));
  console.log('  full message:', u8aToHex(message));
  console.log();

  // Hash the message (like contract does)
  const hash = blake2AsU8a(message, 256);
  console.log('Message hash (Blake2-256):', u8aToHex(hash));
  console.log();

  // Sign with Bob (this also hashes internally)
  const signature = bob.sign(message);
  console.log('Signature:', u8aToHex(signature));
  console.log('Signature length:', signature.length, 'bytes');
  console.log();

  // Verify signature
  const isValid = signatureVerify(message, signature, bob.publicKey).isValid;
  console.log('Signature valid (JS verification):', isValid);
  console.log();

  // Now test what the contract would see
  console.log('What contract sees:');
  console.log('  from (AccountId):', u8aToHex(from));
  console.log('  signature:', u8aToHex(signature));
  console.log('  hash:', u8aToHex(hash));
  console.log();

  // The contract does: sr25519_verify(signature, hash, from)
  // Which is equivalent to our signatureVerify check above
  console.log('Expected contract behavior: sr25519_verify should return Ok');
}

main().catch(console.error);
