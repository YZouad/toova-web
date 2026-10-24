import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'npm:jose@5.9.6': 'jose',
      'npm:@peculiar/x509@1.12.3': '@peculiar/x509',
    },
  },
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
});
