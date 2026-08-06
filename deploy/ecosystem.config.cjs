/**
 * PM2 process file for FutureCorp LMS on Hostinger.
 * Runs alongside existing `futurecorp-api` (port 4000) — never replaces it.
 *
 * Usage (from /opt/fca-lms with .env already exported into the shell):
 *   set -a; . ./.env; set +a
 *   pm2 start deploy/ecosystem.config.cjs --update-env
 *   pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'fca-lms-api',
      cwd: '/opt/fca-lms/apps/api',
      script: 'dist/main.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      kill_timeout: 8000,
    },
    {
      name: 'fca-lms-web',
      cwd: '/opt/fca-lms',
      script: 'pnpm',
      args: '--filter @fca/web start',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      kill_timeout: 8000,
    },
    {
      name: 'fca-lms-worker',
      cwd: '/opt/fca-lms/apps/worker',
      script: 'dist/main.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '384M',
      kill_timeout: 8000,
    },
  ],
};
