/**
 * Lightweight Block Explorer API for dotx402
 *
 * Provides REST endpoints to query blockchain data
 */

import express from 'express';
import { ApiPromise, WsProvider } from '@polkadot/api';
import type { SignedBlock, Header, EventRecord } from '@polkadot/types/interfaces';
import type { Vec } from '@polkadot/types';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.EXPLORER_PORT || 5000;
const WS_ENDPOINT = process.env.WS_ENDPOINT || 'ws://localhost:9944';

let api: ApiPromise;

// Initialize Polkadot API
async function initApi() {
  console.log('🔗 Connecting to:', WS_ENDPOINT);
  const wsProvider = new WsProvider(WS_ENDPOINT);
  api = await ApiPromise.create({ provider: wsProvider });
  await api.isReady;
  console.log('✅ Connected to:', (await api.rpc.system.chain()).toString());
}

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'dotx402 Block Explorer API',
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

// Get account info
app.get('/api/accounts/:address', async (req, res) => {
  try {
    const { address } = req.params;

    const [accountInfo, nonce] = await Promise.all([
      api.query.system.account(address),
      api.rpc.system.accountNextIndex(address),
    ]);

    const account = accountInfo as any;

    res.json({
      address,
      nonce: nonce.toNumber(),
      balance: {
        free: account.data.free.toString(),
        reserved: account.data.reserved.toString(),
        frozen: account.data.frozen.toString(),
        freeHuman: account.data.free.toHuman(),
        reservedHuman: account.data.reserved.toHuman(),
        frozenHuman: account.data.frozen.toHuman(),
      },
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch account info',
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
      console.log('\n🔍 dotx402 Block Explorer API - LIVE\n');
      console.log(`📡 API:      http://localhost:${PORT}`);
      console.log(`🌐 Network:  ${WS_ENDPOINT}\n`);
      console.log('📋 Endpoints:');
      console.log('   GET  /health                   - Health check');
      console.log('   GET  /api/chain                - Chain info');
      console.log('   GET  /api/blocks               - Latest blocks (limit=10)');
      console.log('   GET  /api/blocks/:numberOrHash - Block details');
      console.log('   GET  /api/accounts/:address    - Account info');
      console.log('   GET  /api/extrinsics/:hash     - Extrinsic details');
      console.log('   GET  /api/search?q=...         - Search blocks/accounts\n');
    });
  } catch (error) {
    console.error('❌ Failed to start explorer:', error);
    process.exit(1);
  }
}

main();
