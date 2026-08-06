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
};

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
      env,
    },
  ],
};
