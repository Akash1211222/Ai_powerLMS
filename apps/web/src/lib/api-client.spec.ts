import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiRequest, setAccessToken, ApiError } from './api-client';

/**
 * Every request in the app goes through this one function, so the things it
 * gets wrong are wrong everywhere: a token attached to a call that should not
 * carry it, a token missing from one that should, or an error envelope the UI
 * cannot read well enough to say what happened.
 */

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

let fetchMock: ReturnType<typeof vi.fn>;

const lastCall = () => fetchMock.mock.calls[0] as [string, RequestInit];
const headersOf = () => (lastCall()[1].headers ?? {}) as Record<string, string>;

beforeEach(() => {
  fetchMock = vi.fn(async (_url: string, _init: RequestInit) => jsonResponse(200, { ok: true }));
  vi.stubGlobal('fetch', fetchMock);
  setAccessToken(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe('apiRequest — sending the token', () => {
  it('does not attach the token unless the call asks for it', async () => {
    // auth defaults to false. Attaching it everywhere would hand the bearer
    // token to any endpoint the app happens to call, including public ones.
    setAccessToken('secret-token');
    await apiRequest('/health');

    expect(headersOf()).not.toHaveProperty('Authorization');
  });

  it('attaches the token when the call is authenticated', async () => {
    setAccessToken('secret-token');
    await apiRequest('/me/reports', { auth: true });

    expect(headersOf().Authorization).toBe('Bearer secret-token');
  });

  it('omits the header entirely when there is no token to send', async () => {
    // Rather than sending `Bearer null`, which reads as a malformed token
    // instead of an absent one.
    await apiRequest('/me/reports', { auth: true });

    expect(headersOf()).not.toHaveProperty('Authorization');
  });

  it('forgets the token when it is cleared', async () => {
    setAccessToken('secret-token');
    setAccessToken(null);
    await apiRequest('/me/reports', { auth: true });

    expect(headersOf()).not.toHaveProperty('Authorization');
  });

  it('keeps the token out of storage a script could read', async () => {
    // The access token is deliberately held in a module variable: localStorage
    // is readable by any injected script. If this ever moves, XSS upgrades
    // from "runs code" to "walks away with a session".
    setAccessToken('secret-token');
    await apiRequest('/me/reports', { auth: true });

    const stored = [
      ...Object.values(window.localStorage),
      ...Object.values(window.sessionStorage),
    ].join(' ');
    expect(stored).not.toContain('secret-token');
  });
});

describe('apiRequest — shaping the request', () => {
  it('sends the body as JSON and says so', async () => {
    await apiRequest('/auth/login', { method: 'POST', body: { email: 'a@b.c' } });

    const [url, init] = lastCall();
    expect(url).toBe('http://api.test/api/v1/auth/login');
    expect(init.method).toBe('POST');
    expect(headersOf()['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ email: 'a@b.c' }));
  });

  it('sends no content-type on a request with no body', async () => {
    // A GET declaring a JSON body it does not have invites a 400 from strict
    // proxies and body parsers.
    await apiRequest('/health');

    expect(headersOf()).not.toHaveProperty('Content-Type');
    expect(lastCall()[1].body).toBeUndefined();
  });

  it('passes an abort signal through so a view can cancel its own requests', async () => {
    const controller = new AbortController();
    await apiRequest('/health', { signal: controller.signal });

    expect(lastCall()[1].signal).toBe(controller.signal);
  });
});

describe('apiRequest — reading the answer', () => {
  it('throws ApiError carrying the code the UI switches on', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { error: { code: 'FORBIDDEN', message: 'Not your course' } }),
    );

    const err = await apiRequest('/courses/1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(403);
    expect((err as ApiError).code).toBe('FORBIDDEN');
    expect((err as ApiError).message).toBe('Not your course');
  });

  it('keeps per-field validation detail for forms to render', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'meetingUrl: Enter a Google Meet link',
          details: [{ path: 'meetingUrl', message: 'Enter a Google Meet link' }],
        },
      }),
    );

    const err = (await apiRequest('/live').catch((e: unknown) => e)) as ApiError;
    expect(err.details).toEqual([{ path: 'meetingUrl', message: 'Enter a Google Meet link' }]);
  });

  it('still throws something usable when the failure is not JSON', async () => {
    // An nginx 502 is an HTML page. Parsing it as an envelope must not leave
    // the UI with an error it cannot describe.
    fetchMock.mockResolvedValueOnce(
      new Response('<html>502 Bad Gateway</html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    const err = (await apiRequest('/health').catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(502);
    expect(err.code).toBe('INTERNAL');
  });

  it('returns null rather than undefined for an empty success', async () => {
    // React Query treats an undefined result as a failed query and throws, so
    // "nothing computed yet" — /me/score before the first run — has to come
    // back as an explicit null.
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(apiRequest('/me/score')).resolves.toBeNull();
  });
});
