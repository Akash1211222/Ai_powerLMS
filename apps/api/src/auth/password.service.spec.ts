import { describe, it, expect, beforeAll } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  let service: PasswordService;
  beforeAll(() => {
    // Lower argon2 cost for fast tests.
    const config = {
      get: (key: string) => ({ ARGON2_MEMORY_COST: 4096, ARGON2_TIME_COST: 2 })[key],
    } as unknown as ConfigService;
    service = new PasswordService(config);
  });

  it('hashes and verifies the correct password', async () => {
    const hash = await service.hash('Password123!');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await service.verify(hash, 'Password123!')).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await service.hash('Password123!');
    expect(await service.verify(hash, 'WrongPassword1')).toBe(false);
  });

  it('returns false (not throw) for a malformed hash', async () => {
    expect(await service.verify('not-a-hash', 'whatever')).toBe(false);
  });
});
