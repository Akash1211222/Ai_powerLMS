/**
 * Mentorship e2e (§28). Runs live in CI. Verifies:
 *   - a mentor publishes availability (overlaps rejected) and appears in the
 *     student-facing mentor directory
 *   - a student books an open slot; the slot flips to BOOKED and double-booking
 *     is refused
 *   - cancelling releases the slot back to OPEN
 *   - the mentor closes out a session; students can't reach mentor-only routes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@fca/database';

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;

run('Mentorship (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let orgId: string;
  let mentorId: string;
  let studentId: string;
  let mentorToken: string;
  let studentToken: string;
  let slotId = '';
  let bookingId = '';

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const inDays = (d: number, h = 10) => {
    const x = new Date();
    x.setDate(x.getDate() + d);
    x.setHours(h, 0, 0, 0);
    return x.toISOString();
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = new PrismaClient({ datasourceUrl: TEST_DB });
    orgId = (await prisma.organization.findUniqueOrThrow({ where: { slug: 'futurecorp-demo' } })).id;
    mentorId = (await prisma.user.findUniqueOrThrow({ where: { email: 'mentor@futurecorpacademy.in' } })).id;
    studentId = (await prisma.user.findUniqueOrThrow({ where: { email: 'student@futurecorpacademy.in' } })).id;

    const { AppModule } = await import('../src/app.module');
    const { AllExceptionsFilter } = await import('../src/common/filters/all-exceptions.filter');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    mentorToken = await login('mentor@futurecorpacademy.in');
    studentToken = await login('student@futurecorpacademy.in');

    // Both must share an org for the directory to surface the mentor.
    for (const userId of [mentorId, studentId]) {
      await prisma.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: orgId, userId } },
        update: {},
        create: { organizationId: orgId, userId },
      });
    }
    await prisma.mentorBooking.deleteMany({ where: { mentorId } });
    await prisma.mentorSlot.deleteMany({ where: { mentorId } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.mentorBooking.deleteMany({ where: { mentorId } }).catch(() => undefined);
      await prisma.mentorSlot.deleteMany({ where: { mentorId } }).catch(() => undefined);
      await prisma.mentorProfile.deleteMany({ where: { userId: mentorId } }).catch(() => undefined);
      await prisma.$disconnect();
    }
    if (app) await app.close();
  });

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'Password123!' }).expect(200);
    return res.body.accessToken as string;
  }
  async function api(method: 'post' | 'get' | 'put' | 'delete', path: string, token: string, body?: unknown) {
    const r = request(app.getHttpServer())[method](path).set(auth(token));
    const res = await (body ? r.send(body) : r);
    if (res.status >= 400) throw new Error(`${method} ${path} -> ${res.status}: ${res.text}`);
    return res.body;
  }

  it('lets a mentor set up a profile and publish availability (no overlaps)', async () => {
    const profile = await api('put', '/api/v1/me/mentor-profile', mentorToken, {
      headline: 'Data career mentor',
      expertise: ['SQL', 'Interviews'],
      isAcceptingBookings: true,
    });
    expect(profile.headline).toBe('Data career mentor');

    const slot = await api('post', '/api/v1/me/mentor-slots', mentorToken, {
      startsAt: inDays(3, 10),
      endsAt: inDays(3, 11),
    });
    expect(slot.status).toBe('OPEN');
    slotId = slot.id;

    // Overlapping window → 409.
    await request(app.getHttpServer())
      .post('/api/v1/me/mentor-slots')
      .set(auth(mentorToken))
      .send({ startsAt: inDays(3, 10), endsAt: inDays(3, 12) })
      .expect(409);

    // Past slots are rejected by validation.
    await request(app.getHttpServer())
      .post('/api/v1/me/mentor-slots')
      .set(auth(mentorToken))
      .send({ startsAt: '2020-01-01T10:00:00Z', endsAt: '2020-01-01T11:00:00Z' })
      .expect(400);
  });

  it('surfaces the mentor to students and books an open slot', async () => {
    const mentors = await api('get', '/api/v1/mentors', studentToken);
    const mine = (mentors as Array<{ mentorId: string; openSlots: number }>).find((m) => m.mentorId === mentorId);
    expect(mine).toBeTruthy();
    expect(mine!.openSlots).toBeGreaterThanOrEqual(1);

    const slots = await api('get', `/api/v1/mentors/${mentorId}/slots`, studentToken);
    expect((slots as Array<{ id: string }>).some((s) => s.id === slotId)).toBe(true);

    const booking = await api('post', `/api/v1/mentor-slots/${slotId}/book`, studentToken, {
      topic: 'Interview preparation',
      note: 'Focus on SQL rounds.',
    });
    expect(booking.status).toBe('CONFIRMED');
    bookingId = booking.id;

    // Slot is claimed — a second booking is refused.
    await request(app.getHttpServer())
      .post(`/api/v1/mentor-slots/${slotId}/book`)
      .set(auth(studentToken))
      .send({ topic: 'Another attempt' })
      .expect(409);

    // Both sides see it.
    const mySide = await api('get', '/api/v1/me/bookings', studentToken);
    expect((mySide as Array<{ id: string }>).some((b) => b.id === bookingId)).toBe(true);
    const mentorSide = await api('get', '/api/v1/me/mentor-bookings', mentorToken);
    expect((mentorSide as Array<{ id: string }>).some((b) => b.id === bookingId)).toBe(true);
  });

  it('releases the slot when the booking is cancelled, then allows rebooking', async () => {
    await api('post', `/api/v1/me/bookings/${bookingId}/cancel`, studentToken);
    const slot = await prisma.mentorSlot.findUniqueOrThrow({ where: { id: slotId } });
    expect(slot.status).toBe('OPEN');

    // Cancelling twice is refused.
    await request(app.getHttpServer())
      .post(`/api/v1/me/bookings/${bookingId}/cancel`)
      .set(auth(studentToken))
      .expect(400);

    // The freed slot can be booked again.
    const rebooked = await api('post', `/api/v1/mentor-slots/${slotId}/book`, studentToken, { topic: 'Second try' });
    expect(rebooked.status).toBe('CONFIRMED');
    bookingId = rebooked.id;
  });

  it('lets the mentor close out the session; students cannot use mentor routes', async () => {
    const done = await api('post', `/api/v1/me/mentor-bookings/${bookingId}/complete`, mentorToken, {
      mentorNotes: 'Great session — follow up on window functions.',
      status: 'COMPLETED',
    });
    expect(done.status).toBe('COMPLETED');
    expect(done.mentorNotes).toContain('window functions');

    await request(app.getHttpServer())
      .get('/api/v1/me/mentor-slots')
      .set(auth(studentToken))
      .expect(403);
  });
});
