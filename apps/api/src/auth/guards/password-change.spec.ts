import { describe, it, expect } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { assertPasswordChanged } from './password-change';

describe('assertPasswordChanged', () => {
  it('does nothing once the member has set their own password', () => {
    expect(() => assertPasswordChanged(false, '/api/v1/courses')).not.toThrow();
  });

  it('blocks ordinary routes while the issued password is still in use', () => {
    // The whole point: the shared role-default password must not be usable
    // against the API, only to replace itself.
    for (const path of [
      '/api/v1/courses',
      '/api/v1/assignments',
      '/api/v1/admin/members',
      '/api/v1/me/reputation',
    ]) {
      expect(() => assertPasswordChanged(true, path), path).toThrow(ForbiddenException);
    }
  });

  it('allows exactly what is needed to escape the lock', () => {
    for (const path of [
      '/api/v1/auth/change-password',
      '/api/v1/auth/me',
      '/api/v1/auth/logout',
      '/api/v1/auth/refresh',
      '/health',
      '/health/ready',
    ]) {
      expect(() => assertPasswordChanged(true, path), path).not.toThrow();
    }
  });

  it('reports a machine-readable reason', () => {
    try {
      assertPasswordChanged(true, '/api/v1/courses');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as ForbiddenException).getResponse()).toMatchObject({
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }
  });

  it('does not treat a path prefix as allowlisted', () => {
    // A naive startsWith() check would wrongly open these up.
    expect(() => assertPasswordChanged(true, '/api/v1/auth/me/secrets')).toThrow();
    expect(() => assertPasswordChanged(true, '/health/metrics')).toThrow();
  });
});
