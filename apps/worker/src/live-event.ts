import type { PoolClient } from 'pg';

/**
 * The live-event channel (ADR 0005), shared with apps/api/src/realtime/live-event.ts's
 * LIVE_CHANNEL: keep the two names equal. Events carry ids only.
 */
export const LIVE_CHANNEL = 'railgun_live';

/** Queues `report.changed` on the caller's transaction; Postgres delivers it on commit. */
export async function emitReportChanged(client: PoolClient, event: { workspaceId: string; projectId: string; reportId: string }): Promise<void> {
  await client.query('SELECT pg_notify($1, $2)', [LIVE_CHANNEL, JSON.stringify({ type: 'report.changed', ...event })]);
}
