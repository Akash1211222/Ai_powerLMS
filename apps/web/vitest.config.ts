import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    // jsdom, because most of what is worth testing here reacts to the browser:
    // visibility changes during an exam, storage, fetch. A node environment
    // would force those to be mocked into meaninglessness.
    environment: 'jsdom',
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    root: '.',
    // Match the API app: process isolation, one file at a time. These tests are
    // fast, and shared module state (the in-memory access token) must not leak
    // between files.
    pool: 'forks',
    fileParallelism: false,
    env: {
      // Pinned so assertions can check the URL a request was sent to without
      // depending on whatever .env the developer happens to have.
      NEXT_PUBLIC_API_BASE_URL: 'http://api.test/api/v1',
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
