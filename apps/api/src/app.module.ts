import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuditModule } from './audit/audit.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';
import { AuthzModule } from './authz/authz.module';
import { AdminModule } from './admin/admin.module';
import { CoursesModule } from './courses/courses.module';
import { BatchesModule } from './batches/batches.module';
import { MeModule } from './me/me.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AttendanceModule } from './attendance/attendance.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { NotificationModule } from './notifications/notification.module';
import { CalendarModule } from './calendar/calendar.module';
import { SkillsModule } from './skills/skills.module';
import { InterventionsModule } from './interventions/interventions.module';
import { ReportsModule } from './reports/reports.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { PlacementModule } from './placement/placement.module';
import { CareerModule } from './career/career.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { ApplicationsModule } from './applications/applications.module';
import { MentorshipModule } from './mentorship/mentorship.module';
import { AlumniModule } from './alumni/alumni.module';
import { ReferralsModule } from './referrals/referrals.module';
import { CommunityModule } from './community/community.module';
import { ReputationModule } from './reputation/reputation.module';
import { QueueModule } from './queue/queue.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import type { Env } from './config/env';
import { isAuthRoute } from './common/guards/auth-route';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    // Per-IP HTTP rate limiting (§39); tuned via env so it can be relaxed for
    // load tests and disabled entirely in the test suite. Every configured
    // throttler is evaluated on every request, so the two buckets use skipIf
    // to make exactly one apply: the tight budget on unauthenticated auth
    // routes, the general budget everywhere else.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const ttl = config.get('RATE_LIMIT_TTL_SECONDS', { infer: true }) * 1000;
        console.log('THROTTLE_CFG', JSON.stringify({ ttl, max: config.get('RATE_LIMIT_MAX', { infer: true }), authMax: config.get('AUTH_RATE_LIMIT_MAX', { infer: true }), enabled: config.get('RATE_LIMIT_ENABLED', { infer: true }) }));
        return [
          {
            name: 'default',
            ttl,
            limit: config.get('RATE_LIMIT_MAX', { infer: true }),
            skipIf: isAuthRoute,
          },
          {
            name: 'auth',
            ttl,
            limit: config.get('AUTH_RATE_LIMIT_MAX', { infer: true }),
            skipIf: (ctx) => !isAuthRoute(ctx),
          },
        ];
      },
    }),
    PrismaModule,
    RedisModule,
    AuditModule,
    MailModule,
    HealthModule,
    AuthModule,
    AuthzModule,
    AdminModule,
    CoursesModule,
    BatchesModule,
    MeModule,
    DashboardModule,
    AttendanceModule,
    QueueModule,
    NotificationModule,
    AssignmentsModule,
    AssessmentsModule,
    CalendarModule,
    SkillsModule,
    InterventionsModule,
    ReportsModule,
    RecommendationsModule,
    AnalyticsModule,
    PlacementModule,
    CareerModule,
    OpportunitiesModule,
    ApplicationsModule,
    MentorshipModule,
    AlumniModule,
    ReferralsModule,
    CommunityModule,
    ReputationModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
