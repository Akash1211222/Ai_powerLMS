import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import type { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService<Env, true>);
  const logger = new Logger('Bootstrap');

  const nodeEnv = config.get('NODE_ENV', { infer: true });
  const isProduction = nodeEnv === 'production';

  // Security headers (§39)
  app.use(helmet());

  // Bound request bodies so a single client can't exhaust memory (§39).
  const bodyLimit = config.get('BODY_LIMIT', { infer: true });
  app.useBodyParser('json', { limit: bodyLimit });
  app.useBodyParser('urlencoded', { limit: bodyLimit, extended: true });

  // CORS — explicit allowlist from env (§39)
  const origins = config
    .get('CORS_ORIGINS', { infer: true })
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });

  // Trust the proxy so req.ip reflects the real client (behind LB in prod)
  app.set('trust proxy', 1);

  // Versioned API prefix (§38); health endpoints stay at root for probes
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/ready'],
  });

  // Input validation is per-route via ZodValidationPipe (§38). Errors are
  // normalized into the shared ApiErrorBody envelope by the global filter.
  app.useGlobalFilters(new AllExceptionsFilter());

  // Graceful shutdown hooks (§43)
  app.enableShutdownHooks();

  // OpenAPI docs (§38). Off by default in production — the schema maps the
  // whole attack surface, so publishing it is an explicit opt-in.
  const swaggerEnabled = config.get('SWAGGER_ENABLED', { infer: true }) ?? !isProduction;
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('FutureCorp Academy API')
      .setDescription('AI-powered Learning, Intelligence, Career & Community OS')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = config.get('API_PORT', { infer: true });
  await app.listen(port);
  logger.log(`API listening on ${config.get('API_BASE_URL', { infer: true })} [${nodeEnv}]`);
  logger.log(
    swaggerEnabled ? 'OpenAPI docs at /api/docs' : 'OpenAPI docs disabled (set SWAGGER_ENABLED=true to serve)',
  );
  logger.log(
    config.get('RATE_LIMIT_ENABLED', { infer: true })
      ? `Rate limiting on: ${config.get('RATE_LIMIT_MAX', { infer: true })}/window general, ${config.get('AUTH_RATE_LIMIT_MAX', { infer: true })}/window auth`
      : 'Rate limiting DISABLED',
  );
}

/**
 * Never die silently. A crashed process that leaves no trace is the hardest
 * kind of production incident to diagnose; log loudly, then let the platform
 * restart us rather than limping on in an unknown state (§43).
 */
function installCrashHandlers(): void {
  const logger = new Logger('Process');
  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled promise rejection: ${reason instanceof Error ? reason.stack : String(reason)}`);
  });
  process.on('uncaughtException', (error) => {
    logger.error(`Uncaught exception: ${error.stack ?? error.message}`);
    process.exit(1);
  });
}

installCrashHandlers();
void bootstrap().catch((error) => {
  new Logger('Bootstrap').error(`Failed to start: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
