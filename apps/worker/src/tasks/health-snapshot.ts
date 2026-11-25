import type { Pool } from 'pg';
import type { Task } from 'graphile-worker';
import { AS_OF_COUNTS_SQL, type AsOfCountsRow, figuresFromCounts } from '@railgun-qa/reporting';
import { listWorkspaceIds, withTenantContext } from '../tenant-context';

/**
 * The daily Health Score snapshot (ADR 0024; specs/health-snapshots). Records every live
 * project's score, band and components as they stand now, labelled with the UTC day that
 * just ended, using the same counting query and formulas as the API (ADR 0024).
 */

/** The UTC date ("YYYY-MM-DD") of the day before `at`'s UTC day: the day that just ended. */
export function snapshotDay(at: Date): string {
  const day = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() - 1));
  return day.toISOString().slice(0, 10);
}

export interface SnapshotSummary {
  day: string;
  recorded: number;
  failedProjects: string[];
}

export interface SnapshotOptions {
  day: string;
  /** Narrows the run (tests); by default every workspace is visited. */
  workspaceIds?: string[];
  /** Test seam: called before each project is recorded; throwing simulates a failure. */
  beforeProject?: (projectId: string) => void;
}

export async function recordHealthSnapshots(pool: Pool, options: SnapshotOptions): Promise<SnapshotSummary> {
  const summary: SnapshotSummary = { day: options.day, recorded: 0, failedProjects: [] };
  for (const workspaceId of options.workspaceIds ?? (await listWorkspaceIds(pool))) {
    const projects = await withTenantContext(pool, workspaceId, async (client) =>
      (await client.query<{ id: string }>('SELECT id FROM project WHERE deleted_at IS NULL ORDER BY id')).rows,
    );
    for (const { id: projectId } of projects) {
      try {
        // Each project in its own transaction, so one failure never undoes another's row.
        const inserted = await withTenantContext(pool, workspaceId, async (client) => {
          options.beforeProject?.(projectId);
          const { rows } = await client.query<AsOfCountsRow>(AS_OF_COUNTS_SQL, [projectId, null]);
          const { health } = figuresFromCounts(rows[0]);
          const result = await client.query(
            `INSERT INTO health_snapshot (workspace_id, project_id, day, score, band, pass_rate, coverage, bug_pressure, freshness)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (project_id, day) DO NOTHING`,
            [
              workspaceId,
              projectId,
              options.day,
              health.score,
              health.band,
              health.components.passRate,
              health.components.coverage,
              health.components.bugPressure,
              health.components.freshness,
            ],
          );
          return result.rowCount ?? 0;
        });
        summary.recorded += inserted;
      } catch (error) {
        console.error(`health_snapshot: project ${projectId} in workspace ${workspaceId} failed`, error);
        summary.failedProjects.push(projectId);
      }
    }
  }
  return summary;
}

/**
 * The `health_snapshot` task. A crontab run carries its scheduled time in `_cron.ts`, so
 * a late (backfilled) run still labels the day it was meant for. It fails the job, so
 * Graphile retries, when any project failed; a retry only fills what is missing.
 */
export function healthSnapshotTask(pool: Pool, seams: Omit<SnapshotOptions, 'day'> = {}): Task {
  return async (payload) => {
    const cron = (payload as { _cron?: { ts?: string } } | null)?._cron;
    const day = snapshotDay(cron?.ts ? new Date(cron.ts) : new Date());
    const summary = await recordHealthSnapshots(pool, { ...seams, day });
    console.info('health_snapshot done', summary);
    if (summary.failedProjects.length > 0) {
      throw new Error(`health_snapshot failed for ${summary.failedProjects.length} project(s)`);
    }
  };
}
