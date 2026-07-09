/**
 * DEMO seed — realistic, interconnected sample data so every dashboard and
 * screen has something to show. Idempotent: it clears prior demo artifacts
 * (users @demo.futurecorp.in, courses `demo-*`, batches `DEMO*`, org
 * `futurecorp-north`) and recreates them.
 *
 * ⚠️ DEVELOPMENT DATA ONLY. All accounts share the password `Password123!`.
 *
 * Run:  DATABASE_URL=... pnpm --filter @fca/database exec tsx prisma/demo-seed.ts
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();
const PASSWORD = 'Password123!';
const DEMO_DOMAIN = '@demo.futurecorp.in';

// --- tiny deterministic-ish helpers ---------------------------------------
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const daysFromNow = (d: number) => new Date(Date.now() + d * 86400000);

const FIRST = ['Aarav', 'Diya', 'Vivaan', 'Ananya', 'Aditya', 'Ishaan', 'Saanvi', 'Kabir', 'Myra', 'Reyansh', 'Anika', 'Arjun', 'Kiara', 'Vihaan', 'Aadhya', 'Rohan', 'Navya', 'Dhruv', 'Riya', 'Krishna', 'Sara', 'Yash', 'Tara', 'Neel', 'Zoya'];
const LAST = ['Sharma', 'Verma', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Gupta', 'Mehta', 'Rao', 'Das', 'Bose', 'Khan', 'Menon', 'Kapoor', 'Chopra'];

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
    slug: 'demo-fullstack-web', title: 'Full-Stack Web Development', level: 'INTERMEDIATE', org: 'north',
    program: 'Software Engineering', topics: ['JavaScript', 'React', 'Node', 'APIs'],
    summary: 'Build modern web apps with React, Node and REST APIs.',
    modules: [
      { title: 'Frontend', lessons: ['HTML & CSS', 'JavaScript', 'React Components', 'State & Hooks'] },
      { title: 'Backend', lessons: ['Node & Express', 'REST APIs', 'Auth'] },
      { title: 'Databases', lessons: ['Postgres Basics', 'Prisma ORM', 'Deployment'] },
    ],
  },
  {
    slug: 'demo-cloud-devops', title: 'Cloud & DevOps Essentials', level: 'INTERMEDIATE', org: 'north',
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
  const seedTrainer = await prisma.user.findUnique({ where: { email: 'trainer@futurecorpacademy.in' } });
  if (seedTrainer) {
    await ensureUser('trainer@futurecorpacademy.in', 'Tara', 'Rao', 'TRAINER', 'demo');
  }
  const trainerDemo1 = await ensureUser('trainer1' + DEMO_DOMAIN, 'Meera', 'Krishnan', 'TRAINER', 'demo');
  const trainerNorth1 = await ensureUser('trainer2' + DEMO_DOMAIN, 'Sanjay', 'Pillai', 'TRAINER', 'north');
  const trainerNorth2 = await ensureUser('trainer3' + DEMO_DOMAIN, 'Farah', 'Sheikh', 'TRAINER', 'north');
  const demoTrainers = [seedTrainer!, trainerDemo1].filter(Boolean);
  const northTrainers = [trainerNorth1, trainerNorth2];

  // --- Students (reuse base-seed student too) -----------------------------
  const seedStudent = await ensureUser('student@futurecorpacademy.in', 'Sam', 'Learner', 'STUDENT', 'demo');
  const demoStudents = [seedStudent];
  const northStudents = [] as typeof demoStudents;
  for (let i = 1; i <= 24; i++) {
    const org: 'demo' | 'north' = i <= 14 ? 'demo' : 'north';
    const u = await ensureUser(
      `student${i}${DEMO_DOMAIN}`,
      FIRST[(i - 1) % FIRST.length]!,
      LAST[(i - 1) % LAST.length]!,
      'STUDENT',
      org,
    );
    (org === 'demo' ? demoStudents : northStudents).push(u);
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
    const creator = c.org === 'demo' ? demoTrainers[0]!.id : northTrainers[0].id;
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
  }

  // --- Batches: one per course; assign trainer + students -----------------
  const batchPlan = [
    { course: 'demo-python-data', code: 'DEMO-PY-01', name: 'Python Data · Batch A', trainer: demoTrainers[0]! },
    { course: 'demo-sql-databases', code: 'DEMO-SQL-01', name: 'SQL & Databases · Batch A', trainer: demoTrainers[1] ?? demoTrainers[0]! },
    { course: 'demo-ml-foundations', code: 'DEMO-ML-01', name: 'ML Foundations · Batch A', trainer: demoTrainers[0]! },
    { course: 'demo-fullstack-web', code: 'DEMO-FS-01', name: 'Full-Stack Web · Batch A', trainer: northTrainers[0] },
    { course: 'demo-cloud-devops', code: 'DEMO-CLOUD-01', name: 'Cloud & DevOps · Batch A', trainer: northTrainers[1] },
  ];

  // distribute students across batches within their org
  const demoQueue = [...demoStudents];
  const northQueue = [...northStudents];
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
        trainers: { create: { userId: bp.trainer.id, role: 'LEAD' } },
        schedules: {
          create: [
            { title: 'Live Session — Q&A', startsAt: daysFromNow(2), endsAt: daysFromNow(2.08), location: 'Online' },
            { title: 'Live Session — Project Review', startsAt: daysFromNow(5), endsAt: daysFromNow(5.08), location: 'Online' },
            { title: 'Guest Lecture', startsAt: daysFromNow(9), endsAt: daysFromNow(9.08), location: 'Auditorium' },
          ],
        },
      },
    });

    // Enroll ~5 students from the org queue.
    const queue = org === 'demo' ? demoQueue : northQueue;
    const cohort = queue.splice(0, 5);
    const totalLessons = course.lessonIds.length;
    for (const s of cohort) {
      await prisma.batchStudent.create({ data: { batchId: batch.id, userId: s.id, status: 'ACTIVE' } });
      const completed = randInt(1, totalLessons);
      const percent = Math.round((completed / totalLessons) * 100);
      const enrollment = await prisma.enrollment.create({
        data: {
          userId: s.id,
          courseId: course.id,
          batchId: batch.id,
          status: 'ACTIVE',
          progress: { create: { completedLessons: completed, totalLessons, percent, lastActivityAt: daysFromNow(-randInt(0, 5)) } },
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
        const r = Math.random();
        const status = r < 0.78 ? 'PRESENT' : r < 0.9 ? 'LATE' : r < 0.97 ? 'ABSENT' : 'EXCUSED';
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
      if (Math.random() < 0.65) {
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
        if (Math.random() < 0.7) {
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
      if (Math.random() < 0.6) {
        // Simulate a graded attempt with per-topic performance.
        const perTopic = new Map<string, { correct: number; total: number }>();
        let score = 0;
        for (const q of assessment.questions) {
          const t = q.topic ?? 'General';
          const agg = perTopic.get(t) ?? { correct: 0, total: 0 };
          agg.total += 1;
          const correct = Math.random() < 0.65;
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

  console.log('✅ Demo seed complete:');
  console.log(`   • 2 colleges, ${COURSES.length} courses, ${batchPlan.length} batches`);
  console.log(`   • ${demoTrainers.length + northTrainers.length} trainers, ${studentsEnrolled} enrollments`);
  console.log(`   • ${sessionsCreated} attendance sessions, ${submissionsCreated} submissions, ${attemptsCreated} quiz attempts`);
  console.log('');
  console.log('   Sample logins (password: Password123!):');
  console.log('     Trainer (2 batches): trainer@futurecorpacademy.in');
  console.log('     Trainer:             trainer1@demo.futurecorp.in');
  console.log('     Student (enrolled):  student@futurecorpacademy.in');
  console.log('     Students:            student1@demo.futurecorp.in … student24@demo.futurecorp.in');
  console.log('     Super Admin:         superadmin@futurecorpacademy.in');
}

main()
  .catch((e) => {
    console.error('❌ Demo seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
