-- Why a session ended.
--
-- A refresh token replayed after rotation may be an honest race between two
-- browser tabs, so that one case is tolerated briefly. A session ended by
-- logout, a password change or reuse detection must die immediately, and
-- telling those apart needs the reason recorded rather than inferred.
--
-- Nullable and additive: rows revoked before this migration read as NULL,
-- which is not ROTATED, so they are never eligible for the grace window.
ALTER TABLE "sessions" ADD COLUMN "revokedReason" TEXT;
