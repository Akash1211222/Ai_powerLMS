import { z } from 'zod';
import { ROLES, type RoleName } from '@fca/shared';

const roleEnum = z.enum(ROLES as unknown as [RoleName, ...RoleName[]]);

export const listMembersQuerySchema = z.object({
  organizationId: z.string().min(1),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListMembersQuery = z.infer<typeof listMembersQuerySchema>;

/**
 * Admin-created accounts. There is no self-signup, so this is the only way a
 * member enters the system. The password is not accepted from the client: it
 * is derived from the role (see member-passwords.ts) and returned once so the
 * admin can pass it on.
 */
export const createMemberSchema = z.object({
  organizationId: z.string().min(1),
  email: z.string().trim().toLowerCase().email().max(254),
  firstName: z.string().min(1).max(80).trim(),
  lastName: z.string().min(1).max(80).trim(),
  role: roleEnum,
});
export type CreateMemberDto = z.infer<typeof createMemberSchema>;

export const grantRoleSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  role: roleEnum,
});
export type GrantRoleDto = z.infer<typeof grantRoleSchema>;

export const revokeRoleSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  role: roleEnum,
});
export type RevokeRoleDto = z.infer<typeof revokeRoleSchema>;

export const updateFlagSchema = z.object({
  enabled: z.boolean(),
});
export type UpdateFlagDto = z.infer<typeof updateFlagSchema>;
