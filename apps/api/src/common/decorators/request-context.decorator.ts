import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestContext } from '../../auth/auth.service';

/** Extracts ip / user-agent / request-id for audit + session records. */
export const ReqContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestContext => {
    const req = ctx.switchToHttp().getRequest<Request & { requestId?: string }>();
    return {
      ipAddress: req.ip ?? req.socket?.remoteAddress ?? null,
      userAgent: req.header('user-agent') ?? null,
      requestId: req.requestId ?? null,
    };
  },
);
