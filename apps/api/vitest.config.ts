import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts', 'test/**/*.spec.ts'],
    root: '.',
    // Process isolation (forks) avoids a worker-thread module-corruption bug
    // ("SemVer is not a constructor") when several files import Nest/semver.
    pool: 'forks',
    // e2e files share one seeded database + accounts, so run files one at a
    // time — parallel files would race on shared rows (e.g. student notifications).
    fileParallelism: false,
    // Booting the full Nest graph (DI/e2e) needs more than the 5s default.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  plugins: [
    // Enables emitDecoratorMetadata for Nest DI inside vitest.
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
});
