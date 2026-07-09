import type { ApiErrorBody } from '@fca/shared';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1';

/** Error carrying the API's structured envelope so UIs can react per-code. */
export class ApiError extends Error {
  code: string;
  status: number;
  details?: ApiErrorBody['error']['details'];

  constructor(status: number, body: ApiErrorBody) {
    super(body.error?.message ?? 'Request failed');
    this.name = 'ApiError';
    this.status = status;
    this.code = body.error?.code ?? 'INTERNAL';
    this.details = body.error?.details;
  }
}

// Access token lives in memory only (not localStorage) to limit XSS exposure.
let accessToken: string | null = null;
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = false, signal } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await res.json() : undefined;

  if (!res.ok) {
    throw new ApiError(res.status, (payload as ApiErrorBody) ?? { error: { code: 'INTERNAL', message: res.statusText } });
  }
  return payload as T;
}
