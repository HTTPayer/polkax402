/**
 * OpenAPI 3.0 Specification for polkax402 Block Explorer API
 */

export const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'polkax402 Block Explorer API',
    version: '1.0.0',
    description: 'REST API for querying polkax402 blockchain data including blocks, accounts, extrinsics, and search functionality.',
    contact: {
      name: 'HTTPayer',
      url: 'https://github.com/HTTPayer/polkax402',
    },
    license: {
      name: 'ISC',
    },
  },
  servers: [
    {
      url: 'http://localhost:5000',
      description: 'Local development server',
    },
    {
      url: 'https://explorer.polkax402.com',
      description: 'Production server',
    },
  ],
  tags: [
    {
      name: 'Health',
      description: 'Health check endpoints',
    },
    {
      name: 'Chain',
      description: 'Blockchain information',
    },
    {
      name: 'Blocks',
      description: 'Block data and queries',
    },
    {
      name: 'Accounts',
      description: 'Account balance and information',
    },
    {
      name: 'Extrinsics',
      description: 'Transaction/extrinsic details',
    },
    {
      name: 'Search',
      description: 'Search functionality',
    },
    {
      name: 'Tokens',
      description: 'HTTPUSD token queries',
    },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Returns the health status of the explorer API',
        responses: {
          '200': {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    timestamp: { type: 'string', format: 'date-time' },
                    service: { type: 'string', example: 'polkax402 Block Explorer API' },
                    network: { type: 'string', example: 'wss://rpc.polkax402.dpdns.org' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/chain': {
      get: {
        tags: ['Chain'],
        summary: 'Get chain information',
        description: 'Returns general information about the blockchain',
        responses: {
          '200': {
            description: 'Chain information retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    chain: { type: 'string', example: 'polkax402' },
                    nodeName: { type: 'string', example: 'Substrate Node' },
                    nodeVersion: { type: 'string', example: '1.0.0' },
                    bestBlock: { type: 'number', example: 12345 },
                    bestBlockHash: { type: 'string', example: '0x1234567890abcdef...' },
                  },
                },
              },
            },
          },
          '500': {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
    '/api/blocks': {
      get: {
        tags: ['Blocks'],
        summary: 'Get latest blocks',
        description: 'Returns a list of the most recent blocks',
        parameters: [
          {
            name: 'limit',
            in: 'query',
            description: 'Maximum number of blocks to return (max: 100)',
            required: false,
            schema: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 10,
            },
          },
        ],
        responses: {
          '200': {
            description: 'Blocks retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    blocks: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/BlockSummary' },
                    },
                    total: { type: 'number', description: 'Total number of blocks in chain' },
                  },
                },
              },
            },
          },
          '500': {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
    '/api/blocks/{numberOrHash}': {
      get: {
        tags: ['Blocks'],
        summary: 'Get block details',
        description: 'Returns detailed information about a specific block by number or hash',
        parameters: [
          {
            name: 'numberOrHash',
            in: 'path',
            description: 'Block number or hash (0x-prefixed)',
            required: true,
            schema: {
              type: 'string',
              example: '12345',
            },
          },
        ],
        responses: {
          '200': {
            description: 'Block details retrieved successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BlockDetails' },
              },
            },
          },
          '404': {
            description: 'Block not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
    '/api/accounts/{address}': {
      get: {
        tags: ['Accounts'],
        summary: 'Get account information',
        description: 'Returns native token balance and nonce information for a specific account',
        parameters: [
          {
            name: 'address',
            in: 'path',
            description: 'SS58-encoded account address',
            required: true,
            schema: {
              type: 'string',
              example: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
            },
          },
        ],
        responses: {
          '200': {
            description: 'Account information retrieved successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AccountInfo' },
              },
            },
          },
          '500': {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
    '/api/accounts/{address}/transactions': {
      get: {
        tags: ['Accounts'],
        summary: 'Get transaction history',
        description: 'Returns recent transactions for a specific account (scans recent blocks)',
        parameters: [
          {
            name: 'address',
            in: 'path',
            description: 'SS58-encoded account address',
            required: true,
            schema: {
              type: 'string',
              example: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
            },
          },
          {
            name: 'limit',
            in: 'query',
            description: 'Maximum number of transactions to return (max: 100)',
            required: false,
            schema: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 10,
            },
          },
          {
            name: 'scanDepth',
            in: 'query',
            description: 'Number of recent blocks to scan (max: 10000)',
            required: false,
            schema: {
              type: 'integer',
              minimum: 1,
              maximum: 10000,
              default: 1000,
            },
          },
        ],
        responses: {
          '200': {
            description: 'Transaction history retrieved successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TransactionHistory' },
              },
            },
          },
          '500': {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
    '/api/accounts/{address}/httpusd': {
      get: {
        tags: ['Tokens'],
        summary: 'Get HTTPUSD token balance',
        description: 'Returns the HTTPUSD token balance for a specific account address',
        parameters: [
          {
            name: 'address',
            in: 'path',
            description: 'SS58-encoded account address',
            required: true,
            schema: {
              type: 'string',
              example: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
            },
          },
        ],
        responses: {
          '200': {
            description: 'HTTPUSD balance retrieved successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TokenBalance' },
              },
            },
          },
          '503': {
            description: 'HTTPUSD contract not available',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
          '500': {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
    '/api/tokens/httpusd': {
      get: {
        tags: ['Tokens'],
        summary: 'Get HTTPUSD token information',
        description: 'Returns general information about the HTTPUSD token including total supply',
        responses: {
          '200': {
            description: 'Token information retrieved successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TokenInfo' },
              },
            },
          },
          '503': {
            description: 'HTTPUSD contract not available',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
          '500': {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
    '/api/extrinsics/{hash}': {
      get: {
        tags: ['Extrinsics'],
        summary: 'Get extrinsic details',
        description: 'Returns detailed information about a specific extrinsic by hash (searches last 100 blocks)',
        parameters: [
          {
            name: 'hash',
            in: 'path',
            description: 'Extrinsic hash (0x-prefixed)',
            required: true,
            schema: {
              type: 'string',
              example: '0x1234567890abcdef...',
            },
          },
        ],
        responses: {
          '200': {
            description: 'Extrinsic details retrieved successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ExtrinsicDetails' },
              },
            },
          },
          '404': {
            description: 'Extrinsic not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
          '500': {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
    '/api/search': {
      get: {
        tags: ['Search'],
        summary: 'Search blockchain data',
        description: 'Search for blocks, accounts, or extrinsics by number, hash, or address',
        parameters: [
          {
            name: 'q',
            in: 'query',
            description: 'Search query (block number, hash, or address)',
            required: true,
            schema: {
              type: 'string',
              example: '12345',
            },
          },
        ],
        responses: {
          '200': {
            description: 'Search results',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SearchResults' },
              },
            },
          },
          '400': {
            description: 'Bad request - query parameter missing',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
          '500': {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string', description: 'Error message' },
          details: { type: 'string', description: 'Error details' },
        },
      },
      BlockSummary: {
        type: 'object',
        properties: {
          number: { type: 'number', description: 'Block number' },
          hash: { type: 'string', description: 'Block hash' },
          parentHash: { type: 'string', description: 'Parent block hash' },
          stateRoot: { type: 'string', description: 'State root hash' },
          extrinsicsRoot: { type: 'string', description: 'Extrinsics root hash' },
          extrinsicsCount: { type: 'number', description: 'Number of extrinsics in block' },
          timestamp: { type: 'number', nullable: true, description: 'Block timestamp (milliseconds)' },
        },
      },
      BlockDetails: {
        type: 'object',
        properties: {
          number: { type: 'number', description: 'Block number' },
          hash: { type: 'string', description: 'Block hash' },
          parentHash: { type: 'string', description: 'Parent block hash' },
          stateRoot: { type: 'string', description: 'State root hash' },
          extrinsicsRoot: { type: 'string', description: 'Extrinsics root hash' },
          timestamp: { type: 'number', nullable: true, description: 'Block timestamp (milliseconds)' },
          extrinsics: {
            type: 'array',
            items: { $ref: '#/components/schemas/Extrinsic' },
          },
          events: {
            type: 'array',
            items: { $ref: '#/components/schemas/Event' },
          },
        },
      },
      Extrinsic: {
        type: 'object',
        properties: {
          index: { type: 'number', description: 'Extrinsic index in block' },
          hash: { type: 'string', description: 'Extrinsic hash' },
          method: { type: 'string', description: 'Method called (section.method)' },
          args: { type: 'array', items: { type: 'string' }, description: 'Method arguments' },
          signer: { type: 'string', description: 'Signer address' },
          isSigned: { type: 'boolean', description: 'Whether extrinsic is signed' },
        },
      },
      Event: {
        type: 'object',
        properties: {
          phase: { type: 'string', description: 'Event phase' },
          section: { type: 'string', description: 'Event section' },
          method: { type: 'string', description: 'Event method' },
          data: { type: 'string', description: 'Event data' },
        },
      },
      ExtrinsicDetails: {
        type: 'object',
        properties: {
          hash: { type: 'string', description: 'Extrinsic hash' },
          blockNumber: { type: 'number', description: 'Block number containing extrinsic' },
          blockHash: { type: 'string', description: 'Block hash containing extrinsic' },
          index: { type: 'number', description: 'Extrinsic index in block' },
          method: { type: 'string', description: 'Method called (section.method)' },
          args: { type: 'array', items: { type: 'string' }, description: 'Method arguments' },
          signer: { type: 'string', description: 'Signer address' },
          isSigned: { type: 'boolean', description: 'Whether extrinsic is signed' },
          events: {
            type: 'array',
            items: { $ref: '#/components/schemas/Event' },
          },
        },
      },
      AccountInfo: {
        type: 'object',
        properties: {
          address: { type: 'string', description: 'Account address' },
          nonce: { type: 'number', description: 'Account nonce (transaction count)' },
          balance: {
            type: 'object',
            properties: {
              type: { type: 'string', description: 'Balance type', example: 'native' },
              description: { type: 'string', description: 'Balance description', example: 'Native token balance (used for gas fees)' },
              free: { type: 'string', description: 'Free balance (smallest unit)' },
              reserved: { type: 'string', description: 'Reserved balance (smallest unit)' },
              frozen: { type: 'string', description: 'Frozen balance (smallest unit)' },
              freeHuman: { type: 'string', description: 'Free balance (human readable)' },
              reservedHuman: { type: 'string', description: 'Reserved balance (human readable)' },
              frozenHuman: { type: 'string', description: 'Frozen balance (human readable)' },
            },
          },
        },
      },
      TokenBalance: {
        type: 'object',
        properties: {
          address: { type: 'string', description: 'Account address' },
          token: { type: 'string', description: 'Token symbol', example: 'HTTPUSD' },
          contractAddress: { type: 'string', description: 'Contract address' },
          balance: { type: 'string', description: 'Token balance (smallest unit)' },
          balanceHuman: { type: 'string', description: 'Token balance (human readable)' },
        },
      },
      TokenInfo: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Token name', example: 'HTTPUSD' },
          symbol: { type: 'string', description: 'Token symbol', example: 'HTTPUSD' },
          contractAddress: { type: 'string', description: 'Contract address' },
          network: { type: 'string', description: 'Network name', example: 'polkax402' },
          totalSupply: { type: 'string', description: 'Total supply (smallest unit)' },
          totalSupplyHuman: { type: 'string', description: 'Total supply (human readable)' },
        },
      },
      Transaction: {
        type: 'object',
        properties: {
          hash: { type: 'string', description: 'Transaction hash' },
          blockNumber: { type: 'number', description: 'Block number' },
          blockHash: { type: 'string', description: 'Block hash' },
          timestamp: { type: 'number', nullable: true, description: 'Transaction timestamp (milliseconds)' },
          index: { type: 'number', description: 'Extrinsic index in block' },
          method: { type: 'string', description: 'Full method name (section.method)' },
          section: { type: 'string', description: 'Method section' },
          methodName: { type: 'string', description: 'Method name' },
          signer: { type: 'string', description: 'Transaction signer' },
          args: { type: 'array', items: { type: 'string' }, description: 'Method arguments' },
          success: { type: 'boolean', description: 'Whether transaction succeeded' },
          events: { type: 'number', description: 'Number of events emitted' },
        },
      },
      TransactionHistory: {
        type: 'object',
        properties: {
          address: { type: 'string', description: 'Account address' },
          transactions: {
            type: 'array',
            items: { $ref: '#/components/schemas/Transaction' },
          },
          count: { type: 'number', description: 'Number of transactions returned' },
          scannedBlocks: { type: 'number', description: 'Number of blocks scanned' },
          note: { type: 'string', description: 'Information about scan depth' },
        },
      },
      SearchResults: {
        type: 'object',
        properties: {
          blocks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                number: { type: 'number' },
                hash: { type: 'string' },
              },
            },
          },
          accounts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                address: { type: 'string' },
                balance: { type: 'string' },
              },
            },
          },
          extrinsics: {
            type: 'array',
            items: { type: 'object' },
          },
        },
      },
    },
  },
};
