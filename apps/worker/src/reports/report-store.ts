import type { PoolClient } from 'pg';

/**
 * Where report files live (ADR 0027). The worker writes; the API reads through its own
 * adapter. Until E3 the bytes go in `report_file`, inside the caller's tenant transaction.
 */
export interface ReportStore {
  put(client: PoolClient, workspaceId: string, reportId: string, bytes: Buffer): Promise<void>;
}

export const postgresReportStore: ReportStore = {
  async put(client, workspaceId, reportId, bytes) {
    await client.query('INSERT INTO report_file (report_id, workspace_id, content) VALUES ($1, $2, $3)', [reportId, workspaceId, bytes]);
  },
};
