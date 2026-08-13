/**
 * PM2 process file for FutureCorp LMS on Hostinger.
 * Runs alongside existing `futurecorp-api` (port 4000) — never replaces it.
 *
 * Usage:
 *   pm2 start /opt/fca-lms/deploy/ecosystem.config.cjs --update-env
 *   pm2 save
 */
const path = require('node:path');
const { loadEnvFile } = require('./load-env.cjs');

const LMS_ROOT = process.env.LMS_ROOT || '/opt/fca-lms';
const fileEnv = loadEnvFile(path.join(LMS_ROOT, '.env'));

// Force LMS ports so we never collide with legacy API on :4000
const env = {
  ...fileEnv,
  NODE_ENV: 'production',
  API_PORT: fileEnv.API_PORT || '4001',
  WEB_PORT: fileEnv.WEB_PORT || '3000',
  // pnpm and Next want somewhere to put caches. Left unset, a process that has
  // dropped privileges inherits root's HOME and cannot write to it.
  ...(fileEnv.APP_USER ? { HOME: fileEnv.APP_HOME || `/home/${fileEnv.APP_USER}` } : {}),
};

/**
 * Run the internet-facing processes as an unprivileged user.
 *
 * The pm2 daemon stays root — it has to, to drop privileges at all — but the
 * API, web and worker do not need root and should never have had it: a remote
 * code execution bug in any of them currently reads every secret on the box,
 * the LMS database and the landing site's leads.
 *
 * Keyed off APP_USER so this is a no-op anywhere the user does not exist
 * (a laptop, a container). Setting it to a user that does not exist would stop
 * the processes booting, so it is set in .env on the host that has one.
 */
const runAs = fileEnv.APP_USER
  ? { uid: fileEnv.APP_USER, gid: fileEnv.APP_GROUP || fileEnv.APP_USER }
  : {};

module.exports = {
  apps: [
    {
      name: 'fca-lms-api',
      cwd: path.join(LMS_ROOT, 'apps/api'),
      script: 'dist/main.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      kill_timeout: 8000,
      ...runAs,
      env,
    },
    {
      name: 'fca-lms-web',
      cwd: LMS_ROOT,
      script: 'pnpm',
      args: '--filter @fca/web start',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      kill_timeout: 8000,
      ...runAs,
      env: {
        ...env,
        PORT: env.WEB_PORT || '3000',
      },
    },
    {
      name: 'fca-lms-worker',
      cwd: path.join(LMS_ROOT, 'apps/worker'),
      script: 'dist/main.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '384M',
      kill_timeout: 8000,
      ...runAs,
      env,
    },
  ],
};
