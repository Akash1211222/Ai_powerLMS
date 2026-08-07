import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, type ArgumentsHost } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

/** Minimal ArgumentsHost that captures what the filter writes. */
function hostFor(): { host: ArgumentsHost; sent: () => Record<string, unknown> } {
  let body: Record<string, unknown> = {};
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn((b: Record<string, unknown>) => {
      body = b;
    }),
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => ({ requestId: 'req-1' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, sent: () => body };
}

describe('AllExceptionsFilter — validation messages', () => {
  const filter = new AllExceptionsFilter();

  it('says which field is wrong instead of a bare "Validation failed"', () => {
    // Previously this produced message: "Validation failed", which left a
    // trainer staring at a rejected Google Meet link with no reason given.
    const { host, sent } = hostFor();
    filter.catch(
      new BadRequestException({
        zodIssues: [
          { path: 'meetingUrl', message: 'Enter a Google Meet link, for example meet.google.com/abc-defg-hij' },
        ],
      }),
      host,
    );
    const err = (sent().error ?? {}) as Record<string, unknown>;
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(String(err.message)).toContain('meetingUrl');
    expect(String(err.message)).toContain('Google Meet link');
    // The structured detail is still there for clients that want it.
    expect(Array.isArray(err.details)).toBe(true);
  });

  it('summarises several issues and caps the list', () => {
    const { host, sent } = hostFor();
    filter.catch(
      new BadRequestException({
        zodIssues: [
          { path: 'a', message: 'bad a' },
          { path: 'b', message: 'bad b' },
          { path: 'c', message: 'bad c' },
          { path: 'd', message: 'bad d' },
          { path: 'e', message: 'bad e' },
        ],
      }),
      host,
    );
    const msg = String(((sent().error ?? {}) as Record<string, unknown>).message);
    expect(msg).toContain('a: bad a');
    expect(msg).toContain('(+2 more)');
    expect(msg).not.toContain('bad e');
  });

  it('falls back when issues carry no messages', () => {
    const { host, sent } = hostFor();
    filter.catch(new BadRequestException({ zodIssues: [] }), host);
    expect(String(((sent().error ?? {}) as Record<string, unknown>).message)).toBe('Validation failed');
  });

  it('leaves non-validation errors alone', () => {
    const { host, sent } = hostFor();
    filter.catch(new BadRequestException('Plain bad request'), host);
    expect(String(((sent().error ?? {}) as Record<string, unknown>).message)).toBe('Plain bad request');
  });
});
