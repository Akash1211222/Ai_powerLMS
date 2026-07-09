import { describe, it, expect } from 'vitest';
import { registerSchema, loginSchema } from './auth.schemas';

describe('auth schemas', () => {
  it('normalizes email to lowercase and trims', () => {
    const parsed = registerSchema.parse({
      email: '  User@Example.COM ',
      password: 'Password123',
      firstName: 'A',
      lastName: 'B',
    });
    expect(parsed.email).toBe('user@example.com');
  });

  it('rejects weak passwords (missing uppercase/number)', () => {
    expect(() =>
      registerSchema.parse({
        email: 'a@b.com',
        password: 'password',
        firstName: 'A',
        lastName: 'B',
      }),
    ).toThrow();
  });

  it('rejects passwords shorter than 8 chars', () => {
    expect(() =>
      registerSchema.parse({ email: 'a@b.com', password: 'Ab1', firstName: 'A', lastName: 'B' }),
    ).toThrow();
  });

  it('login accepts any non-empty password (policy enforced at set-time)', () => {
    const parsed = loginSchema.parse({ email: 'a@b.com', password: 'x' });
    expect(parsed.email).toBe('a@b.com');
  });
});
