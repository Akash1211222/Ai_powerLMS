# Roles and what each one can reach

Ten roles. Each exists because somebody has a job the others should not be doing.
This is the reference; the enforcement lives in `packages/shared/src/rbac.ts` and
is pinned by `rbac.spec.ts` / `rbac.test.ts`.

## Two rules that decide everything

**Permissions decide what, rank decides to whom.** A permission answers "may this
person reset a password". It cannot answer "may they reset *that* person's
password", so every role also carries a rank (`ROLE_RANK`). You may act on
somebody strictly below you — never a peer, never upward. Two college admins
cannot reset each other; nobody reaches a super admin.

**A college is a wall, not a filter.** Every role except super admin is confined
to the organisations they are a member of. An operations lead reaches several
colleges by *being a member of each*, not by skipping `assertOrgAccess`. There is
no role that quietly sees everybody's data.

## The ladder

| Role | Rank | Job | Sees | Cannot |
|---|---|---|---|---|
| `SUPER_ADMIN` | 100 | Runs the platform | Every college, every table | — |
| `OPERATIONAL_LEAD` | 80 | Runs a portfolio of colleges | Every college they are a member of | Platform switches, raw tables, authoring, grading |
| `COLLEGE_ADMIN` | 70 | Runs one college end to end | Their college | Reach another college, flip platform flags |
| `BATCH_MANAGER` | 50 | Batch operations | Their whole college | Open Admin, author coursework, grade, placements |
| `TRAINER` | 50 | Teaches | **The students of batches they are assigned to** | Create batches, add/remove students, account support |
| `MENTOR` | 40 | One-to-one guidance | **Students who booked them** | Batches, coursework, grading, accounts |
| `PLACEMENT_OFFICER` | 40 | Gets students hired | Their whole college | Teach, grade, run batches, manage accounts |
| `RECRUITER` | 10 | Outside company | Job postings and their own applicants | Anything internal, incl. the alumni directory |
| `ALUMNI` | 10 | Refers juniors | Courses, postings, community | Current students' records |
| `STUDENT` | 10 | Learns | Their own record only | Any other student's anything |

Rank 50 twice is deliberate: a batch manager and a trainer are peers who cannot
act on each other.

## Student visibility

`student:view` means "may open a student record at all". `student:view-all`
widens that to the whole college, and **its absence is what narrows somebody to
their own batches** — the fail-closed default.

| Holds `student:view-all` | Does not |
|---|---|
| `SUPER_ADMIN`, `OPERATIONAL_LEAD`, `COLLEGE_ADMIN`, `BATCH_MANAGER`, `PLACEMENT_OFFICER` | `TRAINER`, `MENTOR` |

A trainer's reach comes from `BatchTrainer` rows; a mentor's from bookings and
claimed requests (`MentorBooking` / `MentorRequest`). Both are applied once, in
`assertStudentAccess`, so all eleven `/students/:id/*` endpoints narrow together
and nobody has to remember the twelfth.

Written as a *widening* permission on purpose: the deploy seed only adds
role→permission mappings, so removing `student:view` from a role would leave the
row in the database and the leak alive after its own fix shipped.

## Account support

`member:support` — issue a temporary password, or open somebody's account to see
what they see. Held by `SUPER_ADMIN`, `OPERATIONAL_LEAD`, `COLLEGE_ADMIN`,
`BATCH_MANAGER`.

Deliberately not `user:manage` (a batch manager cannot open Admin at all, yet is
exactly who a student goes to when they cannot sign in) and deliberately not
`student:view` (a trainer needs to read a student's record without being able to
become them).

**A password is never shown.** Only an argon2 hash is stored and there is no way
back from it. Reset + view-as covers the real need better than a password would,
and leaves an audit record of who looked at whose account.

## Nobody signs themselves up

There is no public registration. Every account is created by somebody above it
and the password is shown once at creation. You may hand out your own rank, never
above it — `assertMayAssignRole` enforces that on both member creation and role
grants, so a college admin cannot mint an operations lead and read the password
off the screen.

## Menus

`buildNav` in `apps/web/src/lib/nav-items.ts` is a pure function of the
permission set, pinned per role by `nav-items.spec.ts`. Nothing is hardcoded
visible.
