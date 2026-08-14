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
          details = r.zodIssues as ApiErrorBody['error']['details'];
          // A bare "Validation failed" tells the user nothing about which
          // field is wrong. The per-field reasons were already in `details`,
          // but clients that render only `message` — most of ours — showed a
          // dead end. Summarise them into the message too.
          const issues = r.zodIssues as Array<{ path?: string; message?: string }>;
          const summary = issues
            .slice(0, 3)
            .map((i) => (i.path ? `${i.path}: ${i.message}` : i.message))
            .filter(Boolean)
            .join('; ');
          message = summary
            ? `${summary}${issues.length > 3 ? ` (+${issues.length - 3} more)` : ''}`
            : 'Validation failed';
        } else if (typeof r.message === 'string') {
          message = r.message;
        } else if (Array.isArray(r.message)) {
          message = (r.message as string[]).join(', ');
        }
      } else if (typeof response === 'string') {
        message = response;
      }
    } else if (clientErrorStatus(exception) !== null) {
      /**
       * Errors thrown below Nest, by Express and its body parser, are plain
       * Errors carrying an HTTP status rather than HttpExceptions — so they
       * used to fall through to the 500 branch. A request body over
       * BODY_LIMIT is rejected correctly, but the caller was told the server
       * had failed, and every genuine 500 shared a bucket with them.
       *
       * Only 4xx is taken on trust. A 5xx from down there is still our fault
       * and still opaque, and the message is only repeated back when the
       * error marks itself safe to expose (the http-errors convention),
       * because an internal detail is not made safe by arriving with a
       * client-error status attached.
       */
      status = clientErrorStatus(exception) as number;
      code = mapStatusToCode(status);
      const e = exception as { message?: unknown; expose?: unknown };
      message =
        e.expose === true && typeof e.message === 'string' && e.message
          ? e.message
          : 'Request rejected';
    } else {
      // Unknown/unhandled — log full detail, return opaque message
      this.logger.error(
        `Unhandled exception${requestId ? ` [${requestId}]` : ''}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ApiErrorBody = {
      error: { code, message, ...(details ? { details } : {}), ...(requestId ? { requestId } : {}) },
    };
    res.status(status).json(body);
  }
}

/**
 * The 4xx an error is asking to be reported as, or null if it is not asking
 * for one we would honour.
 *
 * `status` is an ordinary property, so anything can carry anything: only a
 * whole number inside the client-error range is accepted.
 */
function clientErrorStatus(exception: unknown): number | null {
  if (typeof exception !== 'object' || exception === null) return null;
  const e = exception as { status?: unknown; statusCode?: unknown };
  const raw = typeof e.status === 'number' ? e.status : e.statusCode;
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return null;
  return raw >= 400 && raw <= 499 ? raw : null;
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
      // Any other 4xx — 413 too large, 415 wrong media type, 405 wrong method —
      // is still the request being unacceptable, so it is reported as such
      // rather than as INTERNAL, which would tell the caller the server broke.
      return status >= 400 && status <= 499
        ? ERROR_CODES.VALIDATION_ERROR
        : ERROR_CODES.INTERNAL;
  }
}
