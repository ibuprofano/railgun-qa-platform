// One-time local setup (`npm run setup`), after `npm install`. Safe to run again: it
// never overwrites a value that is already set, and skips what is already done.
//
//   1. checks Node and Docker
//   2. starts Postgres (docker compose) and waits until its roles exist
//   3. writes apps/api/.env and apps/web/.env.local: asks for the two Clerk keys and
//      generates SECRETS_MASTER_KEY (never replaced once set: ADR 0004)
//   4. applies the migrations, on a fresh database only, and checks RLS coverage
//   5. downloads and verifies the report fonts
//
// The Clerk keys can also come from the shell (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and
// CLERK_SECRET_KEY), for a non-interactive run.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { randomBytes } = require('crypto');
const { spawnSync } = require('child_process');
const { Client } = require('pg');

const root = path.join(__dirname, '..');
const API_ENV = path.join(root, 'apps', 'api', '.env');
const API_ENV_EXAMPLE = path.join(root, 'apps', 'api', '.env.example');
const WEB_ENV = path.join(root, 'apps', 'web', '.env.local');
const MIGRATOR_URL = 'postgresql://railgun_migrator:migrator_dev_password@localhost:5433/railgun';
const SUPERUSER_URL = 'postgresql://postgres:postgres@localhost:5433/railgun';
const MIN_NODE = [22, 18];
const DB_WAIT_MS = 90_000;

const warnings = [];
const step = (text) => console.log(`\n▶ ${text}`);
const ok = (text) => console.log(`  ✓ ${text}`);
const warn = (text) => {
  console.log(`  ! ${text}`);
  warnings.push(text);
};
function fail(text) {
  console.error(`\n✗ ${text}`);
  process.exit(1);
}

/**
 * Runs a fixed command line in the repository root, showing its output; returns whether
 * it succeeded. One string, since a shell is needed on Windows for npm and docker.
 */
function run(commandLine, env = {}) {
  const result = spawnSync(commandLine, { cwd: root, stdio: 'inherit', shell: true, env: { ...process.env, ...env } });
  return result.status === 0;
}

// --- env files: KEY=value lines, edited in place so comments and order survive -------

function readEnv(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

function getVar(text, key) {
  const match = text?.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : '';
}

function setVar(text, key, value) {
  const line = new RegExp(`^${key}=.*$`, 'm');
  if (line.test(text)) return text.replace(line, `${key}=${value}`);
  return `${text.replace(/\n*$/, '\n')}${key}=${value}\n`;
}

function ask(question) {
  if (!process.stdin.isTTY) return Promise.resolve('');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    }),
  );
}

async function askKey(label, prefix, fromShell) {
  if (fromShell) return fromShell;
  for (;;) {
    const answer = await ask(`  ${label} (${prefix}…, Enter to skip): `);
    if (answer === '' || answer.startsWith(prefix)) return answer;
    console.log(`  That doesn't look like a Clerk ${label.toLowerCase()}: it should start with ${prefix}`);
  }
}

// --- steps ------------------------------------------------------------------------------

function checkTools() {
  step('Checking Node and Docker');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < MIN_NODE[0] || (major === MIN_NODE[0] && minor < MIN_NODE[1])) {
    fail(`Node ${MIN_NODE.join('.')} or newer is required (graphile-worker needs it); this is ${process.versions.node}.`);
  }
  ok(`Node ${process.versions.node}`);
  const docker = spawnSync('docker info', { stdio: 'ignore', shell: true });
  if (docker.status !== 0) fail('Docker is not running. Start Docker Desktop (or the Docker daemon) and run `npm run setup` again.');
  ok('Docker is running');
}

async function startDatabase() {
  step('Starting PostgreSQL (docker compose, localhost:5433)');
  if (!run('docker compose up -d')) fail('`docker compose up -d` failed.');
  // Ready means the init scripts have created the roles, so connect as the migrator.
  const deadline = Date.now() + DB_WAIT_MS;
  for (;;) {
    const client = new Client({ connectionString: MIGRATOR_URL });
    try {
      await client.connect();
      await client.end();
      ok('PostgreSQL is ready');
      return;
    } catch {
      await client.end().catch(() => {});
      if (Date.now() > deadline) fail('PostgreSQL did not become ready within 90 s. Check `docker compose logs db`.');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

async function writeEnvFiles() {
  step('Environment files');
  let api = readEnv(API_ENV);
  if (api === null) {
    api = fs.readFileSync(API_ENV_EXAMPLE, 'utf8');
    ok('Created apps/api/.env from .env.example');
  }
  let web = readEnv(WEB_ENV) ?? '# Clerk keys for the web app (see apps/api/.env for the API side).\n';

  // SECRETS_MASTER_KEY: generated once, never replaced. Data keys and every stored
  // environment password are encrypted under it (ADR 0004).
  const masterKey = getVar(api, 'SECRETS_MASTER_KEY');
  if (masterKey === '') {
    api = setVar(api, 'SECRETS_MASTER_KEY', randomBytes(32).toString('base64'));
    ok('Generated SECRETS_MASTER_KEY (keep it: replacing it makes stored passwords unreadable)');
  } else if (Buffer.from(masterKey, 'base64').length !== 32) {
    warn('SECRETS_MASTER_KEY in apps/api/.env is not 32 bytes of base64; the API will refuse to start. It was left as it is.');
  } else {
    ok('SECRETS_MASTER_KEY already set (kept)');
  }

  // Clerk: the one thing setup can't create. The secret key is shared by both apps.
  let publishable = getVar(web, 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
  let secret = getVar(api, 'CLERK_SECRET_KEY') || getVar(web, 'CLERK_SECRET_KEY');
  const hadKeys = publishable !== '' && getVar(api, 'CLERK_SECRET_KEY') !== '' && getVar(web, 'CLERK_SECRET_KEY') !== '';
  if (publishable === '' || secret === '') {
    console.log('  Clerk keys: Clerk dashboard › your application › API keys (https://dashboard.clerk.com).');
  }
  if (publishable === '') {
    publishable = await askKey('Publishable key', 'pk_', process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  }
  if (secret === '') {
    secret = await askKey('Secret key', 'sk_', process.env.CLERK_SECRET_KEY);
  }
  if (publishable) web = setVar(web, 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', publishable);
  if (secret) {
    api = setVar(api, 'CLERK_SECRET_KEY', secret);
    web = setVar(web, 'CLERK_SECRET_KEY', secret);
  }
  if (!publishable || !secret) {
    warn('Clerk keys missing: sign-in won\'t work until NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (apps/web/.env.local) and CLERK_SECRET_KEY (both files) are set. Rerun `npm run setup` to be asked again.');
  } else {
    ok(hadKeys ? 'Clerk keys already set (kept)' : 'Clerk keys set in apps/api/.env and apps/web/.env.local');
  }

  fs.writeFileSync(API_ENV, api);
  fs.writeFileSync(WEB_ENV, web);
}

async function migrate() {
  step('Database schema');
  const client = new Client({ connectionString: MIGRATOR_URL });
  await client.connect();
  const { rows } = await client.query(`SELECT to_regclass('public.workspace') IS NOT NULL AS migrated`);
  await client.end();

  if (rows[0].migrated) {
    // The runner reapplies every file, so it only suits a fresh database.
    ok('Already migrated: skipped. To add newer migrations to an existing database, apply each one as railgun_migrator (CLAUDE.md, "Existing dev databases").');
  } else if (!run('node scripts/apply-migrations.js', { DATABASE_URL: MIGRATOR_URL })) {
    fail('Applying the migrations failed (output above).');
  } else {
    ok('Migrations applied');
  }

  if (!run('node scripts/check-rls-coverage.js', { DATABASE_URL: SUPERUSER_URL })) {
    fail('The RLS coverage check failed (output above).');
  }
}

function fonts() {
  step('Report fonts (Noto Sans JP, Noto Sans Mono CJK JP)');
  if (run('npm run fonts -w apps/worker')) {
    ok('Fonts present and verified');
  } else {
    warn('The report fonts could not be downloaded; every report will end Failed until `npm run fonts -w apps/worker` succeeds.');
  }
}

async function main() {
  checkTools();
  await startDatabase();
  await writeEnvFiles();
  await migrate();
  fonts();

  console.log(warnings.length ? `\nSetup finished with ${warnings.length} warning(s):` : '\nSetup finished.');
  for (const text of warnings) console.log(`  ! ${text}`);
  console.log(`
Next:
  npm run dev                                         # API :3001, web :3000, worker
  # sign up at http://localhost:3000, then, for demo data:
  npm run db:seed -w apps/api -- --email you@example.com`);
}

main().catch((error) => fail(error.message));
