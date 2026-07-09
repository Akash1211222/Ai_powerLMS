/** The authenticated principal attached to a request by JwtAuthGuard. */
export interface AuthUser {
  userId: string;
  email: string;
}

/** Express request augmented with the authenticated user + request id. */
export interface AuthedRequest {
  user?: AuthUser;
  requestId?: string;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}
