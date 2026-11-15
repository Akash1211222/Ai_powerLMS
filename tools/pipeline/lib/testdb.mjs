#!/usr/bin/env node
/**
 * Brings the test database to the state CI's integration job starts from:
 * the database exists, migrations are applied, seed data is in.
 *
 * CI gets this for free — a fresh `postgres:16-alpine` service container per
 * run. Locally the database outlives the run, so each of those three steps has
 * to be idempotent rather than assumed.
 *
 * It only ever touches TEST_DATABASE_URL. The development database is where
 * the work in progress lives, and a seed that lands there instead would wipe
 * it — so the two must never be the same URL, and that is checked below.
 */

import { execFileSync } from 'node:child_process';
import { connect } from 'node:net';
import { repoRoot } from './collect.mjs';

const ROOT = repoRoot();
const testUrl = process.env.TEST_DATABASE_URL;
const devUrl = process.env.DATABASE_URL;

function die(message, hint) {
  console.error(`\n  ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

if (!testUrl) {
  die('TEST_DATABASE_URL is not set.', 'Add it to .env, e.g. …/fca_test?schema=public');
}
if (testUrl === devUrl) {
  die(
    'TEST_DATABASE_URL is the same as DATABASE_URL.',
    'The suite seeds and truncates — point it at a separate database (fca_test).',
  );
}

const url = new URL(testUrl);
const dbName = url.pathname.replace(/^\//, '');

/** Reachability first: every later failure is unreadable if nothing is listening. */
await new Promise((resolve) => {
  const socket = connect({ host: url.hostname, port: Number(url.port || 5432) });
  socket.setTimeout(3000);
  const fail = () => {
    socket.destroy();
    die(
      `Postgres is not accepting connections on ${url.hostname}:${url.port || 5432}.`,
      'Start it first — `lms-services start` on this machine, or `pnpm infra:up` with Docker.',
    );
  };
  socket.on('connect', () => {
    socket.end();
    resolve();
  });
  socket.on('timeout', fail);
  socket.on('error', fail);
});

const pnpm = (args, env) =>
  execFileSync('pnpm', args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });

// CREATE DATABASE cannot be parameterised and must not run inside a
// transaction, so it goes through prisma db execute against the maintenance
// database. Already-exists is the expected case, not an error.
const maintenance = new URL(testUrl);
maintenance.pathname = '/postgres';
maintenance.search = '';
try {
  execFileSync(
    'pnpm',
    [
      '--filter',
      '@fca/database',
      'exec',
      'prisma',
      'db',
      'execute',
      '--url',
      maintenance.toString(),
      '--stdin',
    ],
    { cwd: ROOT, input: `CREATE DATABASE "${dbName}";`, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  console.log(`created database ${dbName}`);
} catch (err) {
  const out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  if (!/already exists/i.test(out)) {
    die(`Could not create ${dbName}.`, out.trim().split('\n').slice(-3).join('\n'));
  }
}

// From here the test database is simply "the" database, exactly as it is for
// the integration job in CI.
const asTest = { DATABASE_URL: testUrl };
pnpm(['db:migrate:deploy'], asTest);
pnpm(['db:seed'], asTest);
