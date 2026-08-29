/** The authenticated principal attached to a request by JwtAuthGuard. */
export interface AuthUser {
  userId: string;
  email: string;
  /** True while the account still has its admin-issued default password. */
  mustChangePassword?: boolean;
  /**
   * Set when staff are viewing this account rather than its owner using it.
   * Carries the staff member's id, so anything recorded says who was driving.
   */
  impersonatedBy?: string;
}

/** Express request augmented with the authenticated user + request id. */
export interface AuthedRequest {
  user?: AuthUser;
  requestId?: string;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}
