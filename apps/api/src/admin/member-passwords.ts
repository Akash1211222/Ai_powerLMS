import type { RoleName } from '@fca/shared';

/**
 * Initial passwords for admin-created accounts, by role.
 *
 * The academy issues credentials by hand, so these are deliberately uniform
 * and easy to read out. That is a real trade-off: everyone with a given role
 * starts from the same well-known password, so an attacker who learns one
 * member's email can reach any account of that role until the member changes
 * it. Mitigations in place are per-account login lockout and per-IP rate
 * limiting; the durable fix is to require a change at first login.
 *
 * Every value is overridable per role without a redeploy — set e.g.
 * MEMBER_DEFAULT_PASSWORD_STUDENT in the server .env — so these can be
 * rotated if one leaks.
 */
const FALLBACKS: Record<RoleName, string> = {
  SUPER_ADMIN: 'SuperAdmin123!',
  OPERATIONAL_LEAD: 'OpsLead123!',
  COLLEGE_ADMIN: 'Admin123!',
  BATCH_MANAGER: 'Manager123!',
  TRAINER: 'Teacher123!',
  MENTOR: 'Mentor123!',
  PLACEMENT_OFFICER: 'Placement123!',
  RECRUITER: 'Recruiter123!',
  ALUMNI: 'Alumni123!',
  STUDENT: 'Student123!',
};

/** `MEMBER_DEFAULT_PASSWORD_TRAINER` overrides the built-in for TRAINER. */
export function defaultPasswordForRole(
  role: RoleName,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override = env[`MEMBER_DEFAULT_PASSWORD_${role}`];
  return override && override.length > 0 ? override : FALLBACKS[role];
}
