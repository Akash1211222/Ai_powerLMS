import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, type ArgumentsHost } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

/** Minimal ArgumentsHost that captures what the filter writes. */
function hostFor(): {
  host: ArgumentsHost;
  sent: () => Record<string, unknown>;
  status: () => number;
} {
  let body: Record<string, unknown> = {};
  let code = 0;
  const res = {
    status: vi.fn((s: number) => {
      code = s;
      return res;
    }),
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
  return { host, sent: () => body, status: () => code };
}

/**
 * Builds the shape Express throws for a body over the size limit: a plain
 * Error carrying an HTTP status, not a Nest HttpException.
 */
function payloadTooLarge(): Error {
  const err = new Error('request entity too large') as Error & {
    status: number;
    statusCode: number;
    expose: boolean;
    type: string;
  };
  err.name = 'PayloadTooLargeError';
  err.status = 413;
  err.statusCode = 413;
  err.expose = true;
  err.type = 'entity.too.large';
  return err;
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

describe('AllExceptionsFilter — errors thrown below Nest', () => {
  const filter = new AllExceptionsFilter();

  it('reports an oversized body as 413, not 500', () => {
    // body-parser rejects the request correctly, so memory stays bounded — but
    // the client was told "Internal server error", blaming the server for the
    // caller's mistake and burying genuine 500s in the same bucket.
    const { host, sent, status } = hostFor();
    filter.catch(payloadTooLarge(), host);

    expect(status()).toBe(413);
    const err = (sent().error ?? {}) as Record<string, unknown>;
    expect(err.code).not.toBe('INTERNAL');
  });

  it('keeps the reason for a client error that is safe to expose', () => {
    const { host, sent } = hostFor();
    filter.catch(payloadTooLarge(), host);
    expect(String(((sent().error ?? {}) as Record<string, unknown>).message)).toMatch(/too large/i);
  });

  it('still hides anything that is genuinely the server’s fault', () => {
    // A 5xx from below Nest must stay opaque: no message, no stack, no detail.
    const { host, sent, status } = hostFor();
    const boom = new Error('connect ECONNREFUSED 127.0.0.1:5432 pool exhausted') as Error & {
      status: number;
    };
    boom.status = 503;
    filter.catch(boom, host);

    expect(status()).toBe(500);
    const err = (sent().error ?? {}) as Record<string, unknown>;
    expect(err.code).toBe('INTERNAL');
    expect(String(err.message)).toBe('Internal server error');
  });

  it('does not trust a status that is not a real HTTP code', () => {
    // `status` is just a property; a thrown object can carry anything.
    const { host, status } = hostFor();
    const weird = new Error('nope') as Error & { status: unknown };
    weird.status = 'teapot';
    filter.catch(weird, host);
    expect(status()).toBe(500);
  });

  it('leaves a plain error as a 500', () => {
    const { host, status } = hostFor();
    filter.catch(new Error('something broke'), host);
    expect(status()).toBe(500);
  });
});
