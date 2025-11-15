import { ApiPromise, WsProvider } from '@polkadot/api';
import { ContractPromise } from '@polkadot/api-contract';
import { Keyring } from '@polkadot/keyring';
import dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

const WS_ENDPOINT = process.env.WS_ENDPOINT || 'ws://localhost:9944';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '5CR7oWebzRjmYrACqiYhh4G7vX4yZnCxT4ZaucYU9mCNvXGM';

async function main() {
  console.log('💰 Funding Bob with HTTPUSD tokens...\n');

  const contractMetadata = JSON.parse(fs.readFileSync('./contracts/target/ink/httpusd.json', 'utf8'));

  const wsProvider = new WsProvider(WS_ENDPOINT);
  const api = await ApiPromise.create({ provider: wsProvider });
  await api.isReady;

  const contract = new ContractPromise(api, contractMetadata, CONTRACT_ADDRESS);
  const keyring = new Keyring({ type: 'sr25519' });

  const alice = keyring.addFromUri('//Alice');
  const bob = keyring.addFromUri('//Bob');

  console.log('From: Alice (' + alice.address + ')');
  console.log('To:   Bob   (' + bob.address + ')');
  console.log('Amount: 500000000000 (500 tokens)\n');

  // Transfer 500 tokens from Alice to Bob
  const amount = '500000000000'; // 500 tokens

  const tx = contract.tx.transfer(
    {
      gasLimit: api.registry.createType('WeightV2', {
        refTime: 300_000_000_000n,
        proofSize: 500_000n,
      }),
      storageDepositLimit: null,
    },
    bob.address,
    amount
  );

  return new Promise((resolve, reject) => {
    tx.signAndSend(alice, (result) => {
      if (result.status.isInBlock) {
        console.log('✅ Transfer included in block: ' + result.status.asInBlock.toHex());

        if (result.dispatchError) {
          if (result.dispatchError.isModule) {
            const decoded = api.registry.findMetaError(result.dispatchError.asModule);
            console.error('❌ Error: ' + decoded.section + '.' + decoded.name + ': ' + decoded.docs.join(' '));
            reject(new Error(decoded.section + '.' + decoded.name));
          } else {
            console.error('❌ Error: ' + result.dispatchError.toString());
            reject(result.dispatchError);
          }
        } else {
          console.log('✅ Transfer successful!');
          console.log('\nBob should now have 100,000 HTTPUSD tokens.\n');
          resolve();
        }
      } else if (result.status.isFinalized) {
        console.log('✅ Transfer finalized in block: ' + result.status.asFinalized.toHex());
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
