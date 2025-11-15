import { ApiPromise, WsProvider } from '@polkadot/api';
import { ContractPromise } from '@polkadot/api-contract';
import { Keyring } from '@polkadot/keyring';
import dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

const WS_ENDPOINT = process.env.WS_ENDPOINT || 'ws://localhost:9944';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '5CR7oWebzRjmYrACqiYhh4G7vX4yZnCxT4ZaucYU9mCNvXGM';

async function main() {
  const contractMetadata = JSON.parse(fs.readFileSync('./contracts/target/ink/httpusd.json', 'utf8'));

  const wsProvider = new WsProvider(WS_ENDPOINT);
  const api = await ApiPromise.create({ provider: wsProvider });
  await api.isReady;

  const contract = new ContractPromise(api, contractMetadata, CONTRACT_ADDRESS);
  const keyring = new Keyring({ type: 'sr25519' });

  const alice = keyring.addFromUri('//Alice');
  const bob = keyring.addFromUri('//Bob');

  console.log('Checking HTTPUSD token balances:\n');

  // Check Alice balance
  const aliceQuery = await contract.query.balanceOf(
    alice.address,
    { gasLimit: api.registry.createType('WeightV2', { refTime: 100_000_000_000n, proofSize: 100_000n }) },
    alice.address
  );

  if (aliceQuery.result.isOk && aliceQuery.output) {
    console.log('Alice (' + alice.address + '):');
    console.log('  Balance: ' + aliceQuery.output.toString());
    console.log('  Balance (decoded): ' + JSON.stringify(aliceQuery.output.toJSON()));
  }

  // Check Bob balance
  const bobQuery = await contract.query.balanceOf(
    bob.address,
    { gasLimit: api.registry.createType('WeightV2', { refTime: 100_000_000_000n, proofSize: 100_000n }) },
    bob.address
  );

  if (bobQuery.result.isOk && bobQuery.output) {
    console.log('\nBob (' + bob.address + '):');
    console.log('  Balance: ' + bobQuery.output.toString());
    console.log('  Balance (decoded): ' + JSON.stringify(bobQuery.output.toJSON()));
  }

  // Check total supply
  const supplyQuery = await contract.query.totalSupply(
    alice.address,
    { gasLimit: api.registry.createType('WeightV2', { refTime: 100_000_000_000n, proofSize: 100_000n }) }
  );

  if (supplyQuery.result.isOk && supplyQuery.output) {
    console.log('\nTotal Supply: ' + supplyQuery.output.toString());
    console.log('Total Supply (decoded): ' + JSON.stringify(supplyQuery.output.toJSON()) + '\n');
  }

  await api.disconnect();
}

main().catch(console.error);
