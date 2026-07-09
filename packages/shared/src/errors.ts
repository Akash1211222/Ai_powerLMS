/**
 * Standard API error envelope (§38). Every error response the API returns
 * conforms to this shape so the web client can handle errors uniformly.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    /** Optional field-level validation issues. */
    details?: Array<{ path: string; message: string }>;
    /** Correlates with server logs. */
    requestId?: string;
  };
}
