/**
 * Generate development account addresses from standard Substrate seeds
 */
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';

const DEV_ACCOUNTS = [
  '//Alice',
  '//Bob',
  '//Charlie',
  '//Dave',
  '//Eve',
  '//Ferdie'
];

async function generateAccounts() {
  await cryptoWaitReady();

  const keyring = new Keyring({ type: 'sr25519' });
  const accounts = {};

  console.log('Substrate Development Accounts:\n');

  for (const seed of DEV_ACCOUNTS) {
    const account = keyring.addFromUri(seed);
    const name = seed.replace('//', '');

    accounts[name] = {
      seed: seed,
      address: account.address,
      publicKey: '0x' + Buffer.from(account.publicKey).toString('hex')
    };

    console.log(`${name}:`);
    console.log(`  Seed:      ${seed}`);
    console.log(`  Address:   ${account.address}`);
    console.log(`  PublicKey: 0x${Buffer.from(account.publicKey).toString('hex')}\n`);
  }

  console.log('\nJSON Format:\n');
  console.log(JSON.stringify(accounts, null, 2));

  return accounts;
}

generateAccounts().catch(console.error);
