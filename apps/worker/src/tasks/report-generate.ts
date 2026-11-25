import type { Pool } from 'pg';
import type { Task } from 'graphile-worker';
import { REPORT_KIND_LABELS, type ReportDbKind } from '@railgun-qa/reporting';
import { withTenantContext } from '../tenant-context';
import { emitReportChanged } from '../live-event';
import { BUILDERS } from '../reports/kinds';
import { renderPdf } from '../reports/render-pdf';
import { postgresReportStore, type ReportStore } from '../reports/report-store';

/**
 * report_generate (specs/report-generation; report-pipeline design.md decision 4): claims
 * the report, has its kind's builder read the rows under the tenant context in the
 * requester's zone (executions-dashboard-report decision 4), renders the PDF in a thread, stores it and marks the report Ready. Retries come
 * from Graphile (3 attempts, set by enqueue_job); the last failed attempt marks it Failed.
 */

export interface ReportJobPayload {
  reportId: string;
  workspaceId: string;
}

export interface GenerateDeps {
  render: (definition: unknown) => Promise<Buffer>;
  store: ReportStore;
}

const DEFAULT_DEPS: GenerateDeps = { render: (definition) => renderPdf(definition), store: postgresReportStore };

export type GenerateOutcome = 'ready' | 'failed' | 'skipped';

interface Claimed {
  projectId: string;
  kind: ReportDbKind;
  options: Record<string, unknown>;
}

/** A failure's reason as stored on the report: one line, at most 200 characters. */
const shortReason = (error: unknown) => (error instanceof Error ? error.message : String(error)).split('\n')[0].slice(0, 200);

export async function generateReport(
  pool: Pool,
  payload: ReportJobPayload,
  attempt: { number: number; max: number },
  deps: GenerateDeps = DEFAULT_DEPS,
): Promise<GenerateOutcome> {
  const { reportId, workspaceId } = payload;

  // 1. Claim it: still waiting and unexpired, or nothing to do.
  const claimed = await withTenantContext(pool, workspaceId, async (client) => {
    const { rows } = await client.query<{ project_id: string; kind: ReportDbKind; options: Claimed['options'] }>(
      `UPDATE report SET status = 'Generating'
       WHERE id = $1 AND status IN ('Queued', 'Generating') AND expires_at > now()
       RETURNING project_id, kind, options`,
      [reportId],
    );
    if (!rows[0]) return null;
    await emitReportChanged(client, { workspaceId, projectId: rows[0].project_id, reportId });
    return { projectId: rows[0].project_id, kind: rows[0].kind, options: rows[0].options } satisfies Claimed;
  });
  if (!claimed) return 'skipped';

  try {
    // 2–3. Read and assemble with the kind's builder (the dashboard's own SQL and rules).
    const builder = BUILDERS[claimed.kind];
    if (!builder) throw new Error(`unknown report kind: ${claimed.kind}`);
    const { definition, fileDay } = await withTenantContext(pool, workspaceId, (client) => builder(client, claimed));

    // 4. Render in a thread, at most 30 s.
    const bytes = await deps.render(definition);

    // 5. Store and finish, in one transaction.
    await withTenantContext(pool, workspaceId, async (client) => {
      await deps.store.put(client, workspaceId, reportId, bytes);
      await client.query(
        `UPDATE report SET status = 'Ready', file_name = $2, byte_size = $3, completed_at = now(), error = NULL WHERE id = $1`,
        [reportId, `${REPORT_KIND_LABELS[claimed.kind].fileBase}-${fileDay}.pdf`, bytes.length],
      );
      await emitReportChanged(client, { workspaceId, projectId: claimed.projectId, reportId });
    });
    return 'ready';
  } catch (error) {
    // 6. Retry while attempts remain; the last one records the failure instead of throwing.
    if (attempt.number < attempt.max) throw error;
    await withTenantContext(pool, workspaceId, async (client) => {
      await client.query(`UPDATE report SET status = 'Failed', error = $2, completed_at = now() WHERE id = $1`, [reportId, shortReason(error)]);
      await emitReportChanged(client, { workspaceId, projectId: claimed.projectId, reportId });
    });
    return 'failed';
  }
}

export function reportGenerateTask(pool: Pool): Task {
  return async (payload, helpers) => {
    const p = payload as Partial<ReportJobPayload>;
    if (typeof p?.reportId !== 'string' || typeof p.workspaceId !== 'string') {
      helpers.logger.error('report_generate: payload needs reportId and workspaceId');
      return;
    }
    const outcome = await generateReport(pool, p as ReportJobPayload, { number: helpers.job.attempts, max: helpers.job.max_attempts });
    helpers.logger.info(`report_generate ${p.reportId}: ${outcome}`);
  };
}
