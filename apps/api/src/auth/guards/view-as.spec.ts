import { describe, it, expect } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { assertViewOnly } from './view-as';

/**
 * The point of the restriction: staff should be able to see a student's screen
 * without being able to leave marks on their record.
 */
describe('assertViewOnly', () => {
  it('leaves an ordinary session completely alone', () => {
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
      expect(() => assertViewOnly(false, method, '/api/v1/assignments')).not.toThrow();
    }
  });

  it('lets a borrowed session read', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) {
      expect(() => assertViewOnly(true, method, '/api/v1/me/reports')).not.toThrow();
    }
  });

  it('refuses to let a borrowed session submit work', () => {
    // The failure this prevents: an assignment submitted while impersonating
    // would show in the audit trail as the student's own.
    expect(() => assertViewOnly(true, 'POST', '/api/v1/assignments/x/submit')).toThrow(
      ForbiddenException,
    );
  });

  it('refuses every other way of changing something', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(() => assertViewOnly(true, method, '/api/v1/community/posts')).toThrow();
    }
  });

  it('explains itself rather than returning a bare refusal', () => {
    // A plain 403 in the middle of a page reads as a bug in the product.
    try {
      assertViewOnly(true, 'POST', '/api/v1/anything');
      throw new Error('should have thrown');
    } catch (e) {
      const body = (e as ForbiddenException).getResponse() as Record<string, unknown>;
      expect(body.code).toBe('VIEW_AS_READ_ONLY');
      expect(String(body.message)).toMatch(/viewing this account/i);
    }
  });

  it('still lets somebody end the borrowed session', () => {
    expect(() => assertViewOnly(true, 'POST', '/api/v1/auth/logout')).not.toThrow();
  });
});
