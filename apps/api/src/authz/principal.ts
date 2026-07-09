import type { Permission } from '@fca/shared';

/**
 * The effective authorization context for a user, resolved from their role
 * assignments. Permissions are tracked at two scopes (§5):
 *  - `globalPermissions`: granted by platform-level roles (organizationId null),
 *    and therefore apply in every organization.
 *  - `orgPermissions`: granted by org-scoped roles; apply only within that org.
 */
export interface Principal {
  userId: string;
  isSuperAdmin: boolean;
  globalPermissions: Set<Permission>;
  orgPermissions: Map<string, Set<Permission>>;
  /** Organizations the user belongs to (for tenant isolation checks). */
  organizationIds: Set<string>;
}

/**
 * Pure authorization decision (§39: server-side, explainable). Kept free of I/O
 * so it is exhaustively unit-testable.
 *
 * @param scopeOrgId When a request targets a specific organization, pass its id
 *   so org-scoped grants are honored. Pass null when the action is not tied to a
 *   particular organization (then a grant in ANY of the user's orgs suffices).
 */
export function hasPermission(
  principal: Principal,
  required: Permission,
  scopeOrgId: string | null,
): boolean {
  if (principal.isSuperAdmin) return true;
  if (principal.globalPermissions.has(required)) return true;

  if (scopeOrgId) {
    return principal.orgPermissions.get(scopeOrgId)?.has(required) ?? false;
  }
  // No specific scope: satisfied if the user holds it in any of their orgs.
  for (const set of principal.orgPermissions.values()) {
    if (set.has(required)) return true;
  }
  return false;
}

/** All required permissions must be satisfied (AND semantics). */
export function hasAllPermissions(
  principal: Principal,
  required: Permission[],
  scopeOrgId: string | null,
): boolean {
  return required.every((p) => hasPermission(principal, p, scopeOrgId));
}

/** Whether the user belongs to (or platform-administers) an organization. */
export function isMemberOf(principal: Principal, organizationId: string): boolean {
  return principal.isSuperAdmin || principal.organizationIds.has(organizationId);
}
