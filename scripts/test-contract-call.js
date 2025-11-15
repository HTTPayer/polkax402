import { ApiPromise, WsProvider } from '@polkadot/api';
import { ContractPromise } from '@polkadot/api-contract';
import { Keyring } from '@polkadot/keyring';
import { u8aConcat, stringToU8a, bnToU8a, u8aToHex, hexToU8a } from '@polkadot/util';
import * as fs from 'fs';

const WS_ENDPOINT = 'ws://localhost:9944';
const CONTRACT_ADDRESS = '5G1rQ7r6rNbJhCd55NFrfXBGZ7hjxVCmN1c9rd75TzkshDou';

async function main() {
  console.log('Testing contract call directly...\n');

  const contractMetadata = JSON.parse(fs.readFileSync('./contracts/target/ink/httpusd.json', 'utf8'));

  const wsProvider = new WsProvider(WS_ENDPOINT);
  const api = await ApiPromise.create({ provider: wsProvider });
  await api.isReady;

  const contract = new ContractPromise(api, contractMetadata, CONTRACT_ADDRESS);
  const keyring = new Keyring({ type: 'sr25519' });

  const bob = keyring.addFromUri('//Bob');
  const alice = keyring.addFromUri('//Alice');

  // Create test payment
  const from = bob.publicKey;
  const to = alice.publicKey;
  const amount = 100000000000n;
  const nonce = "0xTEST12345678";
  const validUntil = Date.now() + 300000; // 5 minutes from now

  // Build message
  const amountBytes = bnToU8a(amount, { bitLength: 128, isLe: true });
  const nonceBytes = stringToU8a(nonce);
  const validUntilBytes = bnToU8a(validUntil, { bitLength: 64, isLe: true });
  const message = u8aConcat(from, to, amountBytes, nonceBytes, validUntilBytes);

  console.log('Payment details:');
  console.log('  From:', bob.address);
  console.log('  To:', alice.address);
  console.log('  Amount:', amount.toString());
  console.log('  Nonce:', nonce);
  console.log('  Valid until:', new Date(validUntil).toLocaleString());
  console.log();

  // Sign
  const signature = bob.sign(message);
  const signatureHex = `0x${Buffer.from(signature).toString('hex')}`;

  console.log('Signature:');
  console.log('  Hex:', signatureHex);
  console.log('  Length:', signature.length, 'bytes');
  console.log();

  // Try calling the contract
  console.log('Calling contract.transferWithAuthorization...');

  const tx = contract.tx.transferWithAuthorization(
    {
      gasLimit: api.registry.createType('WeightV2', {
        refTime: 300_000_000_000n,
        proofSize: 500_000n,
      }),
      storageDepositLimit: null,
    },
    bob.address,      // from
    alice.address,    // to
    amount.toString(),// amount
    validUntil,       // validUntil
    nonce,            // nonce
    signatureHex      // signature as hex string
  );

  const result = await new Promise((resolve, reject) => {
    tx.signAndSend(alice, (callResult) => {
      if (callResult.status.isInBlock) {
        console.log(`In block: ${callResult.status.asInBlock.toHex()}`);

        if (callResult.dispatchError) {
          if (callResult.dispatchError.isModule) {
            const decoded = api.registry.findMetaError(callResult.dispatchError.asModule);
            console.log(`❌ Error: ${decoded.section}.${decoded.name}: ${decoded.docs.join(' ')}`);
            reject(new Error(`${decoded.section}.${decoded.name}`));
          } else {
            console.log(`❌ Error: ${callResult.dispatchError.toString()}`);
            reject(callResult.dispatchError);
          }
        } else {
          console.log('✅ Transaction successful!');
          resolve();
        }
      } else if (callResult.status.isFinalized) {
        console.log(`✅ Finalized: ${callResult.status.asFinalized.toHex()}`);
        api.disconnect();
        process.exit(0);
      }
    }).catch(reject);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
