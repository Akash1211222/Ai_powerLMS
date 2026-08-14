/**
 * DEMO seed — realistic, interconnected sample data so every dashboard and
 * screen has something to show. Idempotent: it clears prior demo artifacts
 * (users @demo.futurecorp.in, courses `demo-*`, batches `DEMO*`, org
 * `futurecorp-north`) and recreates them.
 *
 * Safe to run against a public deployment: every account it creates lives on
 * @demo.futurecorp.in (the only thing cleanup removes), and passwords are
 * random unless DEMO_SEED_PASSWORD is set.
 *
 * Run:  DATABASE_URL=... pnpm --filter @fca/database exec tsx prisma/demo-seed.ts
 */
import { randomBytes } from 'node:crypto';
import { PrismaClient, type Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { skillSlug } from '@fca/shared';

const prisma = new PrismaClient();
const DEMO_DOMAIN = '@demo.futurecorp.in';

/**
 * The account the public demo signs visitors into. Must match
 * DEMO_STUDENT_EMAIL in the API's environment.
 */
const DEMO_STUDENT_EMAIL = 'student' + DEMO_DOMAIN;

/**
 * Password for every seeded persona.
 *
 * Random unless explicitly supplied, so a public deployment ends up with demo
 * accounts nobody can sign into by password at all — the demo hands out a
 * session through POST /auth/demo, which needs no credential. Set
 * DEMO_SEED_PASSWORD locally when you want to log in as a trainer or admin to
 * look around.
 */
const PASSWORD = process.env.DEMO_SEED_PASSWORD ?? randomBytes(24).toString('hex');

// --- deterministic helpers -------------------------------------------------
// A seeded PRNG (mulberry32) rather than Math.random: a demo you can re-run and
// get the same cohort back is far easier to script screenshots and talks around.
let _rngState = 0x9e3779b9;
function rnd(): number {
  _rngState |= 0;
  _rngState = (_rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(_rngState ^ (_rngState >>> 15), 1 | _rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]!;
/** Fisher-Yates. `sort(() => rnd() - 0.5)` is biased and engine-dependent. */
function shuffled<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
const randInt = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const daysFromNow = (d: number) => new Date(Date.now() + d * 86400000);

const FIRST = [
  'Aarav', 'Diya', 'Vivaan', 'Ananya', 'Aditya', 'Ishaan', 'Saanvi', 'Kabir', 'Myra', 'Reyansh',
  'Anika', 'Arjun', 'Kiara', 'Vihaan', 'Aadhya', 'Rohan', 'Navya', 'Dhruv', 'Riya', 'Krishna',
  'Sara', 'Yash', 'Tara', 'Neel', 'Zoya', 'Advait', 'Ira', 'Kabeer', 'Meher', 'Ayaan',
  'Prisha', 'Atharv', 'Avni', 'Shaurya', 'Pari', 'Veer', 'Amaira', 'Ranbir', 'Nitara', 'Samar',
  'Ahana', 'Devansh', 'Mishka', 'Rudra', 'Aarohi', 'Kian', 'Siya', 'Ojas', 'Inaya', 'Hriday',
];
const LAST = [
  'Sharma', 'Verma', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Gupta', 'Mehta', 'Rao', 'Das',
  'Bose', 'Khan', 'Menon', 'Kapoor', 'Chopra', 'Joshi', 'Malhotra', 'Banerjee', 'Pillai', 'Ahuja',
  'Sinha', 'Chauhan', 'Bhatt', 'Kulkarni', 'Ghosh',
];

interface CourseDef {
  slug: string;
  title: string;
  level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  summary: string;
  org: 'demo' | 'north';
  program: string;
  modules: { title: string; lessons: string[] }[];
  topics: string[]; // used for assessment questions
}

const COURSES: CourseDef[] = [
  {
    slug: 'demo-python-data', title: 'Python for Data Analytics', level: 'BEGINNER', org: 'demo',
    program: 'Data Analytics', topics: ['Python', 'NumPy', 'Pandas'],
    summary: 'Foundations of data analysis with Python, NumPy and Pandas.',
    modules: [
      { title: 'Python Basics', lessons: ['Variables & Types', 'Control Flow', 'Functions'] },
      { title: 'NumPy', lessons: ['Arrays', 'Broadcasting', 'Aggregations'] },
      { title: 'Pandas', lessons: ['Series & DataFrame', 'GroupBy', 'Merge & Join', 'Visualization'] },
    ],
  },
  {
    slug: 'demo-sql-databases', title: 'SQL & Databases', level: 'INTERMEDIATE', org: 'demo',
    program: 'Data Analytics', topics: ['SQL', 'Joins', 'Window Functions'],
    summary: 'Query, model and optimize relational databases with SQL.',
    modules: [
      { title: 'SQL Fundamentals', lessons: ['SELECT & WHERE', 'Aggregations', 'GROUP BY'] },
      { title: 'Joins & Subqueries', lessons: ['INNER & OUTER Joins', 'Subqueries', 'CTEs'] },
      { title: 'Advanced SQL', lessons: ['Window Functions', 'Indexing', 'Query Tuning'] },
    ],
  },
  {
    slug: 'demo-ml-foundations', title: 'Machine Learning Foundations', level: 'ADVANCED', org: 'demo',
    program: 'Data Analytics', topics: ['Regression', 'Classification', 'Model Evaluation'],
    summary: 'Core supervised learning: regression, classification and evaluation.',
    modules: [
      { title: 'Regression', lessons: ['Linear Regression', 'Regularization', 'Metrics'] },
      { title: 'Classification', lessons: ['Logistic Regression', 'Decision Trees', 'Ensembles'] },
      { title: 'Model Evaluation', lessons: ['Train/Test Split', 'Cross Validation', 'ROC & AUC'] },
    ],
  },
  {
    slug: 'demo-fullstack-web', title: 'Full-Stack Web Development', level: 'INTERMEDIATE', org: 'demo',
    program: 'Software Engineering', topics: ['JavaScript', 'React', 'Node', 'APIs'],
    summary: 'Build modern web apps with React, Node and REST APIs.',
    modules: [
      { title: 'Frontend', lessons: ['HTML & CSS', 'JavaScript', 'React Components', 'State & Hooks'] },
      { title: 'Backend', lessons: ['Node & Express', 'REST APIs', 'Auth'] },
      { title: 'Databases', lessons: ['Postgres Basics', 'Prisma ORM', 'Deployment'] },
    ],
  },
  {
    slug: 'demo-cloud-devops', title: 'Cloud & DevOps Essentials', level: 'INTERMEDIATE', org: 'demo',
    program: 'Software Engineering', topics: ['Linux', 'Docker', 'CI/CD', 'Cloud'],
    summary: 'Ship and operate software with Docker, CI/CD and the cloud.',
    modules: [
      { title: 'Linux & Shell', lessons: ['Command Line', 'Scripting', 'Permissions'] },
      { title: 'Containers', lessons: ['Docker Basics', 'Images & Volumes', 'Compose'] },
      { title: 'CI/CD & Cloud', lessons: ['GitHub Actions', 'Cloud Deploy', 'Monitoring'] },
    ],
  },
];

async function cleanup() {
  console.log('🧹 Clearing prior demo data...');
  const demoUsers = await prisma.user.findMany({
    where: { email: { endsWith: DEMO_DOMAIN } },
    select: { id: true },
  });
  const demoUserIds = demoUsers.map((u) => u.id);
  const demoBatches = await prisma.batch.findMany({
    where: { code: { startsWith: 'DEMO' } },
    select: { id: true },
  });
  const demoBatchIds = demoBatches.map((b) => b.id);

  const demoOrgRow = await prisma.organization.findUnique({ where: { slug: 'futurecorp-demo' }, select: { id: true } });

  // Phase 3/4 data is owned by the ORG, so it does not cascade with the demo
  // users. Order matters: children before parents.
  if (demoOrgRow) {
    await prisma.referral.deleteMany({ where: { opportunity: { organizationId: demoOrgRow.id } } });
    await prisma.application.deleteMany({ where: { opportunity: { organizationId: demoOrgRow.id } } });
    await prisma.opportunity.deleteMany({ where: { organizationId: demoOrgRow.id } });
    // Social hub (children before parents)
    await prisma.communityMessage.deleteMany({
      where: { conversation: { organizationId: demoOrgRow.id } },
    });
    await prisma.conversationMember.deleteMany({
      where: { conversation: { organizationId: demoOrgRow.id } },
    });
    await prisma.conversation.deleteMany({ where: { organizationId: demoOrgRow.id } });
    await prisma.communityEventRsvp.deleteMany({
      where: { event: { organizationId: demoOrgRow.id } },
    });
    await prisma.communityEvent.deleteMany({ where: { organizationId: demoOrgRow.id } });
    await prisma.communityGroupMember.deleteMany({
      where: { group: { organizationId: demoOrgRow.id } },
    });
    await prisma.communityGroup.deleteMany({ where: { organizationId: demoOrgRow.id } });
    await prisma.communityStudyRoomPresence.deleteMany({
      where: { room: { organizationId: demoOrgRow.id } },
    });
    await prisma.communityStudyRoom.deleteMany({ where: { organizationId: demoOrgRow.id } });
    await prisma.communityPostReaction.deleteMany({
      where: { post: { organizationId: demoOrgRow.id } },
    });
    await prisma.communityPostComment.deleteMany({
      where: { post: { organizationId: demoOrgRow.id } },
    });
    await prisma.communityPost.deleteMany({ where: { organizationId: demoOrgRow.id } });
    await prisma.communityChannelMember.deleteMany({
      where: { channel: { organizationId: demoOrgRow.id } },
    });
    await prisma.communityChannel.deleteMany({ where: { organizationId: demoOrgRow.id } });
    await prisma.communityQuestion.deleteMany({ where: { organizationId: demoOrgRow.id } }); // cascades answers + votes
  }
  // Mentor/alumni artefacts for the users we're about to remove.
  await prisma.mentorBooking.deleteMany({ where: { OR: [{ mentorId: { in: demoUserIds } }, { studentId: { in: demoUserIds } }] } });
  await prisma.mentorSlot.deleteMany({ where: { mentorId: { in: demoUserIds } } });
  await prisma.achievement.deleteMany({ where: { userId: { in: demoUserIds } } });

  // Enrollments reference batch via SetNull, so remove them explicitly first.
  await prisma.enrollment.deleteMany({ where: { batchId: { in: demoBatchIds } } });
  await prisma.batch.deleteMany({ where: { id: { in: demoBatchIds } } }); // cascades members/attendance/assignments/assessments
  await prisma.course.deleteMany({ where: { slug: { startsWith: 'demo-' } } });
  await prisma.notification.deleteMany({ where: { userId: { in: demoUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: demoUserIds } } });
  await prisma.organization.deleteMany({ where: { slug: 'futurecorp-north' } });
}

async function main() {
  console.log('🌱 Seeding DEMO data...');
  await cleanup();

  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  const roles = new Map((await prisma.role.findMany()).map((r) => [r.name, r]));

  // Skill lookup for course→skill mapping. The taxonomy itself is seeded by the
  // API on boot (SkillsService.onModuleInit); student skill scores are computed
  // by POST /api/v1/admin/skills/recompute-all after seeding.
  const skillIdBySlug = new Map((await prisma.skill.findMany()).map((s) => [s.slug, s.id]));
  const roleId = (name: string) => roles.get(name)!.id;

  // --- Organizations ------------------------------------------------------
  const demoOrg = await prisma.organization.upsert({
    where: { slug: 'futurecorp-demo' },
    update: {},
    create: { name: 'FutureCorp Demo College', slug: 'futurecorp-demo', type: 'COLLEGE' },
  });
  const northOrg = await prisma.organization.create({
    data: { name: 'FutureCorp North Campus', slug: 'futurecorp-north', type: 'COLLEGE' },
  });
  const orgId = (k: 'demo' | 'north') => (k === 'demo' ? demoOrg.id : northOrg.id);

  async function ensureUser(
    email: string,
    firstName: string,
    lastName: string,
    role: string,
    org: 'demo' | 'north',
  ) {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(0),
        profile: { create: { firstName, lastName } },
      },
    });
    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: orgId(org), userId: user.id } },
      update: {},
      create: { organizationId: orgId(org), userId: user.id, isPrimary: true },
    });
    const existingRole = await prisma.userRole.findFirst({
      where: { userId: user.id, roleId: roleId(role), organizationId: orgId(org) },
    });
    if (!existingRole) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: roleId(role), organizationId: orgId(org) } });
    }
    return user;
  }

  // --- Trainers (reuse the base-seed trainer as one of them) --------------
  // Personas live on the demo domain only. Adopting real @futurecorpacademy.in
  // accounts used to pull actual staff into the demo organisation — where a
  // public visitor's org-scoped queries can see them — and left them behind,
  // since cleanup() only removes the demo domain.
  const trainerDemo0 = await ensureUser('trainer' + DEMO_DOMAIN, 'Tara', 'Rao', 'TRAINER', 'demo');
  const trainerDemo1 = await ensureUser('trainer1' + DEMO_DOMAIN, 'Meera', 'Krishnan', 'TRAINER', 'demo');
  const trainerDemo2 = await ensureUser('trainer2' + DEMO_DOMAIN, 'Sanjay', 'Pillai', 'TRAINER', 'demo');
  const trainerDemo3 = await ensureUser('trainer3' + DEMO_DOMAIN, 'Farah', 'Sheikh', 'TRAINER', 'demo');
  const trainerDemo4 = await ensureUser('trainer4' + DEMO_DOMAIN, 'Vikram', 'Desai', 'TRAINER', 'demo');
  // Five teachers, all on the demo domain.
  const demoTrainers = [trainerDemo0, trainerDemo1, trainerDemo2, trainerDemo3, trainerDemo4];

  // --- Students -----------------------------------------------------------
  const seedStudent = await ensureUser(DEMO_STUDENT_EMAIL, 'Sam', 'Learner', 'STUDENT', 'demo');
  const demoStudents = [seedStudent];
  const STUDENT_COUNT = 99; // + the base-seed student = 100
  for (let i = 1; i <= STUDENT_COUNT; i++) {
    // Offset the surname so names don't repeat in lockstep with first names.
    const u = await ensureUser(
      `student${i}${DEMO_DOMAIN}`,
      FIRST[(i - 1) % FIRST.length]!,
      LAST[((i - 1) * 7) % LAST.length]!,
      'STUDENT',
      'demo',
    );
    demoStudents.push(u);
  }

  // --- Courses (with modules + lessons) -----------------------------------
  const courseBySlug = new Map<string, { id: string; org: 'demo' | 'north'; topics: string[]; lessonIds: string[] }>();
  const programCache = new Map<string, string>();
  for (const c of COURSES) {
    const progKey = `${c.org}:${c.program}`;
    let programId = programCache.get(progKey);
    if (!programId) {
      const slug = c.program.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const program = await prisma.program.upsert({
        where: { organizationId_slug: { organizationId: orgId(c.org), slug } },
        update: {},
        create: { organizationId: orgId(c.org), name: c.program, slug },
      });
      programId = program.id;
      programCache.set(progKey, programId);
    }
    const creator = demoTrainers[0]!.id;
    const course = await prisma.course.create({
      data: {
        organizationId: orgId(c.org),
        programId,
        title: c.title,
        slug: c.slug,
        summary: c.summary,
        level: c.level,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        createdById: creator,
        modules: {
          create: c.modules.map((m, mi) => ({
            title: m.title,
            order: mi,
            lessons: {
              create: m.lessons.map((l, li) => ({
                title: l,
                order: li,
                type: 'VIDEO',
                durationSec: randInt(300, 1500),
              })),
            },
          })),
        },
      },
      include: { modules: { include: { lessons: true } } },
    });
    const lessonIds = course.modules.flatMap((m) => m.lessons.map((l) => l.id));
    courseBySlug.set(c.slug, { id: course.id, org: c.org, topics: c.topics, lessonIds });

    // Map the course's topics onto the skill taxonomy (§20).
    for (const topic of c.topics) {
      const skillId = skillIdBySlug.get(skillSlug(topic));
      if (skillId) {
        await prisma.courseSkill.upsert({
          where: { courseId_skillId: { courseId: course.id, skillId } },
          update: {},
          create: { courseId: course.id, skillId },
        });
      }
    }
  }

  // --- Batches: one per course; assign trainer + students -----------------
  // Four batches, all in the demo college, so one dashboard shows the whole
  // cohort. A second trainer rides along on each as ASSISTANT.
  const batchPlan = [
    { course: 'demo-python-data', code: 'DEMO-PY-01', name: 'Python Data · Batch A', trainer: demoTrainers[0]!, assistant: demoTrainers[1] },
    { course: 'demo-sql-databases', code: 'DEMO-SQL-01', name: 'SQL & Databases · Batch A', trainer: demoTrainers[1]!, assistant: demoTrainers[2] },
    { course: 'demo-ml-foundations', code: 'DEMO-ML-01', name: 'ML Foundations · Batch A', trainer: demoTrainers[2]!, assistant: demoTrainers[3] },
    { course: 'demo-fullstack-web', code: 'DEMO-FS-01', name: 'Full-Stack Web · Batch A', trainer: demoTrainers[3]!, assistant: demoTrainers[4] },
  ];
  const STUDENTS_PER_BATCH = Math.floor((demoStudents.length) / batchPlan.length); // 25

  // distribute students across batches
  const demoQueue = [...demoStudents];
  // Collected so later sections (community channels) can reference a real
  // batch. Previously nothing kept the created rows, and the channel setup
  // reached for `demoBatches` — a local inside cleanup() — which crashed the
  // whole seed after every record had already been written.
  const createdBatches: Array<{ id: string; code: string }> = [];
  let demoBatchesCount = 0;
  let studentsEnrolled = 0;
  let sessionsCreated = 0;
  let submissionsCreated = 0;
  let attemptsCreated = 0;

  for (const bp of batchPlan) {
    const course = courseBySlug.get(bp.course)!;
    const org = course.org;
    if (org === 'demo') demoBatchesCount++;
    const batch = await prisma.batch.create({
      data: {
        organizationId: orgId(org),
        courseId: course.id,
        name: bp.name,
        code: bp.code,
        status: 'ACTIVE',
        capacity: 30,
        startDate: daysFromNow(-30),
        endDate: daysFromNow(60),
        createdById: bp.trainer.id,
        trainers: {
          create: [
            { userId: bp.trainer.id, role: 'LEAD' },
            ...(bp.assistant && bp.assistant.id !== bp.trainer.id
              ? [{ userId: bp.assistant.id, role: 'ASSISTANT' as const }]
              : []),
          ],
        },
        schedules: {
          create: [
            { title: 'Live Session — Q&A', startsAt: daysFromNow(2), endsAt: daysFromNow(2.08), location: 'Online' },
            { title: 'Live Session — Project Review', startsAt: daysFromNow(5), endsAt: daysFromNow(5.08), location: 'Online' },
            { title: 'Guest Lecture', startsAt: daysFromNow(9), endsAt: daysFromNow(9.08), location: 'Auditorium' },
          ],
        },
      },
    });
    createdBatches.push({ id: batch.id, code: batch.code });

    // Enroll a full cohort (~25) per batch.
    const queue = demoQueue;
    const cohort = queue.splice(0, STUDENTS_PER_BATCH);
    const totalLessons = course.lessonIds.length;

    // ~16% of each cohort gets a struggling profile (absent, inactive, weak
    // scores) so the at-risk engine has something real to detect (§18), and a
    // further slice is "borderline" so the risk levels aren't all-or-nothing.
    const strugglingCount = Math.max(1, Math.round(cohort.length * 0.16));
    const strugglingIds = new Set<string>(cohort.slice(-strugglingCount).map((s) => s.id));
    const isStruggling = (id: string) => strugglingIds.has(id);
    // A borderline tier sitting between thriving and struggling: patchy
    // attendance and middling scores. Without it every student lands on LOW or
    // CRITICAL and the at-risk queue looks binary rather than like a real cohort.
    const borderlineCount = Math.max(1, Math.round(cohort.length * 0.2));
    const borderlineIds = new Set<string>(
      cohort.slice(-(strugglingCount + borderlineCount), -strugglingCount).map((s) => s.id),
    );
    const isBorderline = (id: string) => borderlineIds.has(id);

    for (const s of cohort) {
      await prisma.batchStudent.create({ data: { batchId: batch.id, userId: s.id, status: 'ACTIVE' } });
      const struggling = isStruggling(s.id);
      const completed = struggling ? 1 : isBorderline(s.id) ? randInt(2, Math.max(2, Math.floor(totalLessons * 0.45))) : randInt(3, totalLessons);
      const percent = Math.round((completed / totalLessons) * 100);
      const enrollment = await prisma.enrollment.create({
        data: {
          userId: s.id,
          courseId: course.id,
          batchId: batch.id,
          status: 'ACTIVE',
          progress: {
            create: {
              completedLessons: completed,
              totalLessons,
              percent,
              lastActivityAt: daysFromNow(struggling ? -25 : -randInt(0, 5)),
            },
          },
        },
      });
      // Lesson progress rows for the completed lessons.
      for (let li = 0; li < completed; li++) {
        await prisma.lessonProgress.create({
          data: { enrollmentId: enrollment.id, lessonId: course.lessonIds[li]!, userId: s.id, status: 'COMPLETED', completedAt: daysFromNow(-randInt(0, 20)) },
        });
      }
      studentsEnrolled++;
    }

    // --- Attendance: 5 past sessions with records -----------------------
    for (let w = 5; w >= 1; w--) {
      const session = await prisma.attendanceSession.create({
        data: { batchId: batch.id, title: `Week ${6 - w} Session`, sessionDate: daysFromNow(-w * 6), status: 'CLOSED', createdById: bp.trainer.id },
      });
      sessionsCreated++;
      for (const s of cohort) {
        const r = rnd();
        // Struggling students miss nearly every session (drives the risk rules).
        const status = isStruggling(s.id)
          ? 'ABSENT'
          : isBorderline(s.id)
            ? r < 0.55
              ? 'PRESENT'
              : r < 0.68
                ? 'LATE'
                : 'ABSENT'
          : r < 0.78
            ? 'PRESENT'
            : r < 0.9
              ? 'LATE'
              : r < 0.97
                ? 'ABSENT'
                : 'EXCUSED';
        await prisma.attendanceRecord.create({
          data: { sessionId: session.id, studentId: s.id, status, source: 'MANUAL', markedById: bp.trainer.id },
        });
      }
    }

    // --- Assignment (published) + submissions + evaluations -------------
    const assignment = await prisma.assignment.create({
      data: {
        batchId: batch.id,
        courseId: course.id,
        title: `${bp.name.split(' · ')[0]} — Project 1`,
        description: 'Apply what you have learned so far in a small project.',
        instructions: 'Submit your work with a short write-up and a repository link.',
        difficulty: 'MEDIUM',
        maxScore: 100,
        dueAt: daysFromNow(4),
        status: 'PUBLISHED',
        createdById: bp.trainer.id,
        criteria: {
          create: [
            { title: 'Correctness', description: 'Solution works and meets requirements', weight: 60, order: 0 },
            { title: 'Code quality & clarity', description: 'Readable, well-structured work', weight: 40, order: 1 },
          ],
        },
      },
      include: { criteria: true },
    });
    for (const s of cohort) {
      // Struggling students never submit → they show up as overdue.
      if (!isStruggling(s.id) && (rnd() < (isBorderline(s.id) ? 0.5 : 0.85) || s.email === DEMO_STUDENT_EMAIL)) {
        const submission = await prisma.assignmentSubmission.create({
          data: {
            assignmentId: assignment.id,
            studentId: s.id,
            attemptNumber: 1,
            contentText: 'My approach: I analysed the dataset, built the solution and documented the results.',
            repoUrl: 'https://github.com/example/project',
            status: 'EVALUATED',
            submittedAt: daysFromNow(-randInt(0, 3)),
          },
        });
        submissionsCreated++;
        if (rnd() < 0.7) {
          const finalScore = randInt(62, 96);
          const evaluation = await prisma.assignmentEvaluation.create({
            data: {
              submissionId: submission.id,
              aiScore: finalScore - randInt(-6, 6),
              trainerScore: finalScore,
              finalScore,
              confidence: 0.9,
              reason: 'Solid work overall; good use of the core concepts.',
              evaluatedByAi: true,
              status: 'RELEASED',
              reviewedById: bp.trainer.id,
              reviewedAt: daysFromNow(-1),
            },
          });
          for (const crit of assignment.criteria) {
            await prisma.evaluationCriterionScore.create({
              data: { evaluationId: evaluation.id, criterionId: crit.id, score: Math.round(crit.weight * (finalScore / 100)), comment: 'Good.' },
            });
          }
          await prisma.assignmentSubmission.update({ where: { id: submission.id }, data: { status: 'RETURNED' } });
        }
      }
    }

    // --- Assessment (published) + graded attempts w/ topic performance --
    const topics = course.topics;
    const questions: Prisma.QuestionCreateWithoutAssessmentInput[] = [];
    for (let qi = 0; qi < 6; qi++) {
      const topic = topics[qi % topics.length]!;
      questions.push({
        type: 'MCQ',
        prompt: `${topic}: which statement is correct? (Q${qi + 1})`,
        topic,
        skillTag: topic,
        difficulty: 'MEDIUM',
        points: 1,
        order: qi,
        options: {
          create: [
            { text: 'Correct answer', isCorrect: true, order: 0 },
            { text: 'Distractor A', isCorrect: false, order: 1 },
            { text: 'Distractor B', isCorrect: false, order: 2 },
            { text: 'Distractor C', isCorrect: false, order: 3 },
          ],
        },
      });
    }
    const assessment = await prisma.assessment.create({
      data: {
        batchId: batch.id,
        courseId: course.id,
        title: `${bp.name.split(' · ')[0]} — Quiz 1`,
        description: 'Check your understanding of the core topics.',
        timeLimitMin: 20,
        maxAttempts: 1,
        passingScore: 60,
        dueAt: daysFromNow(7),
        status: 'PUBLISHED',
        createdById: bp.trainer.id,
        questions: { create: questions },
      },
      include: { questions: true },
    });
    for (const s of cohort) {
      // Most students attempt; always give the reused seed account data.
      if (rnd() < 0.85 || s.email === DEMO_STUDENT_EMAIL) {
        // Simulate a graded attempt with per-topic performance.
        const perTopic = new Map<string, { correct: number; total: number }>();
        let score = 0;
        for (const q of assessment.questions) {
          const t = q.topic ?? 'General';
          const agg = perTopic.get(t) ?? { correct: 0, total: 0 };
          agg.total += 1;
          const correct = rnd() < (isStruggling(s.id) ? 0.25 : isBorderline(s.id) ? 0.45 : 0.72);
          if (correct) {
            agg.correct += 1;
            score += q.points;
          }
          perTopic.set(t, agg);
        }
        const maxScore = assessment.questions.length;
        const percent = Math.round((score / maxScore) * 100);
        await prisma.assessmentAttempt.create({
          data: {
            assessmentId: assessment.id,
            studentId: s.id,
            attemptNumber: 1,
            status: 'GRADED',
            score,
            maxScore,
            percent,
            submittedAt: daysFromNow(-randInt(0, 4)),
            gradedAt: daysFromNow(-randInt(0, 4)),
            topicPerformance: {
              create: [...perTopic.entries()].map(([topic, a]) => ({
                topic,
                correct: a.correct,
                total: a.total,
                percent: Math.round((a.correct / a.total) * 100),
              })),
            },
          },
        });
        attemptsCreated++;
      }
    }

    // --- A few notifications per student --------------------------------
    for (const s of cohort) {
      await prisma.notification.createMany({
        data: [
          { userId: s.id, type: 'ENROLLMENT', title: 'You’ve been enrolled', body: `Welcome to "${bp.name}".`, deepLink: '/dashboard', readAt: daysFromNow(-2) },
          { userId: s.id, type: 'ASSIGNMENT_PUBLISHED', title: 'New assignment', body: `"${assignment.title}" is due soon.`, deepLink: '/dashboard' },
          { userId: s.id, type: 'ASSESSMENT_PUBLISHED', title: 'New test available', body: `"${assessment.title}" is now open.`, deepLink: '/dashboard' },
        ],
      });
    }
  }

  // ==========================================================================
  // Phase 3 — career ecosystem: mentors, alumni, opportunities, applications
  // ==========================================================================

  // --- Mentors ------------------------------------------------------------
  const MENTOR_DEFS = [
    { email: 'mentor1', first: 'Manoj', last: 'Guide', headline: 'Data career mentor', expertise: ['SQL', 'Interviews', 'Portfolio review'], bio: 'Ten years hiring analysts. I help with interview technique and portfolio framing.' },
    { email: 'mentor2', first: 'Leena', last: 'Fernandes', headline: 'Analytics lead & coach', expertise: ['Pandas', 'Storytelling', 'Career planning'], bio: 'I coach on turning analysis into decisions stakeholders act on.' },
    { email: 'mentor3', first: 'Rahul', last: 'Bakshi', headline: 'ML engineer, ex-startup', expertise: ['Machine Learning', 'Model Evaluation', 'System design'], bio: 'Happy to review projects and talk through ML fundamentals.' },
    { email: 'mentor4', first: 'Sneha', last: 'Kulkarni', headline: 'Full-stack engineer', expertise: ['React', 'Node', 'APIs'], bio: 'Frontend and API design reviews, plus first-job advice.' },
  ];
  const mentors: { id: string; name: string }[] = [];
  // Reuse the base-seed mentor as the first one so its login still works.
  const seedMentor = await prisma.user.findUnique({ where: { email: 'mentor' + DEMO_DOMAIN } });
  if (seedMentor) {
    await ensureUser('mentor' + DEMO_DOMAIN, 'Manoj', 'Guide', 'MENTOR', 'demo');
    await prisma.mentorProfile.upsert({
      where: { userId: seedMentor.id },
      update: { headline: MENTOR_DEFS[0]!.headline, bio: MENTOR_DEFS[0]!.bio, expertise: MENTOR_DEFS[0]!.expertise, isAcceptingBookings: true },
      create: { userId: seedMentor.id, headline: MENTOR_DEFS[0]!.headline, bio: MENTOR_DEFS[0]!.bio, expertise: MENTOR_DEFS[0]!.expertise },
    });
    mentors.push({ id: seedMentor.id, name: 'Manoj Guide' });
  }
  for (const m of MENTOR_DEFS.slice(1)) {
    const u = await ensureUser(m.email + DEMO_DOMAIN, m.first, m.last, 'MENTOR', 'demo');
    await prisma.mentorProfile.upsert({
      where: { userId: u.id },
      update: {},
      create: { userId: u.id, headline: m.headline, bio: m.bio, expertise: m.expertise },
    });
    mentors.push({ id: u.id, name: `${m.first} ${m.last}` });
  }

  // Availability + a mix of upcoming and already-completed sessions, so the
  // mentor view has history and the contribution scores have something to count.
  let slotsCreated = 0;
  let bookingsCreated = 0;
  for (const [mi, mentor] of mentors.entries()) {
    for (let d = 1; d <= 6; d++) {
      const past = d <= 2;
      const day = past ? -(d * 5) : d * 2;
      const startsAt = new Date(daysFromNow(day).setHours(10 + (mi % 3), 0, 0, 0));
      const endsAt = new Date(new Date(startsAt).setHours(startsAt.getHours() + 1));
      const booked = past || d === 3;
      const slot = await prisma.mentorSlot.create({
        data: { mentorId: mentor.id, startsAt, endsAt, status: booked ? 'BOOKED' : 'OPEN' },
      });
      slotsCreated++;
      if (booked) {
        const student = pick(demoStudents);
        if (student.id === mentor.id) continue;
        await prisma.mentorBooking.create({
          data: {
            slotId: slot.id,
            mentorId: mentor.id,
            studentId: student.id,
            topic: pick(['Interview preparation', 'Portfolio review', 'Career path advice', 'Resume feedback', 'Choosing a specialisation']),
            note: 'Looking for concrete next steps.',
            status: past ? 'COMPLETED' : 'CONFIRMED',
            mentorNotes: past ? 'Good session — agreed on two practice projects before we meet again.' : null,
          },
        });
        bookingsCreated++;
      }
    }
  }

  // --- Alumni -------------------------------------------------------------
  const ALUMNI_DEFS = [
    { first: 'Alia', last: 'Past', company: 'Acme Analytics', role: 'Data Analyst', industry: 'Technology', location: 'Bengaluru', year: 2024, story: 'Practising SQL every single day is what got me through the interviews.' },
    { first: 'Nikhil', last: 'Menon', company: 'Northwind Retail', role: 'BI Developer', industry: 'Retail', location: 'Pune', year: 2024, story: 'The portfolio project mattered more than my CV. Build something real and explain the decisions.' },
    { first: 'Fatima', last: 'Qureshi', company: 'Lumen Health', role: 'Data Scientist', industry: 'Healthcare', location: 'Hyderabad', year: 2023, story: 'I failed my first two interviews on statistics. Go back to the fundamentals early, not the week before.' },
    { first: 'Rohit', last: 'Saxena', company: 'Acme Analytics', role: 'Analytics Engineer', industry: 'Technology', location: 'Bengaluru', year: 2023, story: 'Learn dbt and warehouse modelling — it is what most analyst roles actually need.' },
    { first: 'Divya', last: 'Raman', company: 'Finserv Cloud', role: 'Backend Engineer', industry: 'Finance', location: 'Chennai', year: 2024, story: 'Ask questions in the community. The answers I got here saved me weeks.' },
    { first: 'Imran', last: 'Sheikh', company: 'Northwind Retail', role: 'Data Analyst', industry: 'Retail', location: 'Mumbai', year: 2025, story: 'Do the mock interviews with a mentor. It is the single highest-leverage hour you can spend.' },
    { first: 'Kavya', last: 'Nambiar', company: 'BrightPath EdTech', role: 'Product Analyst', industry: 'Education', location: 'Kochi', year: 2023, story: 'Analytics is 70% asking the right question. Practise framing, not just querying.' },
    { first: 'Arun', last: 'Prakash', company: 'Finserv Cloud', role: 'ML Engineer', industry: 'Finance', location: 'Bengaluru', year: 2022, story: 'Ship a model end to end, even a bad one. Deployment teaches what notebooks cannot.' },
  ];
  const alumni: { id: string; name: string }[] = [];
  const seedAlumnus = await prisma.user.findUnique({ where: { email: 'alumni' + DEMO_DOMAIN } });
  for (const [i, a] of ALUMNI_DEFS.entries()) {
    const user =
      i === 0 && seedAlumnus
        ? await ensureUser('alumni' + DEMO_DOMAIN, a.first, a.last, 'ALUMNI', 'demo')
        : await ensureUser(`alumni${i}${DEMO_DOMAIN}`, a.first, a.last, 'ALUMNI', 'demo');
    await prisma.alumniProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        graduationYear: a.year,
        currentCompany: a.company,
        currentRole: a.role,
        industry: a.industry,
        location: a.location,
        story: a.story,
        linkedinUrl: `https://linkedin.com/in/${a.first.toLowerCase()}-${a.last.toLowerCase()}`,
        isPublished: true,
        openToMentoring: i % 2 === 0,
        openToReferrals: i % 3 !== 2,
      },
    });
    alumni.push({ id: user.id, name: `${a.first} ${a.last}` });
  }

  // --- Placement opportunities + applications -----------------------------
  const officer = await ensureUser('placement' + DEMO_DOMAIN, 'Priya', 'Placeworth', 'PLACEMENT_OFFICER', 'demo');
  const OPPORTUNITY_DEFS = [
    { title: 'Junior Data Analyst', company: 'Acme Analytics', location: 'Bengaluru', type: 'FULL_TIME', mode: 'HYBRID', reqs: ['SQL', 'Python', 'Pandas'], minReadiness: 30, openings: 4, salary: [600000, 900000] },
    { title: 'Business Intelligence Intern', company: 'Northwind Retail', location: 'Pune', type: 'INTERNSHIP', mode: 'ONSITE', reqs: ['SQL'], minReadiness: null, openings: 6, salary: [240000, 300000] },
    { title: 'Analytics Engineer', company: 'Finserv Cloud', location: 'Remote', type: 'FULL_TIME', mode: 'REMOTE', reqs: ['SQL', 'Python'], minReadiness: 55, openings: 2, salary: [900000, 1400000] },
    { title: 'Machine Learning Associate', company: 'Lumen Health', location: 'Hyderabad', type: 'FULL_TIME', mode: 'ONSITE', reqs: ['Machine Learning', 'Python', 'Model Evaluation'], minReadiness: 70, openings: 2, salary: [1000000, 1600000] },
    { title: 'Frontend Developer', company: 'BrightPath EdTech', location: 'Kochi', type: 'FULL_TIME', mode: 'HYBRID', reqs: ['React', 'JavaScript'], minReadiness: 40, openings: 3, salary: [700000, 1100000] },
    { title: 'Cloud Support Associate', company: 'Finserv Cloud', location: 'Chennai', type: 'CONTRACT', mode: 'ONSITE', reqs: ['Linux', 'Docker'], minReadiness: null, openings: 5, salary: [500000, 750000] },
  ];
  const opportunities: { id: string; title: string }[] = [];
  for (const [i, o] of OPPORTUNITY_DEFS.entries()) {
    const closed = i === OPPORTUNITY_DEFS.length - 1; // one closed role for realism
    const opp = await prisma.opportunity.create({
      data: {
        organizationId: demoOrg.id,
        postedById: officer.id,
        title: o.title,
        companyName: o.company,
        location: o.location,
        type: o.type as 'FULL_TIME' | 'INTERNSHIP' | 'CONTRACT' | 'PART_TIME',
        workMode: o.mode as 'ONSITE' | 'REMOTE' | 'HYBRID',
        description: `${o.company} is hiring a ${o.title}. You'll work alongside the team on real problems from week one, with mentoring and a structured ramp-up.`,
        requirements: o.reqs,
        minReadiness: o.minReadiness,
        openings: o.openings,
        salaryMin: o.salary[0],
        salaryMax: o.salary[1],
        currency: 'INR',
        deadline: daysFromNow(closed ? -3 : 21),
        status: closed ? 'CLOSED' : 'OPEN',
        publishedAt: daysFromNow(-randInt(3, 20)),
      },
    });
    opportunities.push({ id: opp.id, title: opp.title });
  }

  // A realistic funnel: many applied, fewer shortlisted, a couple hired.
  const APPLICATION_FUNNEL: Array<'APPLIED' | 'UNDER_REVIEW' | 'SHORTLISTED' | 'INTERVIEW' | 'OFFERED' | 'HIRED' | 'REJECTED'> = [
    'APPLIED', 'APPLIED', 'APPLIED', 'UNDER_REVIEW', 'UNDER_REVIEW', 'SHORTLISTED', 'SHORTLISTED', 'INTERVIEW', 'OFFERED', 'HIRED', 'REJECTED', 'REJECTED',
  ];
  let applicationsCreated = 0;
  const applicantPool = demoStudents.slice(0, 60);
  for (const opp of opportunities) {
    const applicants = shuffled(applicantPool).slice(0, randInt(6, 12));
    for (const [ai, student] of applicants.entries()) {
      const status = APPLICATION_FUNNEL[ai % APPLICATION_FUNNEL.length]!;
      const decided = status === 'HIRED' || status === 'REJECTED' || status === 'OFFERED';
      await prisma.application
        .create({
          data: {
            opportunityId: opp.id,
            studentId: student.id,
            status,
            coverNote: 'I have been building projects in this area throughout the programme and would love to contribute.',
            readinessSnapshot: randInt(25, 85),
            matchSnapshot: randInt(20, 100),
            reviewedById: decided ? officer.id : null,
            reviewedAt: decided ? daysFromNow(-randInt(1, 8)) : null,
            decisionNote: status === 'HIRED' ? 'Strong fit — offer accepted.' : status === 'REJECTED' ? 'Not a fit for this round; encouraged to reapply.' : null,
          },
        })
        .then(() => {
          applicationsCreated++;
        })
        .catch(() => undefined); // unique(opportunity, student) — skip dupes
    }
  }

  // ==========================================================================
  // Phase 4 — network effects: referrals and community Q&A
  // ==========================================================================

  let referralsCreated = 0;
  const openOpportunities = opportunities.slice(0, 4);
  for (const [i, alum] of alumni.entries()) {
    if (i % 3 === 2) continue; // not every alumnus refers
    const opp = openOpportunities[i % openOpportunities.length]!;
    const student = demoStudents[(i * 11) % demoStudents.length]!;
    await prisma.referral
      .create({
        data: {
          opportunityId: opp.id,
          studentId: student.id,
          referrerId: alum.id,
          note: 'Worked with them on a data project — rigorous, fast and genuinely coachable. Worth a conversation.',
          status: i % 2 === 0 ? 'ACKNOWLEDGED' : 'PENDING',
          reviewedById: i % 2 === 0 ? officer.id : null,
          reviewedAt: i % 2 === 0 ? daysFromNow(-randInt(1, 6)) : null,
        },
      })
      .then(() => {
        referralsCreated++;
      })
      .catch(() => undefined);
  }

  // --- Community Q&A ------------------------------------------------------
  const QA = [
    {
      title: 'When should I use a window function instead of GROUP BY?',
      body: 'I keep mixing these up. Both seem to aggregate, but the results are shaped differently and I never remember which one to reach for.',
      tags: ['sql', 'analytics'],
      answers: [
        'GROUP BY collapses rows into one per group. A window function keeps every row and adds the aggregate alongside it — so use a window when you still need the row detail, like a running total or a rank within each group.',
        'A rule of thumb that helped me: if the question is "per group, what is the total?" use GROUP BY. If it is "for each row, how does it compare to its group?" use a window.',
      ],
      accepted: 0,
    },
    {
      title: 'How much statistics do I actually need for an analyst interview?',
      body: 'I keep going deeper into theory and I am not sure how much of it will come up. What is the realistic bar for a junior analytics role?',
      tags: ['interviews', 'statistics'],
      answers: [
        'For junior roles: descriptive stats, distributions, correlation vs causation, sampling and basic hypothesis testing. Be able to explain a p-value in plain English — that is asked far more often than anything advanced.',
      ],
      accepted: 0,
    },
    {
      title: 'Is a Kaggle notebook enough for a portfolio?',
      body: 'I have a few notebooks with decent models. Do I need something more substantial, or is that enough to show?',
      tags: ['portfolio', 'career'],
      answers: [
        'Notebooks show you can model. They do not show you can frame a problem or ship anything. One end-to-end project with a real dataset, a written decision and a deployed artefact beats five notebooks.',
        'Add a short README explaining what decision the analysis supports. Interviewers read that first.',
      ],
      accepted: 0,
    },
    {
      title: 'Pandas merge is dropping rows I expected to keep',
      body: 'I am joining two frames on a key and losing about a third of my rows. I expected them all to survive the join.',
      tags: ['pandas', 'python'],
      answers: [
        'That is an inner join, which is the default. Pass how="left" to keep everything from the left frame. Then check for NaNs to find the keys that did not match — usually whitespace or dtype mismatch.',
      ],
      accepted: 0,
    },
    {
      title: 'How do I explain a gap in my learning timeline?',
      body: 'I paused the programme for two months for family reasons. Will that count against me?',
      tags: ['career', 'interviews'],
      answers: [],
      accepted: null,
    },
  ];
  let questionsCreated = 0;
  let answersCreated = 0;
  const answerers = [...mentors, ...alumni, { id: demoTrainers[0]!.id, name: 'Trainer' }];
  for (const [qi, q] of QA.entries()) {
    const asker = demoStudents[(qi * 13) % demoStudents.length]!;
    const question = await prisma.communityQuestion.create({
      data: {
        organizationId: demoOrg.id,
        authorId: asker.id,
        title: q.title,
        body: q.body,
        tags: q.tags,
        status: q.answers.length > 0 && q.accepted !== null ? 'ANSWERED' : 'OPEN',
        viewCount: randInt(8, 140),
        createdAt: daysFromNow(-randInt(2, 25)),
      },
    });
    questionsCreated++;
    for (const [ai, body] of q.answers.entries()) {
      const author = answerers[(qi * 3 + ai) % answerers.length]!;
      const answer = await prisma.communityAnswer.create({
        data: {
          questionId: question.id,
          authorId: author.id,
          body,
          isAccepted: q.accepted === ai,
          createdAt: daysFromNow(-randInt(1, 20)),
        },
      });
      answersCreated++;
      // A handful of upvotes from students who aren't the author.
      const voters = demoStudents.filter((s) => s.id !== author.id).slice(ai * 4, ai * 4 + randInt(2, 7));
      for (const v of voters) {
        await prisma.communityAnswerVote
          .create({ data: { answerId: answer.id, userId: v.id } })
          .catch(() => undefined);
      }
    }
  }

  console.log('✅ Demo seed complete:');
  console.log(`   • ${COURSES.length} courses, ${batchPlan.length} batches, ${demoStudents.length} students, ${demoTrainers.length} trainers`);
  console.log(`   • ${studentsEnrolled} enrollments · ${sessionsCreated} attendance sessions · ${submissionsCreated} submissions · ${attemptsCreated} quiz attempts`);
  console.log(`   • ${mentors.length} mentors (${slotsCreated} slots, ${bookingsCreated} bookings) · ${alumni.length} alumni`);
  console.log(`   • ${opportunities.length} opportunities · ${applicationsCreated} applications · ${referralsCreated} referrals`);
  console.log(`   • ${questionsCreated} community questions · ${answersCreated} answers`);

  // --- Community social hub ------------------------------------------------
  const batchForChannel = createdBatches[0];
  const channelDefs = [
    {
      name: batchForChannel ? `Batch ${batchForChannel.code}` : 'General',
      slug: batchForChannel ? `batch-${batchForChannel.code.toLowerCase()}` : 'general',
      emoji: '📢',
      kind: 'BATCH' as const,
      batchId: batchForChannel?.id ?? null,
    },
    { name: 'Python help', slug: 'python-help', emoji: '🐍', kind: 'TOPIC' as const, batchId: null },
    { name: 'SQL practice', slug: 'sql-practice', emoji: '🗄', kind: 'TOPIC' as const, batchId: null },
    { name: 'Placement prep', slug: 'placement-prep', emoji: '💼', kind: 'TOPIC' as const, batchId: null },
    { name: 'Capstone teams', slug: 'capstone-teams', emoji: '🚀', kind: 'TOPIC' as const, batchId: null },
  ];
  const channels = [];
  for (const def of channelDefs) {
    const ch = await prisma.communityChannel.create({
      data: {
        organizationId: demoOrg.id,
        name: def.name,
        slug: def.slug,
        emoji: def.emoji,
        kind: def.kind,
        batchId: def.batchId,
        members: {
          create: demoStudents.slice(0, 12).map((s) => ({ userId: s.id })),
        },
      },
    });
    channels.push(ch);
  }

  const showcaseAuthor = demoStudents[0]!;
  const amaAuthor = alumni[0] ?? demoStudents[1]!;
  const qAuthor = demoStudents[2]!;
  const openQ = await prisma.communityQuestion.findFirst({
    where: { organizationId: demoOrg.id, status: 'OPEN' },
  });

  const hubPosts = [
    await prisma.communityPost.create({
      data: {
        organizationId: demoOrg.id,
        channelId: channels[4]!.id,
        authorId: showcaseAuthor.id,
        kind: 'SHOWCASE',
        body: 'Shipped my capstone! Built a churn dashboard on 50k telecom rows — SQL + Python + Tableau. Biggest lesson: window functions saved me 200 lines of pandas.',
        showcaseTitle: 'Telecom Churn Explorer',
        showcaseSub: 'SQL · Python · Tableau · 3 weeks',
        showcaseEmoji: '📊',
        createdAt: daysFromNow(-2),
      },
    }),
    await prisma.communityPost.create({
      data: {
        organizationId: demoOrg.id,
        channelId: channels[3]!.id,
        authorId: amaAuthor.id,
        kind: 'AMA',
        title: 'AMA: analyst interviews',
        body: 'Doing an AMA this Friday on analyst interviews at product companies. Drop questions below — I will pick the top 10.',
        createdAt: daysFromNow(-1),
      },
    }),
    await prisma.communityPost.create({
      data: {
        organizationId: demoOrg.id,
        channelId: channels[2]!.id,
        authorId: qAuthor.id,
        kind: 'QUESTION',
        title: openQ?.title ?? 'Stuck on LEFT JOIN duplicates',
        body: openQ?.body ?? 'My LEFT JOIN returns duplicates even after DISTINCT. Anyone else hit this?',
        questionId: openQ?.id,
        createdAt: daysFromNow(-1),
      },
    }),
  ];

  for (const p of hubPosts) {
    const reactors = demoStudents.filter((s) => s.id !== p.authorId).slice(0, randInt(3, 8));
    for (const r of reactors) {
      await prisma.communityPostReaction.create({ data: { postId: p.id, userId: r.id } }).catch(() => undefined);
    }
    await prisma.communityPostComment.create({
      data: {
        postId: p.id,
        authorId: demoStudents[5]?.id ?? showcaseAuthor.id,
        body: 'This is gold — thanks for sharing!',
      },
    });
  }

  const room1 = await prisma.communityStudyRoom.create({
    data: {
      organizationId: demoOrg.id,
      channelId: channels[2]!.id,
      createdById: demoStudents[3]!.id,
      title: 'SQL grind — quiz Thursday',
      meetingUrl: 'https://meet.google.com/demo-sql-grind',
      presence: {
        create: demoStudents.slice(3, 8).map((s) => ({ userId: s.id, lastSeenAt: new Date() })),
      },
    },
  });
  const room2 = await prisma.communityStudyRoom.create({
    data: {
      organizationId: demoOrg.id,
      createdById: demoStudents[6]!.id,
      title: 'Silent focus room',
      presence: {
        create: demoStudents.slice(6, 12).map((s) => ({ userId: s.id, lastSeenAt: new Date() })),
      },
    },
  });

  const groupA = await prisma.communityGroup.create({
    data: {
      organizationId: demoOrg.id,
      createdById: demoStudents[0]!.id,
      name: 'Capstone squad Alpha',
      description: 'Weekly check-ins for the churn dashboard project.',
      members: {
        create: [
          { userId: demoStudents[0]!.id, role: 'OWNER' },
          { userId: demoStudents[1]!.id, role: 'MEMBER' },
          { userId: demoStudents[2]!.id, role: 'MEMBER' },
        ],
      },
    },
  });
  const groupB = await prisma.communityGroup.create({
    data: {
      organizationId: demoOrg.id,
      createdById: demoStudents[4]!.id,
      name: 'Interview practice circle',
      description: 'Mock behavioural rounds every Sunday.',
      members: {
        create: [
          { userId: demoStudents[4]!.id, role: 'OWNER' },
          { userId: demoStudents[5]!.id, role: 'MEMBER' },
        ],
      },
    },
  });

  const dm = await prisma.conversation.create({
    data: {
      organizationId: demoOrg.id,
      kind: 'DM',
      createdById: demoStudents[0]!.id,
      members: {
        create: [{ userId: demoStudents[0]!.id }, { userId: demoStudents[1]!.id }],
      },
      messages: {
        create: [
          {
            authorId: demoStudents[0]!.id,
            body: 'Hey — want to pair on the SQL challenge tonight?',
            createdAt: daysFromNow(-1),
          },
          {
            authorId: demoStudents[1]!.id,
            body: 'Yes! I am stuck on window functions — 8pm?',
            createdAt: daysFromNow(-1),
          },
        ],
      },
    },
  });

  await prisma.communityEvent.create({
    data: {
      organizationId: demoOrg.id,
      createdById: demoTrainers[0]!.id,
      title: 'Friday AMA with alumni analysts',
      description: 'Bring your interview questions — alumni pick the top 10.',
      startsAt: daysFromNow(3),
      endsAt: daysFromNow(3),
      location: 'Main hall + Meet',
      meetingUrl: 'https://meet.google.com/demo-ama',
      rsvps: {
        create: demoStudents.slice(0, 6).map((s) => ({ userId: s.id, status: 'GOING' as const })),
      },
    },
  });
  await prisma.communityEvent.create({
    data: {
      organizationId: demoOrg.id,
      createdById: demoStudents[0]!.id,
      title: 'Capstone showcase night',
      description: 'Demo your project to mentors and peers.',
      startsAt: daysFromNow(10),
      location: 'Lab 2',
      rsvps: {
        create: [
          { userId: demoStudents[0]!.id, status: 'GOING' },
          { userId: demoStudents[1]!.id, status: 'MAYBE' },
        ],
      },
    },
  });

  console.log(
    `   • ${channels.length} channels · ${hubPosts.length} feed posts · 2 study rooms · 2 groups · 1 DM · 2 events`,
  );
  void room1;
  void room2;
  void groupA;
  void groupB;
  void dm;

  console.log('');
  console.log('   ⚠ Skills, scores and risk are NOT computed here (@fca/analytics');
  console.log('     cannot be a dependency of @fca/database). Run:');
  console.log('       pnpm db:demo:intelligence');
  console.log('     …or just use `pnpm db:seed:demo`, which chains both.');
  console.log('');
  console.log('   Seeded personas:');
  console.log('     Placement officer:  placement@demo.futurecorp.in');
  console.log('     Trainers:           trainer, trainer1…trainer4 @demo.futurecorp.in');
  console.log('     Mentors:            mentor, mentor2…mentor4 @demo.futurecorp.in');
  console.log('     Alumni:             alumni, alumni1…alumni7 @demo.futurecorp.in');
  console.log(`     Public demo lands as: ${DEMO_STUDENT_EMAIL}`);
  console.log(
    process.env.DEMO_SEED_PASSWORD
      ? '     Password:           from DEMO_SEED_PASSWORD'
      : '     Password:           random — sign in via POST /auth/demo, not /login',
  );
}

main()
  .catch((e) => {
    console.error('❌ Demo seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
