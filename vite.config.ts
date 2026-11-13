import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173 },
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'] },
} as any);
