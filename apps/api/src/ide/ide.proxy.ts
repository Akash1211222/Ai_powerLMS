import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { request } from 'node:http';
import { connect, type Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import type { Env } from '../config/env';
import { IdeService, type IdeInstance } from './ide.service';
import { IDE_COOKIE_TTL_SECONDS, IdeTokenService } from './ide-token.service';

const COOKIE = 'fca_ide';
const TICKET_PARAM = 'fca_ticket';
const PREFIX = /^\/ide\/([a-f0-9]{24})(\/.*|\?.*)?$/;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Hop-by-hop headers (RFC 7230 §6.1) are for one connection, not the next. */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

/**
 * Forwards /ide/<slug>/* — HTTP and websockets — to that instance's socket.
 *
 * Mounted on the raw HTTP server ahead of Nest's body parsers and helmet:
 * the workbench streams uploads and sets its own security headers, and both
 * would be mangled by middleware written for a JSON API.
 */
@Injectable()
export class IdeProxy {
  private readonly logger = new Logger(IdeProxy.name);
  private readonly frameAncestors: string;
  private readonly secureCookie: boolean;
  /** The workbench's own origin: the API's public URL. */
  private readonly origin: string;

  constructor(
    private readonly ide: IdeService,
    private readonly tokens: IdeTokenService,
    config: ConfigService<Env, true>,
  ) {
    const web = config.get('WEB_BASE_URL', { infer: true });
    const origins = config
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map((o) => o.trim());
    this.frameAncestors = ["'self'", ...new Set([web, ...origins].filter(Boolean))].join(' ');
    const api = new URL(config.get('API_BASE_URL', { infer: true }));
    this.secureCookie = api.protocol === 'https:';
    this.origin = api.origin;
  }

  /** Express middleware: handles /ide/* and passes everything else on. */
  readonly http = (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const match = PREFIX.exec(req.url ?? '');
    if (!match) return next();
    void this.handleHttp(req, res, match[1]!, match[2] ?? '').catch((err: Error) => {
      this.logger.error(`IDE proxy: ${err.message}`);
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
  };

  attach(server: Server): void {
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const match = PREFIX.exec(req.url ?? '');
      if (!match) return;
      void this.handleUpgrade(req, socket, head, match[1]!, match[2] ?? '/').catch(() =>
        socket.destroy(),
      );
    });
  }

  private async handleHttp(
    req: IncomingMessage,
    res: ServerResponse,
    slug: string,
    rest: string,
  ): Promise<void> {
    const instance = this.ide.find(slug);
    if (!instance)
      return this.fail(res, 404, 'This workspace is not running. Reopen it from the Code lab.');

    const url = new URL(rest || '/', 'http://ide.local');
    const ticket = url.searchParams.get(TICKET_PARAM);
    if (ticket) {
      const claims = await this.tokens.redeemTicket(ticket, slug);
      if (!claims || claims.sub !== instance.userId) {
        return this.fail(res, 401, 'This workspace link has expired. Reopen it from the Code lab.');
      }
      url.searchParams.delete(TICKET_PARAM);
      const cookie = await this.tokens.signCookie(claims.sub, slug);
      res.writeHead(302, {
        'Set-Cookie': this.cookieHeader(slug, cookie),
        Location: `/ide/${slug}${url.pathname}${url.search}`,
        'Cache-Control': 'no-store',
      });
      res.end();
      return;
    }

    if (!(await this.authorised(req, instance))) {
      return this.fail(res, 401, 'Sign in to the LMS and open the Code lab to use this workspace.');
    }
    if (!SAFE_METHODS.has(req.method ?? 'GET') && !this.sameOrigin(req)) {
      return this.fail(res, 403, 'Requests to this workspace must come from the workspace itself.');
    }
    if (!rest || rest.startsWith('?')) {
      // Keep the trailing slash: the workbench resolves its assets relatively.
      res.writeHead(302, { Location: `/ide/${slug}/${rest}` });
      res.end();
      return;
    }

    this.ide.touch(instance);
    const upstream = request(
      {
        socketPath: instance.socketPath,
        method: req.method,
        path: rest,
        headers: this.forwardHeaders(req),
      },
      (up) => {
        const headers = { ...up.headers };
        for (const h of HOP_BY_HOP) delete headers[h];
        headers['content-security-policy'] = [
          ...[headers['content-security-policy'] ?? []].flat(),
          `frame-ancestors ${this.frameAncestors}`,
        ];
        delete headers['x-frame-options'];
        // Workspace paths carry the slug; keep them off other sites' logs.
        headers['referrer-policy'] = 'same-origin';
        res.writeHead(up.statusCode ?? 502, headers);
        up.pipe(res);
      },
    );
    upstream.on('error', () => {
      if (!res.headersSent) this.fail(res, 502, 'The workspace is restarting. Reload in a moment.');
      else res.destroy();
    });
    req.pipe(upstream);
  }

  private async handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    slug: string,
    rest: string,
  ): Promise<void> {
    const instance = this.ide.find(slug);
    if (!instance || !(await this.authorised(req, instance))) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      return;
    }
    // Browsers always send Origin on a websocket handshake. A socket opened
    // from another page would otherwise drive this learner's terminal.
    if (!this.sameOrigin(req)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }

    const upstream: Socket = connect(instance.socketPath);
    upstream.on('connect', () => {
      const headers = this.forwardHeaders(req);
      headers.connection = 'Upgrade';
      headers.upgrade = req.headers.upgrade ?? 'websocket';
      const lines = Object.entries(headers).flatMap(([k, v]) =>
        v === undefined ? [] : [v].flat().map((value) => `${k}: ${value}`),
      );
      upstream.write(`${req.method} ${rest} HTTP/1.1\r\n${lines.join('\r\n')}\r\n\r\n`);
      if (head.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });

    instance.sockets += 1;
    this.ide.touch(instance);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      instance.sockets -= 1;
      this.ide.touch(instance);
      upstream.destroy();
      socket.destroy();
    };
    upstream.on('error', close);
    upstream.on('close', close);
    socket.on('error', close);
    socket.on('close', close);
  }

  private async authorised(req: IncomingMessage, instance: IdeInstance): Promise<boolean> {
    const token = readCookie(req.headers.cookie, COOKIE);
    if (!token) return false;
    const claims = await this.tokens.verifyCookie(token, instance.slug);
    return claims?.sub === instance.userId;
  }

  /**
   * The cookie alone does not prove the request came from the workbench:
   * SameSite=Lax still lets a same-site page send it. Anything that can change
   * state must also carry the workbench's own Origin. A missing Origin is not
   * a browser acting for another page, so it is left to the cookie.
   */
  private sameOrigin(req: IncomingMessage): boolean {
    const origin = req.headers.origin;
    return origin === undefined || origin === this.origin;
  }

  /** Request headers minus hop-by-hop ones and minus our own credential. */
  private forwardHeaders(req: IncomingMessage): Record<string, string | string[] | undefined> {
    const headers: Record<string, string | string[] | undefined> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(k)) headers[k] = v;
    }
    const cookie = stripCookie(req.headers.cookie, COOKIE);
    if (cookie) headers.cookie = cookie;
    else delete headers.cookie;
    return headers;
  }

  private cookieHeader(slug: string, value: string): string {
    return [
      `${COOKIE}=${value}`,
      `Path=/ide/${slug}`,
      `Max-Age=${IDE_COOKIE_TTL_SECONDS}`,
      'HttpOnly',
      // Lax, never None: the web app and the API are one site (localhost, or
      // lms / lms-api under the same domain), so the framed workbench still
      // gets its cookie, and no other site's page can send it along.
      'SameSite=Lax',
      ...(this.secureCookie ? ['Secure'] : []),
    ].join('; ');
  }

  private fail(res: ServerResponse, status: number, message: string): void {
    res.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(
      `<!doctype html><meta charset="utf-8"><title>Code lab</title>` +
        `<body style="font:15px system-ui;background:#1f1f1f;color:#ccc;display:grid;place-items:center;height:100vh;margin:0">` +
        `<p>${message}</p></body>`,
    );
  }
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return undefined;
}

export function stripCookie(header: string | undefined, name: string): string | undefined {
  const kept = (header ?? '')
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith(`${name}=`));
  return kept.length ? kept.join('; ') : undefined;
}
