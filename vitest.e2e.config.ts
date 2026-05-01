import { resolve } from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.e2e-spec.ts', 'test/e2e/**/*.e2e-spec.ts'],
    setupFiles: ['test/e2e/env-setup.ts', 'test/setup-prisma.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: 'forks',
    singleFork: true,
  },
  esbuild: false,
  oxc: false,
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
});
