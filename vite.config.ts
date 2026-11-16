import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173 },
  worker: { format: 'es' },
  // 30 s: the real-pack tests take 3–8 s each; under a loaded host (several agents) the 5 s default flaked
  test: { include: ['tests/**/*.test.ts'], testTimeout: 30_000 },
} as any);
