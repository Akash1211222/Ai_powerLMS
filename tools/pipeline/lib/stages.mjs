/**
 * The local pipeline, stage for stage against .github/workflows/ci.yml.
 *
 * Parity is the whole point: a stage here that does not exist there gives
 * false confidence, and one there that is missing here is a break you only
 * find after pushing. `ciJob` names the job each stage mirrors, and the UI
 * shows anything that cannot run locally as a gap rather than as a pass.
 */

/** Profiles decide which stages run. Pre-push uses `quality`. */
export const PROFILES = {
  quality: 'Everything the CI "quality" job runs: typecheck, lint, unit tests, build.',
  full: 'quality + the integration job (migrations, seed, API integration + e2e).',
};

export const STAGES = [
  {
    id: 'install',
    name: 'Install',
    ciJob: 'quality',
    cmd: ['pnpm', 'install', '--frozen-lockfile'],
    profiles: ['full'],
    // In CI every run starts from an empty machine. Locally node_modules is
    // already there, so this only re-checks the lockfile and is skipped in the
    // pre-push profile, where it would add half a minute to every push.
    hint: 'A failure here means the lockfile and package.json disagree — commit the lockfile.',
  },
  {
    id: 'generate',
    name: 'Prisma client',
    ciJob: 'quality',
    cmd: ['pnpm', 'db:generate'],
    profiles: ['quality', 'full'],
    hint: 'Prisma could not generate its client. Usually a syntax error in schema.prisma.',
  },
  {
    id: 'typecheck',
    name: 'Typecheck',
    ciJob: 'quality',
    cmd: ['pnpm', 'typecheck'],
    parser: 'tsc',
    profiles: ['quality', 'full'],
    hint: 'TypeScript rejected the code. Each error below points at the exact line.',
  },
  {
    id: 'lint',
    name: 'Lint',
    ciJob: 'quality',
    cmd: ['pnpm', 'lint'],
    parser: 'eslint',
    profiles: ['quality', 'full'],
    hint: 'ESLint found problems. Warnings do not fail CI; errors do.',
  },
  {
    id: 'test',
    name: 'Unit tests',
    ciJob: 'quality',
    cmd: ['pnpm', 'test'],
    parser: 'vitest',
    profiles: ['quality', 'full'],
    hint: 'A unit test failed. The frame below is the assertion that blew up.',
  },
  {
    id: 'build',
    name: 'Build',
    ciJob: 'quality',
    cmd: ['pnpm', 'build'],
    parser: 'next',
    profiles: ['quality', 'full'],
    hint: 'The production build failed. Typecheck passing but build failing usually means a server/client boundary or a missing env var.',
  },
  {
    id: 'testdb',
    name: 'Test database',
    ciJob: 'integration',
    // CI gets a clean postgres container; locally the same three steps have to
    // be idempotent against a database that is already there.
    cmd: ['node', 'tools/pipeline/lib/testdb.mjs'],
    profiles: ['full'],
    hint: 'Could not prepare the test database — migrations or seed failed, or Postgres is not running.',
  },
  {
    id: 'integration',
    name: 'Integration + E2E',
    ciJob: 'integration',
    // Turbo strips TEST_DATABASE_URL (it is not in globalEnv), so the API
    // suite is invoked directly — the same reason AGENTS.md gives.
    cmd: ['pnpm', '--filter', '@fca/api', 'test'],
    parser: 'vitest',
    profiles: ['full'],
    hint: 'The API integration/e2e suite failed against a real Postgres and Redis.',
  },
  {
    id: 'images',
    name: 'Container images',
    ciJob: 'images',
    cmd: ['docker', 'buildx', 'version'],
    profiles: [],
    // Listed but never run locally: this Mac has no Docker, and three image
    // builds on a laptop would dwarf every other stage. CI is the only place
    // this is proved, so the console shows it as a known gap.
    gap: 'Runs in CI only — Docker is not installed on this machine.',
  },
];

export function stagesFor(profile) {
  return STAGES.filter((s) => s.profiles.includes(profile));
}

export function stageById(id) {
  return STAGES.find((s) => s.id === id);
}
