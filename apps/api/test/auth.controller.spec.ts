/**
 * Controller-level HTTP test (no DB). Boots AuthController with a stubbed
 * AuthService to verify the request pipeline — routing, body validation, and
 * that the ZodValidationPipe is scoped to @Body only (a method-level pipe would
 * wrongly validate the @ReqContext param and 400 every request).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';

describe('AuthController (HTTP, stubbed service)', () => {
  let app: INestApplication;
  const authService = {
    login: vi.fn().mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      tokenType: 'Bearer',
      expiresIn: 900,
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: PrismaService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('accepts a valid login body and calls the service (200)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'user@example.com', password: 'Password123!' })
      .expect(200);
    expect(authService.login).toHaveBeenCalledOnce();
    expect(authService.login.mock.calls[0][0].email).toBe('user@example.com');
  });

  it('rejects an invalid login body (400) without calling the service', async () => {
    authService.login.mockClear();
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email' })
      .expect(400);
    expect(authService.login).not.toHaveBeenCalled();
  });
});
