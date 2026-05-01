import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/schema/**/*.spec.ts'],
    setupFiles: ['test/setup-prisma.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000, // testcontainers pull pode demorar
    pool: 'forks',
    singleFork: true, // 1 container compartilhado entre suites
  },
});
