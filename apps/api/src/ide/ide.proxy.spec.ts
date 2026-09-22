import { describe, it, expect } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { IdeProxy, readCookie, stripCookie } from './ide.proxy';
import type { IdeService } from './ide.service';
import type { IdeTokenService } from './ide-token.service';
import type { Env } from '../config/env';

describe('IDE proxy cookies', () => {
  it('reads a cookie whose value contains "="', () => {
    expect(readCookie('a=1; fca_ide=x.y=z; b=2', 'fca_ide')).toBe('x.y=z');
    expect(readCookie('a=1', 'fca_ide')).toBeUndefined();
    expect(readCookie(undefined, 'fca_ide')).toBeUndefined();
  });

  // The workbench and a learner's own dev server (via /absproxy) receive the
  // forwarded Cookie header; our credential is not theirs to see.
  it('strips only our credential before forwarding', () => {
    expect(stripCookie('a=1; fca_ide=secret; b=2', 'fca_ide')).toBe('a=1; b=2');
    expect(stripCookie('fca_ide=secret', 'fca_ide')).toBeUndefined();
    expect(stripCookie('fca_ide_other=1', 'fca_ide')).toBe('fca_ide_other=1');
  });
});

describe('IdeProxy request checks', () => {
  function proxy(apiBase: string) {
    const config = {
      get: (key: string) =>
        ({
          API_BASE_URL: apiBase,
          WEB_BASE_URL: 'http://localhost:3000',
          CORS_ORIGINS: 'http://localhost:3000',
        })[key],
    } as unknown as ConfigService<Env, true>;
    return new IdeProxy({} as IdeService, {} as IdeTokenService, config) as unknown as {
      sameOrigin(req: { headers: Record<string, string> }): boolean;
      cookieHeader(slug: string, value: string): string;
    };
  }

  it('accepts only the workbench origin, or none', () => {
    const p = proxy('http://localhost:4000');
    expect(p.sameOrigin({ headers: { origin: 'http://localhost:4000' } })).toBe(true);
    expect(p.sameOrigin({ headers: {} })).toBe(true);
    expect(p.sameOrigin({ headers: { origin: 'http://localhost:3000' } })).toBe(false);
    expect(p.sameOrigin({ headers: { origin: 'https://evil.example' } })).toBe(false);
  });

  it('never issues a SameSite=None cookie, even over HTTPS', () => {
    const https = proxy('https://lms-api.futurecorpacademy.in').cookieHeader('a'.repeat(24), 'v');
    expect(https).toContain('SameSite=Lax');
    expect(https).toContain('Secure');
    expect(https).not.toContain('SameSite=None');
    expect(proxy('http://localhost:4000').cookieHeader('a'.repeat(24), 'v')).not.toContain(
      'Secure',
    );
  });
});
