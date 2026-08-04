import { z } from 'zod';
import { ROLES, type RoleName } from '@fca/shared';

const roleEnum = z.enum(ROLES as unknown as [RoleName, ...RoleName[]]);

export const listMembersQuerySchema = z.object({
  organizationId: z.string().min(1),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListMembersQuery = z.infer<typeof listMembersQuerySchema>;

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
