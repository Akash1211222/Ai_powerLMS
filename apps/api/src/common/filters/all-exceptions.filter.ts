import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ERROR_CODES, type ApiErrorBody, type ErrorCode } from '@fca/shared';

/**
 * Normalizes every thrown error into the shared ApiErrorBody envelope (§38).
 * Never leaks stack traces or internal messages for 5xx errors.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = req.requestId;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = ERROR_CODES.INTERNAL;
    let message = 'Internal server error';
    let details: ApiErrorBody['error']['details'];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      code = mapStatusToCode(status);

      if (typeof response === 'object' && response !== null) {
        const r = response as Record<string, unknown>;
        // Zod validation pipe payload
        if (Array.isArray(r.zodIssues)) {
          code = ERROR_CODES.VALIDATION_ERROR;
          message = 'Validation failed';
          details = r.zodIssues as ApiErrorBody['error']['details'];
        } else if (typeof r.message === 'string') {
          message = r.message;
        } else if (Array.isArray(r.message)) {
          message = (r.message as string[]).join(', ');
        }
      } else if (typeof response === 'string') {
        message = response;
      }
    } else {
      // Unknown/unhandled — log full detail, return opaque message
      this.logger.error(
        `Unhandled exception${requestId ? ` [${requestId}]` : ''}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    // #region agent log
    if (status === HttpStatus.NOT_FOUND || status >= 500) {
      fetch('http://127.0.0.1:7530/ingest/1805f349-12c4-4574-b318-85c0b7b0d469', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '4b859f' },
        body: JSON.stringify({
          sessionId: '4b859f',
          runId: 'health-check',
          hypothesisId: status === HttpStatus.NOT_FOUND ? 'A' : 'C',
          location: 'apps/api/src/common/filters/all-exceptions.filter.ts:catch',
          message: 'API exception response',
          data: {
            status,
            code,
            method: req.method,
            path: req.originalUrl ?? req.url,
            pid: process.pid,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => undefined);
    }
    // #endregion

    const body: ApiErrorBody = {
      error: { code, message, ...(details ? { details } : {}), ...(requestId ? { requestId } : {}) },
    };
    res.status(status).json(body);
  }
}

function mapStatusToCode(status: number): ErrorCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ERROR_CODES.VALIDATION_ERROR;
    case HttpStatus.UNAUTHORIZED:
      return ERROR_CODES.UNAUTHENTICATED;
    case HttpStatus.FORBIDDEN:
      return ERROR_CODES.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return ERROR_CODES.NOT_FOUND;
    case HttpStatus.CONFLICT:
      return ERROR_CODES.CONFLICT;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ERROR_CODES.RATE_LIMITED;
    default:
      return ERROR_CODES.INTERNAL;
  }
}
