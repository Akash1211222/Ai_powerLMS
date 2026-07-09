import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService<Env, true>);
  const logger = new Logger('Bootstrap');

  // Security headers (§39)
  app.use(helmet());

  // CORS — explicit allowlist from env (§39)
  const origins = config
    .get('CORS_ORIGINS', { infer: true })
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });

  // Versioned API prefix (§38); health endpoints stay at root for probes
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/ready'],
  });

  // Global input validation (§38) — strip unknown props, fail on extras
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Graceful shutdown hooks (§43)
  app.enableShutdownHooks();

  // OpenAPI docs (§38)
  const swaggerConfig = new DocumentBuilder()
    .setTitle('FutureCorp Academy API')
    .setDescription('AI-powered Learning, Intelligence, Career & Community OS')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.get('API_PORT', { infer: true });
  await app.listen(port);
  logger.log(`API listening on ${config.get('API_BASE_URL', { infer: true })}`);
  logger.log(`OpenAPI docs at /api/docs`);
}

void bootstrap();
