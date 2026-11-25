import type { Pool } from 'pg';
import type { TaskList } from 'graphile-worker';
import { trashPurgeTask } from './trash-purge';
import { healthSnapshotTask } from './health-snapshot';
import { reportGenerateTask } from './report-generate';

/**
 * Every task the worker runs, by name. A name here must also be on enqueue_job's
 * allow-list (migration 0014) to be enqueued from application code.
 */
export function createTaskList(pool: Pool): TaskList {
  return {
    trash_purge: trashPurgeTask(pool),
    health_snapshot: healthSnapshotTask(pool),
    report_generate: reportGenerateTask(pool),
  };
}
