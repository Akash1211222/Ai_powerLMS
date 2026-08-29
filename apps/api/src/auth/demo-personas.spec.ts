import { describe, it, expect } from 'vitest';
import { ROLES } from '@fca/shared';
import { AuthService } from './auth.service';

/**
 * The demo sign-in is a public, password-free endpoint. Which accounts it will
 * hand out is therefore a security boundary, not a convenience list.
 */
const personas = (AuthService as unknown as { DEMO_PERSONAS: Record<string, string> })
  .DEMO_PERSONAS;

describe('the roles the public demo offers', () => {
  it('never offers SUPER_ADMIN', () => {
    // The one role that crosses tenants and holds the raw database browser.
    // A public button for it would hand over every organisation, including the
    // real one.
    expect(personas).not.toHaveProperty('SUPER_ADMIN');
  });

  it('offers every other role, so each can be reviewed', () => {
    const missing = ROLES.filter((r) => r !== 'SUPER_ADMIN' && !(r in personas));
    expect(missing).toEqual([]);
  });

  it('names only accounts that will sit in the demo domain', () => {
    // The address is built by appending @demo.futurecorp.in, and sign-in
    // refuses anything outside it. A local part containing an @ would slip a
    // real address past that check.
    for (const local of Object.values(personas)) {
      expect(local).toMatch(/^[a-z][a-z0-9]*$/);
    }
  });

  it('gives each role its own account', () => {
    const locals = Object.values(personas);
    expect(new Set(locals).size).toBe(locals.length);
  });
});
