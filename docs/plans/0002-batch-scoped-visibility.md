# Plan 0002 — Teach one batch, see one batch

- Status: **Delivered** (`88ce276`, deployed 2026-08-30)

## Context

`student:view` meant *every student in the college*. A trainer hired to take one
batch could open the marks, risk score, career profile and placement record of
everybody the college had — and, because the reset-password and view-as routes
were gated on the same permission, could issue themselves a password for any of
them and sign in as them. Mentors too.

Nothing in the suite noticed, because every staff drill-down test signed in as a
super admin.

## Decisions taken

- A trainer sees **only the students of batches they are assigned to**.
- Password reset and view-as belong to **batch manager, college admin,
  operations lead, super admin** — not trainers, mentors or placement officers.
- Batch manager and placement officer keep college-wide student visibility: the
  batch desk runs every batch, and you cannot place students you cannot see.

## Approach

Both changes are expressed as **new permissions** (`student:view-all`,
`member:support`) rather than removals. This is the load-bearing decision: the
deploy seed only adds mappings, so taking `student:view` away from `TRAINER`
would have left the row in the database and the leak alive after its own fix
shipped. Absence is now the narrow case, and absence needs nothing to happen.

The narrowing is one function. `assertStudentAccess` already stood in front of
all eleven `/students/:id/*` endpoints, so the rule was added there rather than
at each call site. Batch lists, the cohort view and the at-risk queue take the
same scope through a shared `where` fragment (`visibleBatchWhere`).

`assertOrgAccess` is untouched — the new check runs strictly after it, so the
wall between customers cannot regress by construction. There is a test for
exactly that.

## Mentors

A mentor is on no batch, so batch scoping alone would have left them unable to
open the record of the student sitting in front of them. Their reach comes from
bookings and claimed requests instead.

Known weakness, documented in the code: it never lapses — a session from two
years ago still counts. The proper fix is a `MentorAssignment` model mirroring
`BatchTrainer`; that is separate product work and should not block mentors from
working in the meantime.

## The revoke mechanism

`REVOKED_ROLE_PERMISSIONS` in `rbac.ts` plus a delete loop in
`deploy/seed-rbac.mjs`, shipped **empty**. Nothing in this plan needed revoking
by design, but the mechanism should exist before it is urgent.

Deliberately *not* "delete every mapping not in `DEFAULT_ROLE_PERMISSIONS`":
`role:manage` exists, so a college may have granted something by hand, and a
rollback to an older API would strip permissions the running code still needs.

## Follow-ups delivered separately

- **Batch manager dashboard** (`79c546b`) — it read `BatchTrainer` and nothing
  else, so it was empty for every batch manager in every college. "My batches" is
  a different question for the two roles at rank 50.
- **Role escalation** — `createMember` had no rank check, so a college admin
  could mint an operations lead and read the password off the screen. You may now
  hand out your own rank, never above it.
