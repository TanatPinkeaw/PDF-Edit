import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'server/tests/**/*.test.ts'],
    setupFiles: ['tests/setup-fonts.ts'],
    // Server tests share one PostgreSQL database, so run files one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
