import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __PLATFORM__: JSON.stringify('dev'), __BUILD_TIME__: JSON.stringify('test') },
  test: {
    include: ['tests/{unit,integration,gameplay,economy,purchases,ads}/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
  },
});
