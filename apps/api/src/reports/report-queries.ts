import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { apiKindOf, type ReportApiKind, type ReportDbKind } from '@railgun-qa/reporting';
import type { ReportRequest } from './report-rules';

export type ReportStatus = 'Queued' | 'Generating' | 'Ready' | 'Failed';

interface ReportRow {
  id: string;
  kind: ReportDbKind;
  options: Record<string, unknown>;
  status: ReportStatus;
  error: string | null;
  file_name: string | null;
  byte_size: number | null;
  created_at: Date;
  completed_at: Date | null;
  expires_at: Date;
}

export interface ReportResponse {
  id: string;
  kind: ReportApiKind;
  status: ReportStatus;
  error: string | null;
  fileName: string | null;
  byteSize: number | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string;
}


function toResponse(row: ReportRow): ReportResponse {
  return {
    id: row.id,
    kind: apiKindOf(row.kind),
    status: row.status,
    error: row.error,
    fileName: row.file_name,
    byteSize: row.byte_size,
    createdAt: row.created_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? null,
    expiresAt: row.expires_at.toISOString(),
  };
}

const COLUMNS = 'id, kind, options, status, error, file_name, byte_size, created_at, completed_at, expires_at';

/** Creates the report and enqueues its generation, both in the caller's transaction (ADR 0005). */
export async function createReport(
  tx: Prisma.TransactionClient,
  scope: { workspaceId: string; projectId: string; userId: string },
  request: ReportRequest,
): Promise<ReportResponse> {
  const [row] = await tx.$queryRawUnsafe<ReportRow[]>(
    `INSERT INTO report (workspace_id, project_id, requested_by, kind, options)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::jsonb)
     RETURNING ${COLUMNS}`,
    scope.workspaceId,
    scope.projectId,
    scope.userId,
    request.kind,
    JSON.stringify(request.options),
  );
  await tx.$queryRawUnsafe(
    `SELECT enqueue_job('report_generate', $1::jsonb)`,
    JSON.stringify({ reportId: row.id, workspaceId: scope.workspaceId }),
  );
  return toResponse(row);
}

/**
 * The caller's own, unexpired report in this project, or 404 (specs/report-generation:
 * anyone else's, and anything expired, answers as if it didn't exist).
 */
export async function loadOwnReport(
  tx: Prisma.TransactionClient,
  projectId: string,
  userId: string,
  reportId: string,
): Promise<ReportResponse & { rawKind: ReportDbKind; options: ReportRow['options'] }> {
  const [row] = await tx.$queryRawUnsafe<ReportRow[]>(
    `SELECT ${COLUMNS} FROM report
     WHERE id = $1::uuid AND project_id = $2::uuid AND requested_by = $3::uuid AND expires_at > now()`,
    reportId,
    projectId,
    userId,
  );
  if (!row) {
    throw new NotFoundException('report not found');
  }
  return { ...toResponse(row), rawKind: row.kind, options: row.options };
}
