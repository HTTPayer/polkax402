import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'server/index': 'src/server/index.ts',
    'client/index': 'src/client/index.ts',
    'utils/contract-helpers': 'src/utils/contract-helpers.ts',
    'utils/payment': 'src/utils/payment.ts',
    'utils/fetch-wrapper': 'src/utils/fetch-wrapper.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: [
    /^@polkadot\//,
    'express',
    'swagger-ui-express',
  ],
  noExternal: [],
});
