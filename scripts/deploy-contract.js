import { ApiPromise, WsProvider } from '@polkadot/api';
import { CodePromise } from '@polkadot/api-contract';
import { Keyring } from '@polkadot/keyring';
import dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

// Network configurations
const NETWORKS = {
  dotx402: 'wss://bov424mc35ckd0qqjgd7cb6888.ingress.akash-palmito.org', // dotx402 network (deployed on Akash)
  paseo: 'wss://paseo-rpc.dwellir.com', // Paseo testnet (Polkadot contracts testnet)
  shibuya: 'wss://rpc.shibuya.astar.network', // Astar Shibuya testnet
};

const WS_ENDPOINT = process.env.DEPLOY_ENDPOINT || NETWORKS[process.env.DEPLOY_NETWORK] || NETWORKS.dotx402;
const DEPLOYER_SEED = process.env.DEPLOYER_SEED || '//Alice';

async function main() {
  console.log('🚀 Deploying HTTPUSD Contract...\n');
  console.log('🌐 Network:', WS_ENDPOINT);

  // Load contract metadata and WASM
  const contractMetadata = JSON.parse(fs.readFileSync('./contracts/target/ink/httpusd.json', 'utf8'));
  const contractWasm = fs.readFileSync('./contracts/target/ink/httpusd.wasm');

  const wsProvider = new WsProvider(WS_ENDPOINT);
  const api = await ApiPromise.create({ provider: wsProvider });
  await api.isReady;

  console.log('✅ Connected to:', (await api.rpc.system.chain()).toString());
  console.log('📡 Node version:', (await api.rpc.system.version()).toString(), '\n');

  const keyring = new Keyring({ type: 'sr25519' });
  const deployer = keyring.addFromUri(DEPLOYER_SEED);

  console.log('👤 Deploying from:', deployer.address);
  console.log('📦 Contract size:', contractWasm.length, 'bytes');

  // Check deployer balance
  const { data: balance } = await api.query.system.account(deployer.address);
  console.log('💰 Deployer balance:', balance.free.toHuman(), '\n');

  // Create code instance
  const code = new CodePromise(api, contractMetadata, contractWasm);

  // Constructor parameters
  const initialSupply = '1000000000000'; // 1 trillion smallest units
  const facilitatorFeeBps = 0; // 0% fee for testing

  console.log('Constructor parameters:');
  console.log('  Initial supply:', initialSupply);
  console.log('  Facilitator fee:', facilitatorFeeBps, 'bps (0%)\n');

  // Deploy
  console.log('⏳ Deploying contract...');

  const tx = code.tx.new(
    {
      gasLimit: api.registry.createType('WeightV2', {
        refTime: 500_000_000_000n,
        proofSize: 1_000_000n,
      }),
      storageDepositLimit: null,
    },
    initialSupply,
    facilitatorFeeBps
  );

  let contractAddress;

  await new Promise((resolve, reject) => {
    tx.signAndSend(deployer, (result) => {
      if (result.status.isInBlock) {
        console.log(`📦 In block: ${result.status.asInBlock.toHex()}`);

        if (result.dispatchError) {
          if (result.dispatchError.isModule) {
            const decoded = api.registry.findMetaError(result.dispatchError.asModule);
            console.error(`❌ Error: ${decoded.section}.${decoded.name}: ${decoded.docs.join(' ')}`);
            reject(new Error(`${decoded.section}.${decoded.name}`));
          } else {
            console.error(`❌ Error: ${result.dispatchError.toString()}`);
            reject(result.dispatchError);
          }
          return;
        }

        // Find Instantiated event
        result.events.forEach(({ event }) => {
          if (api.events.contracts.Instantiated.is(event)) {
            contractAddress = event.data.contract.toString();
            console.log('✅ Contract deployed!');
            console.log('📝 Address:', contractAddress);
          }
        });

      } else if (result.status.isFinalized) {
        console.log(`✅ Finalized: ${result.status.asFinalized.toHex()}\n`);

        if (contractAddress) {
          console.log('📋 Update your .env file:');
          console.log(`CONTRACT_ADDRESS=${contractAddress}\n`);
        }

        api.disconnect();
        resolve();
      }
    }).catch(reject);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
