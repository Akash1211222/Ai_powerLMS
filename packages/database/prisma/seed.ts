/**
 * Development seed (§42). Idempotent — safe to run repeatedly.
 *
 * ⚠️ DEVELOPMENT DATA ONLY. All accounts share a well-known password and must
 * never exist in production.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  ROLES,
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  type RoleName,
} from '@fca/shared';

const prisma = new PrismaClient();

const DEV_PASSWORD = 'Password123!';

const SEED_USERS: Array<{ email: string; firstName: string; lastName: string; role: RoleName }> = [
  { email: 'superadmin@futurecorpacademy.in', firstName: 'Sasha', lastName: 'Admin', role: 'SUPER_ADMIN' },
  { email: 'collegeadmin@futurecorpacademy.in', firstName: 'Colin', lastName: 'Dean', role: 'COLLEGE_ADMIN' },
  { email: 'batchmanager@futurecorpacademy.in', firstName: 'Bianca', lastName: 'Ops', role: 'BATCH_MANAGER' },
  { email: 'trainer@futurecorpacademy.in', firstName: 'Tara', lastName: 'Rao', role: 'TRAINER' },
  { email: 'mentor@futurecorpacademy.in', firstName: 'Manoj', lastName: 'Guide', role: 'MENTOR' },
  { email: 'placement@futurecorpacademy.in', firstName: 'Priya', lastName: 'Placeworth', role: 'PLACEMENT_OFFICER' },
  { email: 'recruiter@futurecorpacademy.in', firstName: 'Ravi', lastName: 'Hunter', role: 'RECRUITER' },
  { email: 'alumni@futurecorpacademy.in', firstName: 'Alia', lastName: 'Past', role: 'ALUMNI' },
  { email: 'student@futurecorpacademy.in', firstName: 'Sam', lastName: 'Learner', role: 'STUDENT' },
];

async function main() {
  console.log('🌱 Seeding FutureCorp Academy (development data)...');

  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key },
    });
  }
  const permissionRows = await prisma.permission.findMany();
  const permIdByKey = new Map(permissionRows.map((p) => [p.key, p.id]));

  for (const name of ROLES) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, isSystem: true },
    });
    const desired = DEFAULT_ROLE_PERMISSIONS[name];
    for (const permKey of desired) {
      const permissionId = permIdByKey.get(permKey);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }
  const roleByName = new Map((await prisma.role.findMany()).map((r) => [r.name, r]));

  const org = await prisma.organization.upsert({
    where: { slug: 'futurecorp-demo' },
    update: {},
    create: {
      name: 'FutureCorp Demo College',
      slug: 'futurecorp-demo',
      type: 'COLLEGE',
      status: 'ACTIVE',
    },
  });

  const passwordHash = await argon2.hash(DEV_PASSWORD, { type: argon2.argon2id });
  const usersByEmail = new Map<string, string>();

  for (const u of SEED_USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(0),
        profile: {
          create: { firstName: u.firstName, lastName: u.lastName },
        },
      },
    });
    usersByEmail.set(u.email, user.id);

    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
      update: {},
      create: { organizationId: org.id, userId: user.id, isPrimary: true },
    });

    const role = roleByName.get(u.role);
    if (role) {
      const organizationId = u.role === 'SUPER_ADMIN' ? null : org.id;
      const existing = await prisma.userRole.findFirst({
        where: { userId: user.id, roleId: role.id, organizationId },
      });
      if (!existing) {
        await prisma.userRole.create({
          data: { userId: user.id, roleId: role.id, organizationId },
        });
      }
    }
  }

  const trainerId = usersByEmail.get('trainer@futurecorpacademy.in')!;
  const studentId = usersByEmail.get('student@futurecorpacademy.in')!;
  const placementId = usersByEmail.get('placement@futurecorpacademy.in')!;
  const collegeAdminId = usersByEmail.get('collegeadmin@futurecorpacademy.in')!;

  // Feature flags — placement enabled for demo
  const flags = [
    { key: 'module.live_class', enabled: true },
    { key: 'module.placement', enabled: true },
    { key: 'module.intelligence', enabled: true },
    { key: 'module.mentorship', enabled: true },
    { key: 'module.community', enabled: false },
    { key: 'module.mock_interview', enabled: false },
  ];
  for (const f of flags) {
    await prisma.featureFlag.upsert({
      where: { key: f.key },
      update: { enabled: f.enabled },
      create: {
        key: f.key,
        enabled: f.enabled,
        description: `Enables the ${f.key} module`,
      },
    });
  }

  // Demo course + modules + lessons
  const course = await prisma.course.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: 'full-stack-foundations' } },
    update: { status: 'PUBLISHED', publishedAt: new Date() },
    create: {
      organizationId: org.id,
      title: 'Full Stack Foundations',
      slug: 'full-stack-foundations',
      summary: 'JavaScript, React, Node, and SQL for placement-ready engineers.',
      description: 'A hands-on cohort course covering the modern web stack.',
      level: 'BEGINNER',
      status: 'PUBLISHED',
      publishedAt: new Date(),
      createdById: collegeAdminId,
    },
  });

  let module = await prisma.courseModule.findFirst({
    where: { courseId: course.id, title: 'Week 1 — JavaScript Essentials' },
  });
  if (!module) {
    module = await prisma.courseModule.create({
      data: { courseId: course.id, title: 'Week 1 — JavaScript Essentials', order: 0 },
    });
  }
  const lessonCount = await prisma.lesson.count({ where: { moduleId: module.id } });
  if (lessonCount === 0) {
    await prisma.lesson.createMany({
      data: [
        {
          moduleId: module.id,
          title: 'Variables & types',
          order: 0,
          type: 'VIDEO',
          durationSec: 900,
          contentUrl: 'https://www.youtube.com/watch?v=W6NZfCO5SIk',
        },
        {
          moduleId: module.id,
          title: 'Functions & arrays',
          order: 1,
          type: 'READING',
          durationSec: 600,
        },
        {
          moduleId: module.id,
          title: 'Async JavaScript',
          order: 2,
          type: 'VIDEO',
          durationSec: 1200,
          contentUrl: 'https://www.youtube.com/watch?v=PoRJizFvM7s',
        },
      ],
    });
  } else {
    // Ensure demo VIDEO lessons have playable URLs for existing DBs.
    const videoLessons = await prisma.lesson.findMany({
      where: { moduleId: module.id, type: 'VIDEO' },
      orderBy: { order: 'asc' },
    });
    const demoUrls = [
      'https://www.youtube.com/watch?v=W6NZfCO5SIk',
      'https://www.youtube.com/watch?v=PoRJizFvM7s',
    ];
    for (let i = 0; i < videoLessons.length; i++) {
      const lesson = videoLessons[i]!;
      if (!lesson.contentUrl) {
        await prisma.lesson.update({
          where: { id: lesson.id },
          data: { contentUrl: demoUrls[i % demoUrls.length] },
        });
      }
    }
  }

  const totalLessons = await prisma.lesson.count({
    where: { module: { courseId: course.id } },
  });

  // Active batch with trainer + student
  const batch = await prisma.batch.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'FSF-2026-A' } },
    update: { status: 'ACTIVE' },
    create: {
      organizationId: org.id,
      courseId: course.id,
      name: 'Full Stack Cohort A',
      code: 'FSF-2026-A',
      status: 'ACTIVE',
      capacity: 40,
      startDate: new Date(),
      createdById: collegeAdminId,
    },
  });

  await prisma.batchTrainer.upsert({
    where: { batchId_userId: { batchId: batch.id, userId: trainerId } },
    update: { role: 'LEAD' },
    create: { batchId: batch.id, userId: trainerId, role: 'LEAD' },
  });

  await prisma.batchStudent.upsert({
    where: { batchId_userId: { batchId: batch.id, userId: studentId } },
    update: { status: 'ACTIVE' },
    create: { batchId: batch.id, userId: studentId, status: 'ACTIVE' },
  });

  const enrollment = await prisma.enrollment.upsert({
    where: { userId_courseId: { userId: studentId, courseId: course.id } },
    update: { batchId: batch.id, status: 'ACTIVE' },
    create: {
      userId: studentId,
      courseId: course.id,
      batchId: batch.id,
      status: 'ACTIVE',
    },
  });

  await prisma.courseProgress.upsert({
    where: { enrollmentId: enrollment.id },
    update: { totalLessons },
    create: {
      enrollmentId: enrollment.id,
      totalLessons,
      completedLessons: 1,
      percent: totalLessons ? Math.round((1 / totalLessons) * 100) : 0,
    },
  });

  // Published assignment with rubric
  let assignment = await prisma.assignment.findFirst({
    where: { batchId: batch.id, title: 'Build a Todo API' },
  });
  if (!assignment) {
        assignment = await prisma.assignment.create({
      data: {
        batchId: batch.id,
        courseId: course.id,
        title: 'Build a Todo API',
        description: 'Implement a simple REST todo API with CRUD.',
        instructions:
          'Use JavaScript. Implement add/remove/list for todos and demonstrate with console.log.\nRun in the JS compiler, then submit for instant AI scoring.',
        difficulty: 'MEDIUM',
        maxScore: 100,
        aiEvaluationEnabled: true,
        language: 'JAVASCRIPT',
        starterCode: `// Todo manager — implement add, remove, list
const todos = [];

function add(title) {
  // TODO
}

function remove(index) {
  // TODO
}

function list() {
  // TODO
}

add("Learn JS");
add("Ship assignment");
list();
remove(0);
list();
`,
        aiGenerated: true,
        status: 'PUBLISHED',
        createdById: trainerId,
        criteria: {
          create: [
            { title: 'Correctness', description: 'Endpoints work as specified', weight: 40, order: 0 },
            { title: 'Code quality', description: 'Readable, structured code', weight: 30, order: 1 },
            { title: 'Documentation', description: 'Clear README and API notes', weight: 30, order: 2 },
          ],
        },
      },
    });
  } else {
    await prisma.assignment.update({
      where: { id: assignment.id },
      data: {
        status: 'PUBLISHED',
        language: 'JAVASCRIPT',
        aiGenerated: true,
        starterCode:
          assignment.starterCode ??
          `const todos = [];\nfunction add(title) { todos.push(title); }\nfunction list() { console.log(todos); }\nadd("Learn JS");\nlist();\n`,
        instructions:
          assignment.instructions ??
          'Use JavaScript. Implement add/remove/list for todos. Run in the compiler, then submit.',
      },
    });
  }

  // Published assessment
  let assessment = await prisma.assessment.findFirst({
    where: { batchId: batch.id, title: 'Week 1 Knowledge Check' },
  });
  if (!assessment) {
    assessment = await prisma.assessment.create({
      data: {
        batchId: batch.id,
        courseId: course.id,
        title: 'Week 1 Knowledge Check',
        description: 'Quick MCQ on JS fundamentals and LMS concepts.',
        timeLimitMin: 20,
        maxAttempts: 2,
        passingScore: 60,
        status: 'PUBLISHED',
        createdById: trainerId,
        questions: {
          create: [
            {
              type: 'MCQ',
              prompt: 'Which keyword declares a block-scoped variable?',
              topic: 'JavaScript',
              points: 1,
              order: 0,
              options: {
                create: [
                  { text: 'var', isCorrect: false, order: 0 },
                  { text: 'let', isCorrect: true, order: 1 },
                  { text: 'function', isCorrect: false, order: 2 },
                  { text: 'goto', isCorrect: false, order: 3 },
                ],
              },
            },
            {
              type: 'TRUE_FALSE',
              prompt: 'Array.map mutates the original array.',
              topic: 'JavaScript',
              points: 1,
              order: 1,
              options: {
                create: [
                  { text: 'True', isCorrect: false, order: 0 },
                  { text: 'False', isCorrect: true, order: 1 },
                ],
              },
            },
            {
              type: 'MCQ',
              prompt: 'What does LMS stand for?',
              topic: 'Fundamentals',
              points: 1,
              order: 2,
              options: {
                create: [
                  { text: 'Learning Management System', isCorrect: true, order: 0 },
                  { text: 'Large Media Server', isCorrect: false, order: 1 },
                  { text: 'Local Memory Store', isCorrect: false, order: 2 },
                ],
              },
            },
          ],
        },
      },
    });
  }

  // Career profile + open opportunities
  await prisma.careerProfile.upsert({
    where: { userId: studentId },
    update: {
      headline: 'Aspiring full-stack engineer',
      summary: 'JavaScript, React, TypeScript, SQL, Node — open to frontend and full-stack roles.',
      location: 'Bangalore',
      openToWork: true,
    },
    create: {
      userId: studentId,
      headline: 'Aspiring full-stack engineer',
      summary: 'JavaScript, React, TypeScript, SQL, Node — open to frontend and full-stack roles.',
      location: 'Bangalore',
      openToWork: true,
    },
  });

  const existingJobs = await prisma.opportunity.count({ where: { organizationId: org.id } });
  if (existingJobs === 0) {
    await prisma.opportunity.createMany({
      data: [
        {
          organizationId: org.id,
          postedById: placementId,
          companyName: 'NovaTech Labs',
          title: 'Frontend Developer Intern',
          description: 'Build React dashboards for internal tools.',
          type: 'INTERNSHIP',
          workMode: 'ONSITE',
          location: 'Bangalore',
          salaryMin: 400000,
          salaryMax: 600000,
          requirements: ['React', 'TypeScript', 'JavaScript'],
          status: 'OPEN',
          publishedAt: new Date(),
          deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        {
          organizationId: org.id,
          postedById: placementId,
          companyName: 'Orbit Systems',
          title: 'Full Stack Developer',
          description: 'Own features across Next.js and NestJS APIs.',
          type: 'FULL_TIME',
          workMode: 'REMOTE',
          location: 'Remote',
          salaryMin: 800000,
          salaryMax: 1200000,
          requirements: ['React', 'Node', 'SQL', 'TypeScript'],
          status: 'OPEN',
          publishedAt: new Date(),
          deadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
        },
      ],
    });
  }

  // ---------------------------------------------------------------------
  // Student Intelligence demo data (Phase 3): extra students with varied
  // academic histories so the cohort view shows a real risk spread.
  // ---------------------------------------------------------------------
  const EXTRA_STUDENTS = [
    {
      email: 'priya.sharma@futurecorpacademy.in',
      firstName: 'Priya',
      lastName: 'Sharma',
      attendance: ['PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT'],
      completedLessons: 2,
      assignmentScore: 92,
      attempt: { score: 3, maxScore: 3, percent: 100, topics: [
        { topic: 'JavaScript', correct: 2, total: 2, percent: 100 },
        { topic: 'Fundamentals', correct: 1, total: 1, percent: 100 },
      ] },
    },
    {
      email: 'rohan.verma@futurecorpacademy.in',
      firstName: 'Rohan',
      lastName: 'Verma',
      attendance: ['PRESENT', 'PRESENT', 'LATE', 'ABSENT', 'PRESENT'],
      completedLessons: 1,
      assignmentScore: 68,
      attempt: { score: 2, maxScore: 3, percent: 67, topics: [
        { topic: 'JavaScript', correct: 1, total: 2, percent: 50 },
        { topic: 'Fundamentals', correct: 1, total: 1, percent: 100 },
      ] },
    },
    {
      email: 'kiran.das@futurecorpacademy.in',
      firstName: 'Kiran',
      lastName: 'Das',
      attendance: ['PRESENT', 'ABSENT', 'ABSENT', 'ABSENT', 'ABSENT'],
      completedLessons: 0,
      assignmentScore: null, // never submitted — shows as missing work
      attempt: { score: 1, maxScore: 3, percent: 33, topics: [
        { topic: 'JavaScript', correct: 1, total: 2, percent: 50 },
        { topic: 'Fundamentals', correct: 0, total: 1, percent: 0 },
      ] },
    },
  ] as const;

  // Five past class sessions for the batch
  const sessionCount = await prisma.attendanceSession.count({ where: { batchId: batch.id } });
  const sessions: { id: string }[] = [];
  if (sessionCount < 5) {
    for (let i = 0; i < 5; i++) {
      const sessionDate = new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000);
      const title = `Class ${i + 1} — JavaScript Essentials`;
      const existing = await prisma.attendanceSession.findFirst({
        where: { batchId: batch.id, title },
      });
      sessions.push(
        existing ??
          (await prisma.attendanceSession.create({
            data: { batchId: batch.id, title, sessionDate, status: 'CLOSED', createdById: trainerId },
          })),
      );
    }
  } else {
    sessions.push(
      ...(await prisma.attendanceSession.findMany({
        where: { batchId: batch.id },
        orderBy: { sessionDate: 'asc' },
        take: 5,
        select: { id: true },
      })),
    );
  }

  // The primary demo student attends well (4 present, 1 late)
  const samPattern = ['PRESENT', 'PRESENT', 'PRESENT', 'LATE', 'PRESENT'] as const;
  for (let i = 0; i < sessions.length; i++) {
    await prisma.attendanceRecord.upsert({
      where: { sessionId_studentId: { sessionId: sessions[i].id, studentId } },
      update: {},
      create: {
        sessionId: sessions[i].id,
        studentId,
        status: samPattern[i],
        source: 'MANUAL',
        markedById: trainerId,
      },
    });
  }

  const roleStudent = roleByName.get('STUDENT');
  for (const extra of EXTRA_STUDENTS) {
    const user = await prisma.user.upsert({
      where: { email: extra.email },
      update: {},
      create: {
        email: extra.email,
        passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(0),
        profile: { create: { firstName: extra.firstName, lastName: extra.lastName } },
      },
    });
    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
      update: {},
      create: { organizationId: org.id, userId: user.id, isPrimary: true },
    });
    if (roleStudent) {
      const existingRole = await prisma.userRole.findFirst({
        where: { userId: user.id, roleId: roleStudent.id, organizationId: org.id },
      });
      if (!existingRole) {
        await prisma.userRole.create({
          data: { userId: user.id, roleId: roleStudent.id, organizationId: org.id },
        });
      }
    }

    await prisma.batchStudent.upsert({
      where: { batchId_userId: { batchId: batch.id, userId: user.id } },
      update: { status: 'ACTIVE' },
      create: { batchId: batch.id, userId: user.id, status: 'ACTIVE' },
    });
    const extraEnrollment = await prisma.enrollment.upsert({
      where: { userId_courseId: { userId: user.id, courseId: course.id } },
      update: { batchId: batch.id, status: 'ACTIVE' },
      create: { userId: user.id, courseId: course.id, batchId: batch.id, status: 'ACTIVE' },
    });
    await prisma.courseProgress.upsert({
      where: { enrollmentId: extraEnrollment.id },
      update: {
        totalLessons,
        completedLessons: extra.completedLessons,
        percent: totalLessons ? Math.round((extra.completedLessons / totalLessons) * 100) : 0,
      },
      create: {
        enrollmentId: extraEnrollment.id,
        totalLessons,
        completedLessons: extra.completedLessons,
        percent: totalLessons ? Math.round((extra.completedLessons / totalLessons) * 100) : 0,
      },
    });

    for (let i = 0; i < sessions.length; i++) {
      await prisma.attendanceRecord.upsert({
        where: { sessionId_studentId: { sessionId: sessions[i].id, studentId: user.id } },
        update: {},
        create: {
          sessionId: sessions[i].id,
          studentId: user.id,
          status: extra.attendance[i],
          source: 'MANUAL',
          markedById: trainerId,
        },
      });
    }

    if (extra.assignmentScore != null) {
      const submission = await prisma.assignmentSubmission.upsert({
        where: {
          assignmentId_studentId_attemptNumber: {
            assignmentId: assignment.id,
            studentId: user.id,
            attemptNumber: 1,
          },
        },
        update: { status: 'EVALUATED' },
        create: {
          assignmentId: assignment.id,
          studentId: user.id,
          attemptNumber: 1,
          contentText: `Todo API submission by ${extra.firstName}.`,
          status: 'EVALUATED',
          submittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        },
      });
      await prisma.assignmentEvaluation.upsert({
        where: { submissionId: submission.id },
        update: { finalScore: extra.assignmentScore, status: 'RELEASED' },
        create: {
          submissionId: submission.id,
          aiScore: extra.assignmentScore,
          finalScore: extra.assignmentScore,
          confidence: 0.9,
          reason: 'Seeded demo evaluation',
          evaluatedByAi: true,
          status: 'RELEASED',
        },
      });
    }

    const attempt = await prisma.assessmentAttempt.upsert({
      where: {
        assessmentId_studentId_attemptNumber: {
          assessmentId: assessment.id,
          studentId: user.id,
          attemptNumber: 1,
        },
      },
      update: { status: 'GRADED', percent: extra.attempt.percent },
      create: {
        assessmentId: assessment.id,
        studentId: user.id,
        attemptNumber: 1,
        status: 'GRADED',
        score: extra.attempt.score,
        maxScore: extra.attempt.maxScore,
        percent: extra.attempt.percent,
        submittedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        gradedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });
    for (const t of extra.attempt.topics) {
      await prisma.topicPerformance.upsert({
        where: { attemptId_topic: { attemptId: attempt.id, topic: t.topic } },
        update: { correct: t.correct, total: t.total, percent: t.percent },
        create: {
          attemptId: attempt.id,
          topic: t.topic,
          correct: t.correct,
          total: t.total,
          percent: t.percent,
        },
      });
    }
  }

  // ---------------------------------------------------------------------
  // Mentorship demo data: mentor profile, open slot, and sample bookings.
  // ---------------------------------------------------------------------
  const mentorId = usersByEmail.get('mentor@futurecorpacademy.in')!;
  await prisma.mentorProfile.upsert({
    where: { userId: mentorId },
    update: {
      headline: 'Engineering mentor — career paths & interview prep',
      expertise: ['Career guidance', 'Interviews', 'React', 'System design'],
      isAcceptingBookings: true,
    },
    create: {
      userId: mentorId,
      headline: 'Engineering mentor — career paths & interview prep',
      bio: 'A decade of full-stack experience; happy to help with roadmaps, projects, and interviews.',
      expertise: ['Career guidance', 'Interviews', 'React', 'System design'],
      isAcceptingBookings: true,
    },
  });

  const bookingCount = await prisma.mentorBooking.count({
    where: { mentorId, studentId },
  });
  if (bookingCount === 0) {
    const upcomingStart = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const upcomingEnd = new Date(upcomingStart.getTime() + 30 * 60 * 1000);
    const pastStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const pastEnd = new Date(pastStart.getTime() + 30 * 60 * 1000);

    const upcomingSlot = await prisma.mentorSlot.create({
      data: {
        mentorId,
        startsAt: upcomingStart,
        endsAt: upcomingEnd,
        status: 'BOOKED',
      },
    });
    await prisma.mentorBooking.create({
      data: {
        slotId: upcomingSlot.id,
        mentorId,
        studentId,
        topic: 'Portfolio review before placement season',
        note: 'Would love feedback on my projects and resume direction.',
        status: 'CONFIRMED',
      },
    });

    const pastSlot = await prisma.mentorSlot.create({
      data: {
        mentorId,
        startsAt: pastStart,
        endsAt: pastEnd,
        status: 'BOOKED',
      },
    });
    await prisma.mentorBooking.create({
      data: {
        slotId: pastSlot.id,
        mentorId,
        studentId,
        topic: 'Kickoff: goals for the cohort',
        status: 'COMPLETED',
        mentorNotes: 'Set a weekly practice plan; focus on JS fundamentals first.',
      },
    });

    // Leave one open slot for students to book in the UI.
    const openStart = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    await prisma.mentorSlot.create({
      data: {
        mentorId,
        startsAt: openStart,
        endsAt: new Date(openStart.getTime() + 30 * 60 * 1000),
        status: 'OPEN',
      },
    });
  }

  // Live class for the demo batch (Google Meet–style link + streak)
  const liveTitle = 'Live: JS deep-dive & Q&A';
  let liveClass = await prisma.batchSchedule.findFirst({
    where: { batchId: batch.id, title: liveTitle },
  });
  if (!liveClass) {
    const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    liveClass = await prisma.batchSchedule.create({
      data: {
        batchId: batch.id,
        title: liveTitle,
        description: 'Interactive session on async patterns. Join via Google Meet.',
        startsAt,
        endsAt,
        meetingUrl: 'https://meet.google.com/fca-demo-live',
        meetingProvider: 'GOOGLE_MEET',
        status: 'SCHEDULED',
        createdById: trainerId,
        location: 'Google Meet',
      },
    });
  } else if (!liveClass.meetingUrl) {
    liveClass = await prisma.batchSchedule.update({
      where: { id: liveClass.id },
      data: {
        meetingUrl: 'https://meet.google.com/fca-demo-live',
        meetingProvider: 'GOOGLE_MEET',
        status: 'SCHEDULED',
        createdById: trainerId,
      },
    });
  }

  await prisma.attendanceStreak.upsert({
    where: { userId: studentId },
    update: {},
    create: {
      userId: studentId,
      currentStreak: 3,
      longestStreak: 5,
      lastPresentOn: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() - 1)),
    },
  });

  console.log(`✅ Seed complete. ${SEED_USERS.length} users, org "${org.slug}".`);
  console.log(`   Course "${course.title}", batch "${batch.code}", assignment + assessment + opportunities.`);
  console.log(`   Live class "${liveClass.title}" · Meet ${liveClass.meetingUrl}`);
  console.log(`   Dev login password for all seed users: ${DEV_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
