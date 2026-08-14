import { z } from 'zod';

/**
 * Environment schema (§39: secure by default, fail fast on misconfig).
 * The API refuses to boot if required variables are missing/invalid.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_BASE_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be >= 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be >= 32 chars'),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(1209600),

  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),

  // HTTP rate limiting (§39). Login lockout is per-account; this bounds
  // per-IP abuse (email spraying, scraping, expensive analytics endpoints).
  RATE_LIMIT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  /** Tighter budget for unauthenticated auth endpoints. */
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

  /** Max accepted request body size (protects against payload floods). */
  BODY_LIMIT: z.string().default('1mb'),
  /** Serve OpenAPI docs. Defaults off in production. */
  SWAGGER_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  /**
   * Interface the API binds to. 0.0.0.0 so containers stay reachable; set to
   * 127.0.0.1 on a host where nginx is the only legitimate caller.
   */
  API_HOST: z.string().default('0.0.0.0'),

  /**
   * Public demo. POST /auth/demo signs anyone in as DEMO_STUDENT_EMAIL, so it
   * is off unless a host deliberately turns it on — an unguarded copy of this
   * config elsewhere must not hand out sessions.
   */
  DEMO_MODE_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /**
   * The account the demo signs visitors into. Deliberately a full address
   * rather than a flag: whoever enables the demo has to name the account, and
   * the guard below refuses anything outside the demo domain.
   */
  DEMO_STUDENT_EMAIL: z.string().email().optional(),

  /** Host code runner (spawns compilers). Must stay off on shared VPS. */
  CODE_RUN_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  /**
   * Off-box code runner (Judge0 API). When set, the compiled languages execute
   * there instead of on this host, which is the only arrangement that is safe
   * on a box that also serves the database.
   *
   * A URL rather than a boolean on purpose: the free public instance can be
   * swapped for a self-hosted or paid one without a code change. That is not
   * hypothetical — the public Piston API became whitelist-only in Feb 2026.
   */
  CODE_RUNNER_URL: z.string().url().optional(),
  /** Sent as X-Auth-Token. Only needed by instances that require a key. */
  CODE_RUNNER_TOKEN: z.string().optional(),
  /** Give a cold compile room to finish; the runner caps real CPU itself. */
  CODE_RUNNER_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),

  MAIL_HOST: z.string().optional(),
  MAIL_PORT: z.coerce.number().int().positive().optional(),
  MAIL_USER: z.string().optional(),
  MAIL_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  MAIL_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  WEB_BASE_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Used by @nestjs/config `validate`. Throws with a readable message. */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
