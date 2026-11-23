import { Prisma } from '@prisma/client';

export interface ActivityKeysetCursor {
  createdAt: Date;
  id: string;
}

export interface ListActivityEntriesParams {
  workspaceId: string;
  /** Omit to read across the whole workspace; set to scope to one project. */
  projectId?: string;
  /** Omit for the first page. */
  after?: ActivityKeysetCursor;
  limit?: number;
}

export interface ActivityEntryRow {
  id: string;
  workspace_id: string;
  project_id: string | null;
  actor_user_id: string | null;
  actor_display_name: string | null;
  action_code: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  category: string;
  details: unknown;
  created_at: Date;
}

/**
 * Keyset pagination, never offset (ADR 0007 / PRD §6.6): newest first, matching the
 * (workspace_id, project_id, created_at desc, id) index from the migration.
 */
export async function listActivityEntries(
  tx: Prisma.TransactionClient,
  { workspaceId, projectId, after, limit = 20 }: ListActivityEntriesParams,
): Promise<ActivityEntryRow[]> {
  const projectFilter = projectId ? Prisma.sql`AND project_id = ${projectId}::uuid` : Prisma.empty;
  const cursorFilter = after
    ? Prisma.sql`AND (created_at, id) < (${after.createdAt}, ${after.id}::uuid)`
    : Prisma.empty;

  return tx.$queryRaw<ActivityEntryRow[]>`
    SELECT id, workspace_id, project_id, actor_user_id, actor_display_name,
           action_code, entity_type, entity_id, entity_name, category, details, created_at
    FROM activity_entries
    WHERE workspace_id = ${workspaceId}::uuid
    ${projectFilter}
    ${cursorFilter}
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit}
  `;
}

/** Item history page size (ADR 0021 decision 2). */
export const HISTORY_PAGE_SIZE = 20;

/** Encodes a keyset position as an opaque base64url cursor (`<createdAt ISO>|<id>`). */
export function encodeActivityCursor(cursor: ActivityKeysetCursor): string {
  return Buffer.from(`${cursor.createdAt.toISOString()}|${cursor.id}`, 'utf8').toString('base64url');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Decodes a cursor from `encodeActivityCursor`; null when it is malformed. */
export function decodeActivityCursor(raw: string): ActivityKeysetCursor | null {
  const decoded = Buffer.from(raw, 'base64url').toString('utf8');
  const separator = decoded.indexOf('|');
  if (separator === -1) {
    return null;
  }
  const createdAt = new Date(decoded.slice(0, separator));
  const id = decoded.slice(separator + 1);
  if (Number.isNaN(createdAt.getTime()) || !UUID.test(id)) {
    return null;
  }
  return { createdAt, id };
}

export interface HistoryPage {
  rows: ActivityEntryRow[];
  /** Cursor for the next, older page; null on the last page. */
  nextCursor: string | null;
}

interface HistoryParams {
  workspaceId: string;
  projectId: string;
  before?: ActivityKeysetCursor;
  limit?: number;
}

async function historyPage(
  tx: Prisma.TransactionClient,
  { workspaceId, projectId, before, limit = HISTORY_PAGE_SIZE }: HistoryParams,
  subject: Prisma.Sql,
): Promise<HistoryPage> {
  const cursorFilter = before
    ? Prisma.sql`AND (created_at, id) < (${before.createdAt}, ${before.id}::uuid)`
    : Prisma.empty;
  const rows = await tx.$queryRaw<ActivityEntryRow[]>`
    SELECT id, workspace_id, project_id, actor_user_id, actor_display_name,
           action_code, entity_type, entity_id, entity_name, category, details, created_at
    FROM activity_entries
    WHERE workspace_id = ${workspaceId}::uuid AND project_id = ${projectId}::uuid
      AND (${subject})
      ${cursorFilter}
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit + 1}
  `;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    rows: page,
    nextCursor: rows.length > limit && last ? encodeActivityCursor({ createdAt: last.created_at, id: last.id }) : null,
  };
}

/**
 * An execution's history (ADR 0021 decision 1): its own entries, entries of its runs
 * (which name it in `details.executionId`), and every entry of each bug currently linked
 * to one of its runs.
 */
export function listExecutionHistory(
  tx: Prisma.TransactionClient,
  params: HistoryParams & { executionId: string },
): Promise<HistoryPage> {
  const { executionId } = params;
  return historyPage(
    tx,
    params,
    Prisma.sql`
      (entity_type = 'test_execution' AND entity_id = ${executionId}::uuid)
      OR (entity_type = 'test_run' AND details->>'executionId' = ${executionId})
      OR (entity_type = 'bug' AND entity_id IN (
            SELECT b.id FROM bug b JOIN test_run r ON r.id = b.test_run_id
            WHERE r.execution_id = ${executionId}::uuid))
    `,
  );
}

/** A bug's own entries (ADR 0021 decision 2). */
export function listBugHistory(
  tx: Prisma.TransactionClient,
  params: HistoryParams & { bugId: string },
): Promise<HistoryPage> {
  return historyPage(tx, params, Prisma.sql`entity_type = 'bug' AND entity_id = ${params.bugId}::uuid`);
}
