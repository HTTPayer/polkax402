/**
 * X402 Facilitator Service - Local Node Implementation
 *
 * This facilitator service executes signed payment authorizations on the HTTPUSD contract.
 */
import express from 'express';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { ContractPromise } from '@polkadot/api-contract';
import { Keyring } from '@polkadot/keyring';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const PORT = parseInt(process.env.PORT || '4000', 10);
const WS_ENDPOINT = process.env.WS_ENDPOINT || 'ws://localhost:9944';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const FACILITATOR_SEED = process.env.FACILITATOR_SEED || '//Alice';

if (!CONTRACT_ADDRESS) {
  throw new Error('CONTRACT_ADDRESS not set in .env file');
}

interface PaymentRequest {
  from: string;
  to: string;
  amount: string;
  nonce: string;
  validUntil: number;
  signature: string;
  network?: string;
}

interface ExecutionResult {
  ok: boolean;
  confirmed?: boolean;
  error?: string;
  blockNumber?: number;
  blockHash?: string;
  extrinsicHash?: string;
}

async function main() {
  console.log('🚀 X402 Facilitator Service - Initializing...\n');

  // Load contract metadata
  const contractPath = path.join(__dirname, '../../contracts/target/ink/httpusd.json');
  const contractMetadata = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

  console.log('📦 Contract metadata loaded');

  // Connect to local node
  console.log(`🔌 Connecting to ${WS_ENDPOINT}...`);
  const wsProvider = new WsProvider(WS_ENDPOINT);
  const api = await ApiPromise.create({ provider: wsProvider });

  await api.isReady;
  const chain = await api.rpc.system.chain();
  const version = await api.rpc.system.version();

  console.log(`✅ Connected to ${chain} v${version}`);

  // Setup facilitator account
  const keyring = new Keyring({ type: 'sr25519' });
  const facilitatorAccount = keyring.addFromUri(FACILITATOR_SEED);

  console.log(`👤 Facilitator: ${facilitatorAccount.address}`);

  // Create contract instance
  const contract = new ContractPromise(api, contractMetadata, CONTRACT_ADDRESS!);

  console.log(`📝 Contract: ${CONTRACT_ADDRESS}\n`);

  // Create Express app
  const app = express();
  app.use(express.json());

  // Health check endpoint
  app.get('/health', async (req, res) => {
    try {
      const health = await api.rpc.system.health();
      res.json({
        ok: true,
        chain: chain.toString(),
        version: version.toString(),
        facilitator: facilitatorAccount.address,
        contract: CONTRACT_ADDRESS,
        peers: health.peers.toNumber(),
        isSyncing: health.isSyncing.isTrue,
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Execute payment endpoint
  app.post('/execute', async (req, res) => {
    const payment = req.body as PaymentRequest;

    console.log('\n💳 Payment request received:');
    console.log(`   From: ${payment.from}`);
    console.log(`   To: ${payment.to}`);
    console.log(`   Amount: ${payment.amount}`);
    console.log(`   Nonce: ${payment.nonce}`);

    try {
      // Validate request
      if (!payment.from || !payment.to || !payment.amount || !payment.nonce || !payment.signature) {
        throw new Error('Missing required fields');
      }

      // Check if nonce already used
      const { result: queryResult, output } = await contract.query.isNonceUsed(
        facilitatorAccount.address,
        {
          gasLimit: api.registry.createType('WeightV2', {
            refTime: 100_000_000_000n,
            proofSize: 100_000n,
          }) as any,
          storageDepositLimit: null,
        },
        payment.from,
        payment.nonce
      );

      if (queryResult.isOk && output) {
        const isUsed = output.toHuman();
        if (isUsed === true || isUsed === 'true') {
          throw new Error('Nonce already used');
        }
      }

      // Execute payment on contract
      console.log('   ⏳ Executing on-chain...');

      const tx = contract.tx.transferWithAuthorization(
        {
          gasLimit: api.registry.createType('WeightV2', {
            refTime: 300_000_000_000n,
            proofSize: 500_000n,
          }) as any,
          storageDepositLimit: null,
        },
        payment.from,
        payment.to,
        payment.amount,
        payment.validUntil,
        payment.nonce,
        payment.signature
      );

      // Sign and send transaction
      const executionResult: ExecutionResult = await new Promise((resolve, reject) => {
        let unsub: () => void;

        tx.signAndSend(facilitatorAccount, (callResult) => {
          const { status, events, dispatchError } = callResult;

          // Transaction is in block
          if (status.isInBlock) {
            console.log(`   📦 In block: ${status.asInBlock.toHex()}`);

            // Check for errors
            if (dispatchError) {
              let errorMessage = 'Unknown error';

              if (dispatchError.isModule) {
                const decoded = api.registry.findMetaError(dispatchError.asModule);
                errorMessage = `${decoded.section}.${decoded.name}: ${decoded.docs.join(' ')}`;
              } else {
                errorMessage = dispatchError.toString();
              }

              console.log(`   ❌ Error: ${errorMessage}`);
              if (unsub) unsub();
              resolve({
                ok: false,
                error: errorMessage,
              });
              return;
            }

            // Check contract events
            let contractError: string | undefined;
            events.forEach(({ event }) => {
              if (api.events.contracts.ContractEmitted.is(event)) {
                console.log(`   📢 Contract event emitted`);
              }
              if (api.events.system.ExtrinsicFailed.is(event)) {
                contractError = 'Contract execution failed';
              }
            });

            if (contractError) {
              console.log(`   ❌ ${contractError}`);
              if (unsub) unsub();
              resolve({
                ok: false,
                error: contractError,
              });
              return;
            }
          }

          // Transaction is finalized
          if (status.isFinalized) {
            console.log(`   ✅ Finalized: ${status.asFinalized.toHex()}`);

            if (unsub) unsub();
            resolve({
              ok: true,
              confirmed: true,
              blockHash: status.asFinalized.toHex(),
              extrinsicHash: tx.hash.toHex(),
            });
          }
        })
          .then((unsubscribe) => {
            unsub = unsubscribe;
          })
          .catch((error) => {
            console.log(`   ❌ Transaction failed: ${error.message}`);
            reject(error);
          });
      });

      res.json(executionResult);
    } catch (error) {
      console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Start server
  app.listen(PORT, () => {
    console.log('🚀 X402 Facilitator Service - LIVE');
    console.log(`📡 Listening:  http://localhost:${PORT}`);
    console.log(`📝 Contract:   ${CONTRACT_ADDRESS}`);
    console.log(`👤 Facilitator: ${facilitatorAccount.address}`);
    console.log(`\n💡 Endpoints:`);
    console.log(`   GET  /health  - Health check`);
    console.log(`   POST /execute - Execute payment\n`);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
