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

/**
 * A one-off password for a reset.
 *
 * Deliberately not the role default. Those are uniform by design so they can be
 * read out over a phone, which also means everyone holding a role shares one —
 * fine for an account that has never been used, wrong for an account somebody
 * is already locked out of. This is random, still easy to dictate, and dies at
 * first login because the reset forces a change.
 *
 * Ambiguous characters are left out: nobody should have to ask whether that was
 * a one or an ell.
 */
export function temporaryPassword(bytes: (n: number) => Buffer): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const raw = bytes(12);
  const body = Array.from(raw, (b) => alphabet[b % alphabet.length]).join('');
  // Grouped for reading aloud, and shaped to satisfy the password policy.
  return `${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}!7`;
}
