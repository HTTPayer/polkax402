/**
 * Lightweight Block Explorer API for dotx402
 *
 * Provides REST endpoints to query blockchain data
 */

import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { ContractPromise } from '@polkadot/api-contract';
import type { SignedBlock, Header, EventRecord } from '@polkadot/types/interfaces';
import type { Vec } from '@polkadot/types';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { openApiSpec } from './openapi-spec.js';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.EXPLORER_PORT || 5000;
const WS_ENDPOINT = process.env.WS_ENDPOINT || "wss://rpc.polkax402.dpdns.org";
const NETWORK = process.env.NETWORK || "polkax402";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const API_BASE_URL = process.env.API_BASE_URL || '/api';

console.log(`Contract Address: ${CONTRACT_ADDRESS}`)

let api: ApiPromise;
let httpusdContract: ContractPromise | null = null;

// Initialize Polkadot API
async function initApi() {
  console.log('🔗 Connecting to:', WS_ENDPOINT);
  console.log(`📡 Network:        ${NETWORK}`)
  const wsProvider = new WsProvider(WS_ENDPOINT);
  api = await ApiPromise.create({ provider: wsProvider });
  await api.isReady;
  console.log('✅ Connected to:', (await api.rpc.system.chain()).toString());

  // Initialize HTTPUSD contract if address is provided
  if (CONTRACT_ADDRESS) {
    try {
      const contractPath = path.join(__dirname, '../../contracts/target/ink/httpusd.json');
      const contractMetadata = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
      httpusdContract = new ContractPromise(api, contractMetadata, CONTRACT_ADDRESS);
      console.log('💰 HTTPUSD Contract loaded:', CONTRACT_ADDRESS);
    } catch (error) {
      console.warn('⚠️  HTTPUSD Contract not loaded:', error instanceof Error ? error.message : String(error));
    }
  }
}

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Serve frontend UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve dynamic config
app.get('/config.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`window.EXPLORER_CONFIG = { API_BASE: '${API_BASE_URL}' };`);
});

// API Documentation
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'polkax402 Explorer API Documentation',
}));

// OpenAPI spec endpoint (JSON)
app.get('/openapi.json', (req, res) => {
  res.json(openApiSpec);
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'polkax402 Block Explorer API',
    network: WS_ENDPOINT,
  });
});

// Get chain info
app.get('/api/chain', async (req, res) => {
  try {
    const [chain, nodeName, nodeVersion, header] = await Promise.all([
      api.rpc.system.chain(),
      api.rpc.system.name(),
      api.rpc.system.version(),
      api.rpc.chain.getHeader(),
    ]);

    res.json({
      chain: chain.toString(),
      network: NETWORK,
      nodeName: nodeName.toString(),
      nodeVersion: nodeVersion.toString(),
      bestBlock: header.number.toNumber(),
      bestBlockHash: header.hash.toHex(),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch chain info',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get latest blocks
app.get('/api/blocks', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const currentHeader = await api.rpc.chain.getHeader();
    const currentNumber = currentHeader.number.toNumber();

    const blocks = [];
    for (let i = 0; i < limit; i++) {
      const blockNumber = currentNumber - i;
      if (blockNumber < 0) break;

      const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
      const [block, header] = await Promise.all([
        api.rpc.chain.getBlock(blockHash),
        api.rpc.chain.getHeader(blockHash),
      ]);

      blocks.push({
        number: blockNumber,
        hash: blockHash.toHex(),
        parentHash: header.parentHash.toHex(),
        stateRoot: header.stateRoot.toHex(),
        extrinsicsRoot: header.extrinsicsRoot.toHex(),
        extrinsicsCount: block.block.extrinsics.length,
        timestamp: await getBlockTimestamp(block.block.extrinsics),
      });
    }

    res.json({
      blocks,
      total: currentNumber + 1,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch blocks',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get block by number or hash
app.get('/api/blocks/:numberOrHash', async (req, res) => {
  try {
    const { numberOrHash } = req.params;

    // Determine if input is a number or hash
    let blockHash;
    if (numberOrHash.startsWith('0x')) {
      blockHash = numberOrHash;
    } else {
      const blockNumber = parseInt(numberOrHash);
      blockHash = await api.rpc.chain.getBlockHash(blockNumber);
    }

    const [block, header, events] = await Promise.all([
      api.rpc.chain.getBlock(blockHash),
      api.rpc.chain.getHeader(blockHash),
      api.query.system.events.at(blockHash),
    ]);

    const extrinsics = block.block.extrinsics.map((ext, index) => ({
      index,
      hash: ext.hash.toHex(),
      method: `${ext.method.section}.${ext.method.method}`,
      args: ext.method.args.map(arg => arg.toString()),
      signer: ext.signer.toString(),
      isSigned: ext.isSigned,
    }));

    const eventsVec = events as Vec<EventRecord>;
    const blockEvents = eventsVec.map((record: EventRecord) => ({
      phase: record.phase.toString(),
      section: record.event.section,
      method: record.event.method,
      data: record.event.data.toString(),
    }));

    res.json({
      number: header.number.toNumber(),
      hash: blockHash.toString(),
      parentHash: header.parentHash.toHex(),
      stateRoot: header.stateRoot.toHex(),
      extrinsicsRoot: header.extrinsicsRoot.toHex(),
      timestamp: await getBlockTimestamp(block.block.extrinsics),
      extrinsics,
      events: blockEvents,
    });
  } catch (error) {
    res.status(404).json({
      error: 'Block not found',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Helper: Format balance with decimals
function formatBalanceWithDecimals(rawAmount: string, decimals: number): string {
  const amount = BigInt(rawAmount);
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  const fractionStr = fraction.toString().padStart(decimals, '0');

  // Trim trailing zeros but keep at least 4 decimal places
  let trimmed = fractionStr.substring(0, 4);
  if (fractionStr.length > 4) {
    const remaining = fractionStr.substring(4).replace(/0+$/, '');
    if (remaining) {
      trimmed = fractionStr.replace(/0+$/, '');
    }
  }

  return `${whole}.${trimmed}`;
}

// Get account info (native token balance)
app.get('/api/accounts/:address', async (req, res) => {
  try {
    const { address } = req.params;

    const [accountInfo, nonce] = await Promise.all([
      api.query.system.account(address),
      api.rpc.system.accountNextIndex(address),
    ]);

    const account = accountInfo as any;
    const NATIVE_DECIMALS = 12;

    res.json({
      address,
      nonce: nonce.toNumber(),
      balance: {
        type: 'native',
        description: 'Native token balance (used for gas fees)',
        free: account.data.free.toString(),
        reserved: account.data.reserved.toString(),
        frozen: account.data.frozen.toString(),
        freeHuman: formatBalanceWithDecimals(account.data.free.toString(), NATIVE_DECIMALS),
        reservedHuman: formatBalanceWithDecimals(account.data.reserved.toString(), NATIVE_DECIMALS),
        frozenHuman: formatBalanceWithDecimals(account.data.frozen.toString(), NATIVE_DECIMALS),
      },
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch account info',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get HTTPUSD token balance for account
app.get('/api/accounts/:address/httpusd', async (req, res) => {
  try {
    const { address } = req.params;

    if (!httpusdContract) {
      return res.status(503).json({
        error: 'HTTPUSD contract not available',
        details: 'CONTRACT_ADDRESS not configured or contract metadata not found',
      });
    }

    // Query the balance_of function from the PSP22 contract
    const { result, output } = await httpusdContract.query.balanceOf(
      address, // caller (can be any address for read-only queries)
      {
        gasLimit: api.registry.createType('WeightV2', {
          refTime: 100_000_000_000n,
          proofSize: 100_000n,
        }) as any,
        storageDepositLimit: null,
      },
      address // account to check balance for
    );

    if (result.isErr) {
      throw new Error('Contract query failed');
    }

    const HTTPUSD_DECIMALS = 9;

    // Extract the actual value from the Result type
    const outputJson = output?.toJSON() as any;
    const rawBalance = (outputJson?.ok !== undefined ? outputJson.ok : output?.toString() || '0').toString();

    res.json({
      address,
      token: 'HTTPUSD',
      contractAddress: CONTRACT_ADDRESS,
      balance: rawBalance,
      balanceHuman: formatBalanceWithDecimals(rawBalance, HTTPUSD_DECIMALS),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch HTTPUSD balance',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get transaction history for an address
app.get('/api/accounts/:address/transactions', async (req, res) => {
  try {
    const { address } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const scanDepth = Math.min(parseInt(req.query.scanDepth as string) || 1000, 10000);

    const currentHeader = await api.rpc.chain.getHeader();
    const currentNumber = currentHeader.number.toNumber();

    const transactions = [];
    let scannedBlocks = 0;

    // Scan recent blocks for transactions involving this address
    for (let i = 0; i < scanDepth && transactions.length < limit; i++) {
      const blockNumber = currentNumber - i;
      if (blockNumber < 0) break;

      scannedBlocks++;
      const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
      const [block, events] = await Promise.all([
        api.rpc.chain.getBlock(blockHash),
        api.query.system.events.at(blockHash),
      ]);

      // Check each extrinsic in the block
      for (let extIndex = 0; extIndex < block.block.extrinsics.length; extIndex++) {
        const ext = block.block.extrinsics[extIndex];

        // Check if this address is the signer
        const isSigner = ext.signer.toString() === address;

        // Check if this address is involved in the transaction
        // (you could extend this to check args for recipient addresses)
        if (isSigner) {
          const eventsVec = events as Vec<EventRecord>;
          const extrinsicEvents = eventsVec.filter(
            (record: EventRecord) => record.phase.isApplyExtrinsic &&
            record.phase.asApplyExtrinsic.toNumber() === extIndex
          );

          // Determine if transaction was successful
          const failed = extrinsicEvents.some((record: EventRecord) =>
            record.event.section === 'system' && record.event.method === 'ExtrinsicFailed'
          );

          transactions.push({
            hash: ext.hash.toHex(),
            blockNumber,
            blockHash: blockHash.toHex(),
            timestamp: await getBlockTimestamp(block.block.extrinsics),
            index: extIndex,
            method: `${ext.method.section}.${ext.method.method}`,
            section: ext.method.section,
            methodName: ext.method.method,
            signer: ext.signer.toString(),
            args: ext.method.args.map(arg => arg.toString()),
            success: !failed,
            events: extrinsicEvents.length,
          });

          if (transactions.length >= limit) break;
        }
      }
    }

    res.json({
      address,
      transactions,
      count: transactions.length,
      scannedBlocks,
      note: `Scanned last ${scannedBlocks} blocks. For complete history, use a blockchain indexer.`,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch transaction history',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get token info (total supply, etc.)
app.get('/api/tokens/httpusd', async (req, res) => {
  try {
    if (!httpusdContract) {
      return res.status(503).json({
        error: 'HTTPUSD contract not available',
        details: 'CONTRACT_ADDRESS not configured or contract metadata not found',
      });
    }

    // Query total supply
    const { result, output } = await httpusdContract.query.totalSupply(
      CONTRACT_ADDRESS!, // caller
      {
        gasLimit: api.registry.createType('WeightV2', {
          refTime: 100_000_000_000n,
          proofSize: 100_000n,
        }) as any,
        storageDepositLimit: null,
      }
    );

    if (result.isErr) {
      throw new Error('Contract query failed');
    }

    const HTTPUSD_DECIMALS = 9;

    // Extract the actual value from the Result type
    const outputJson = output?.toJSON() as any;
    const totalSupply = (outputJson?.ok !== undefined ? outputJson.ok : output?.toString() || '0').toString();

    res.json({
      name: 'HTTPUSD',
      symbol: 'HTTPUSD',
      contractAddress: CONTRACT_ADDRESS,
      network: NETWORK,
      totalSupply,
      totalSupplyHuman: formatBalanceWithDecimals(totalSupply, HTTPUSD_DECIMALS),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch token info',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get extrinsic by hash
app.get('/api/extrinsics/:hash', async (req, res) => {
  try {
    const { hash } = req.params;

    // This is a simplified version - in a full explorer you'd need to index extrinsics
    // For now, we search recent blocks
    const currentHeader = await api.rpc.chain.getHeader();
    const currentNumber = currentHeader.number.toNumber();

    for (let i = 0; i < 100; i++) {
      const blockNumber = currentNumber - i;
      if (blockNumber < 0) break;

      const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
      const block = await api.rpc.chain.getBlock(blockHash);

      const extrinsic = block.block.extrinsics.find(ext => ext.hash.toHex() === hash);
      if (extrinsic) {
        const events = await api.query.system.events.at(blockHash);
        const eventsVec = events as Vec<EventRecord>;
        const extrinsicIndex = block.block.extrinsics.indexOf(extrinsic);
        const extrinsicEvents = eventsVec.filter(
          (record: EventRecord) => record.phase.isApplyExtrinsic && record.phase.asApplyExtrinsic.toNumber() === extrinsicIndex
        );

        return res.json({
          hash,
          blockNumber,
          blockHash: blockHash.toHex(),
          index: extrinsicIndex,
          method: `${extrinsic.method.section}.${extrinsic.method.method}`,
          args: extrinsic.method.args.map(arg => arg.toString()),
          signer: extrinsic.signer.toString(),
          isSigned: extrinsic.isSigned,
          events: extrinsicEvents.map((record: EventRecord) => ({
            section: record.event.section,
            method: record.event.method,
            data: record.event.data.toString(),
          })),
        });
      }
    }

    res.status(404).json({ error: 'Extrinsic not found' });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch extrinsic',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Search (blocks, accounts, extrinsics)
app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const query = q.toString();
    const results: any = {
      blocks: [],
      accounts: [],
      extrinsics: [],
    };

    // If it's a number, search for block
    if (/^\d+$/.test(query)) {
      const blockNumber = parseInt(query);
      try {
        const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
        results.blocks.push({
          number: blockNumber,
          hash: blockHash.toHex(),
        });
      } catch (e) {
        // Block not found
      }
    }

    // If it's a hash, could be block or extrinsic
    if (query.startsWith('0x')) {
      try {
        const block = await api.rpc.chain.getBlock(query);
        const header = await api.rpc.chain.getHeader(query);
        results.blocks.push({
          number: header.number.toNumber(),
          hash: query,
        });
      } catch (e) {
        // Not a block hash, could be extrinsic
      }

      // Check if it's an account address
      try {
        const accountInfo = await api.query.system.account(query);
        const account = accountInfo as any;
        results.accounts.push({
          address: query,
          balance: account.data.free.toString(),
        });
      } catch (e) {
        // Not an account
      }
    }

    // If looks like SS58 address
    if (query.length >= 47 && !query.startsWith('0x')) {
      try {
        const accountInfo = await api.query.system.account(query);
        const account = accountInfo as any;
        results.accounts.push({
          address: query,
          balance: account.data.free.toString(),
        });
      } catch (e) {
        // Not an account
      }
    }

    res.json(results);
  } catch (error) {
    res.status(500).json({
      error: 'Search failed',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Helper: Extract timestamp from block extrinsics
async function getBlockTimestamp(extrinsics: any[]): Promise<number | null> {
  for (const ext of extrinsics) {
    if (ext.method.section === 'timestamp' && ext.method.method === 'set') {
      const timestamp = ext.method.args[0];
      return timestamp.toNumber();
    }
  }
  return null;
}

// Start server
async function main() {
  try {
    await initApi();

    app.listen(PORT, () => {
      console.log('\n🔍 polkax402 Block Explorer - LIVE\n');
      console.log(`🖥️  UI:       http://localhost:${PORT}`);
      console.log(`📡 API:      http://localhost:${PORT}/api`);
      console.log(`🌐 RPC:      ${WS_ENDPOINT}`);
      console.log(`📖 Docs:     http://localhost:${PORT}/docs\n`);
      console.log('📋 Endpoints:');
      console.log('   GET  /                              - Block Explorer UI (90\'s Mac style!)');
      console.log('   GET  /health                        - Health check');
      console.log('   GET  /docs                          - API documentation (Swagger UI)');
      console.log('   GET  /openapi.json                  - OpenAPI specification');
      console.log('   GET  /api/chain                     - Chain info');
      console.log('   GET  /api/blocks                    - Latest blocks (limit=10)');
      console.log('   GET  /api/blocks/:numberOrHash      - Block details');
      console.log('   GET  /api/accounts/:address              - Account info (native balance)');
      console.log('   GET  /api/accounts/:address/httpusd      - HTTPUSD token balance');
      console.log('   GET  /api/accounts/:address/transactions - Transaction history');
      console.log('   GET  /api/tokens/httpusd                 - HTTPUSD token info');
      console.log('   GET  /api/extrinsics/:hash          - Extrinsic details');
      console.log('   GET  /api/search?q=...              - Search blocks/accounts\n');
    });
  } catch (error) {
    console.error('❌ Failed to start explorer:', error);
    process.exit(1);
  }
}

main();
