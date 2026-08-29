import { describe, it, expect } from 'vitest';
import { loginSchema, forgotPasswordSchema, resetPasswordSchema } from './auth.schemas';

// There is no registration schema: accounts are created by an admin
// (POST /admin/members), never self-served. These cover the same shared
// `email` / `password` validators registration used to exercise.
describe('auth schemas', () => {
  it('normalizes email to lowercase and trims', () => {
    expect(loginSchema.parse({ email: '  User@Example.COM ', password: 'x' }).email).toBe(
      'user@example.com',
    );
    expect(forgotPasswordSchema.parse({ email: ' A@B.COM ' }).email).toBe('a@b.com');
  });

  it('rejects weak passwords (missing uppercase/number)', () => {
    expect(() =>
      resetPasswordSchema.parse({ email: 'a@b.com', otp: '123456', password: 'password' }),
    ).toThrow();
  });

  it('rejects passwords shorter than 8 chars', () => {
    expect(() =>
      resetPasswordSchema.parse({ email: 'a@b.com', otp: '123456', password: 'Ab1' }),
    ).toThrow();
  });

  it('accepts a compliant password', () => {
    const parsed = resetPasswordSchema.parse({
      email: 'a@b.com',
      otp: '123456',
      password: 'Password123',
    });
    expect(parsed.password).toBe('Password123');
  });

  it('login accepts any non-empty password (policy enforced at set-time)', () => {
    const parsed = loginSchema.parse({ email: 'a@b.com', password: 'x' });
    expect(parsed.email).toBe('a@b.com');
  });
});
