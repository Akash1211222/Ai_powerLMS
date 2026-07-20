import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { QueueModule } from './queue/queue.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
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
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
