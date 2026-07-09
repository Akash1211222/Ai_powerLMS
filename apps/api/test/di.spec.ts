/**
 * Dependency-injection wiring smoke test. Compiles the full AppModule graph
 * WITHOUT connecting to Postgres/Redis (constructors don't open connections;
 * only app.init() would). This catches provider-resolution bugs — e.g. a guard
 * whose dependency isn't visible in a feature module — in the infra-free suite.
 */
import { describe, it, expect } from 'vitest';

describe('AppModule DI graph', () => {
  it('resolves all providers and guards', async () => {
    // Minimal env so ConfigModule validation passes at import time.
    process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    process.env.JWT_ACCESS_SECRET ??= 'x'.repeat(48);
    process.env.JWT_REFRESH_SECRET ??= 'y'.repeat(48);

    const { Test } = await import('@nestjs/testing');
    const { AppModule } = await import('../src/app.module');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef).toBeTruthy();
    await moduleRef.close();
  });
});
