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
  /**
   * What the account can reach on day one.
   *
   * A student who buys on the website is paying for one of two things, and
   * sometimes both: the recorded material, or a seat in a live batch. The two
   * are separate because they are sold separately — somebody can buy the
   * recordings now and join a cohort next month.
   *
   * The distinction is already in the data: an enrolment with no batch is
   * recorded access, and one with a batch is a live seat. Nothing offered the
   * choice, so every account was created with neither.
   */
  recordedCourseIds: z.array(z.string().min(1)).max(50).optional(),
  batchIds: z.array(z.string().min(1)).max(20).optional(),
});
export type CreateMemberDto = z.infer<typeof createMemberSchema>;

/**
 * A colour that will end up inside a stylesheet, so only a hex value is
 * accepted — see brand-theme.ts on the web side, which drops anything else.
 * Validated here too: an API is not made safe by a careful client.
 */
const hexColour = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Use a hex colour like #1e3a8a');

/**
 * Logos are fetched by the browser from wherever the college hosts them. https
 * only: an http image on an https page is blocked as mixed content, so allowing
 * it would only produce a logo that silently never appears.
 */
const logoUrl = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((u) => u.startsWith('https://'), 'The logo address must start with https://');

/**
 * The people who will run this college.
 *
 * Offered at creation because a college with nobody attached is inert — you
 * cannot add its staff until somebody can reach it, and the operations lead is
 * who does that. Ids rather than emails: these are existing people being given
 * another college, not new accounts.
 */
const operationalLeadIds = z.array(z.string().min(1)).max(20).optional();

export const createOrganizationSchema = z.object({
  name: z.string().min(2).max(120).trim(),
  /** What it calls itself on screen, when shorter than the legal name. */
  displayName: z.string().min(1).max(80).trim().optional(),
  type: z.enum(['COLLEGE', 'COMPANY', 'INTERNAL']).default('COLLEGE'),
  logoUrl: logoUrl.optional(),
  primaryColor: hexColour.optional(),
  operationalLeadIds,
});
export type CreateOrganizationDto = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z.object({
  displayName: z.string().min(1).max(80).trim().nullable().optional(),
  logoUrl: logoUrl.nullable().optional(),
  primaryColor: hexColour.nullable().optional(),
});
export type UpdateOrganizationDto = z.infer<typeof updateOrganizationSchema>;

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
