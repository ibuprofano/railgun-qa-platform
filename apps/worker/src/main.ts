import { run } from 'graphile-worker';
import { createWorkerPool } from './db';
import { CRONTAB } from './crontab';
import { createTaskList } from './tasks';
import { missingReportFonts, reportFontsDir } from './reports/fonts';

/**
 * The background worker (ADR 0005, ADR 0018), connected as railgun_worker. Graphile's own
 * signal handling stays on: SIGINT/SIGTERM stop new jobs, let running ones finish, then
 * resolve runner.promise. Graphile checks its schema version at startup; this role can't
 * create anything, so an outdated schema fails here — install it with scripts/install-job-queue.js.
 */
async function main(): Promise<void> {
  const missing = missingReportFonts();
  if (missing.length > 0) {
    // Report jobs fail visibly without them (ADR 0027); everything else still runs.
    console.error(`Report fonts missing in ${reportFontsDir()}: ${missing.join(', ')}. Run: npm run fonts -w apps/worker`);
  }
  const pool = createWorkerPool();
  const runner = await run({ pgPool: pool, taskList: createTaskList(pool), crontab: CRONTAB });
  await runner.promise;
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
