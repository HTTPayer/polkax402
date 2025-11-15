import { ApiPromise, WsProvider } from '@polkadot/api';

const WS_ENDPOINT = 'ws://localhost:9944';

async function main() {
  const wsProvider = new WsProvider(WS_ENDPOINT);
  const api = await ApiPromise.create({ provider: wsProvider });
  await api.isReady;

  // Get current block timestamp
  const now = await api.query.timestamp.now();
  console.log('Blockchain timestamp (ms):', now.toString());
  console.log('JavaScript Date.now() (ms):', Date.now());
  console.log('Difference (ms):', Math.abs(Date.now() - parseInt(now.toString())));
  console.log();

  // Check if they're in the same range
  const jsTimestamp = Date.now();
  const blockTimestamp = parseInt(now.toString());

  if (Math.abs(jsTimestamp - blockTimestamp) < 60000) {
    console.log('✅ Timestamps are in the same unit (milliseconds)');
  } else {
    console.log('❌ Timestamps might be in different units!');
    console.log('   If block timestamp is in seconds:',blockTimestamp * 1000);
  }

  await api.disconnect();
}

main().catch(console.error);
