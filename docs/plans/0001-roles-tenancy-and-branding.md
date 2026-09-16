# Plan 0001 — One product, two businesses, many colleges

- Status: **Delivered** (all six steps shipped)
- Raised: 2026-08-15, from a hand-drawn hierarchy sketch
- Delivered: 2026-08-29 → 2026-08-31

## Context

The product serves two businesses on one codebase: individuals who buy a course
on futurecorpacademy.in (B2C), and colleges that subscribe and bring their own
staff (B2B). Both were already modelled as tenants and isolated correctly, but
three things blocked selling it:

1. **Every role saw almost every screen.** 7 of 17 sidebar items were hardcoded
   visible, so a batch manager was shown Skills, Career, Mentorship and Alumni.
   The permission matrix was fine — the navigation never consulted it.
2. **No role for the person who runs several colleges.** Only `SUPER_ADMIN`
   crossed tenants, and it carries database and feature-flag access that an
   operations person should not have.
3. **A college could not be made to feel like theirs** — an organisation had a
   name and nothing else.

## The one request that had to be met differently

The ask was for a batch manager to see a student's password, even after the
student changed it. **That cannot be built, and should not be.** Passwords are
not stored — only an argon2 hash, which is one-way by design. Storing readable
passwords would mean one leaked staff account exposes every student's password,
students who reuse passwords lose their email and bank logins too, and the DPDP
Act 2023 "reasonable security safeguards" duty is not met — which institutional
buyers will ask about.

The need behind it was valid: a batch manager must be able to help a student who
cannot get in. Three things deliver that without keeping passwords:

| What the batch manager gets | How |
|---|---|
| Always sees the login ID | Email / enrolment ID is plain data, never hidden |
| Reset to a temporary password | Shown once, forced change at next login, works even if the student changed theirs |
| "View as student" | Opens the LMS as that student, no password, every use audit-logged |

In practice this is *better* than knowing the password: the manager sees the
student's screen, which a password alone does not give them, and there is a
record of who looked at whose account.

## Portfolios are membership, not a bypass

The tempting shortcut was to let `OPERATIONAL_LEAD` skip the ownership test.
Rejected: every org-scoped endpoint funnels through one question — *is this
person a member of this organisation?* — and that check is the only wall between
customers. Special-casing a role inside it punches a permanent hole every future
endpoint has to remember.

Portfolios-by-membership needs no change to that code at all: the lead genuinely
is a member of the colleges they run, so the existing answer is already correct.
It also makes handover, holiday cover and "which colleges does Priya run?" fall
out for free, and keeps the blast radius of a leaked account to her colleges
rather than every customer.

## What shipped

| Step | Outcome |
|---|---|
| 1. Label the tenants | `futurecorp-academy` is `INTERNAL`; colleges stay `COLLEGE`, applied idempotently by `deploy/seed-rbac.mjs` |
| 2. Menu follows role | `buildNav` is a pure function of permissions, pinned per role by tests. Batch manager dropped from 15 items to 12 |
| 3. Course access screen | Recorded and live are independent tick lists on the member form; an enrolment with no batch *is* recorded-only |
| 4. `OPERATIONAL_LEAD` | The tenth role, with `ROLE_RANK` / `outranks()` alongside it |
| 5. View-as, audit-logged | Short-lived access token, no refresh token, read-only, `actorUserId` recorded |
| 6. Per-college branding | Name, logo and colour on the organisation, applied from the shell — see plan 0003 for the full-palette follow-up |

Also delivered alongside: the Colleges admin section (nothing created an
organisation before — colleges only ever arrived through a seed), assigning an
operations lead as the college is opened, and the portfolio overview screen.
