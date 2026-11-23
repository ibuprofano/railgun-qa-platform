import { BadRequestException } from '@nestjs/common';
import { type ActivityEntryRow, type ActivityKeysetCursor, decodeActivityCursor, type HistoryPage } from './activity-log-reader';

/** One activity entry as the history endpoints return it (ADR 0021). */
export interface ActivityEntryResponse {
  id: string;
  /** Null for system actions, such as the trash purge. */
  actorName: string | null;
  actionCode: string;
  entityType: string;
  entityId: string;
  entityName: string;
  details: unknown;
  createdAt: string;
}

export interface ActivityHistoryResponse {
  entries: ActivityEntryResponse[];
  nextCursor: string | null;
}

/** Parses the optional `before` query parameter; a malformed cursor is a 400. */
export function parseHistoryCursor(before: unknown): ActivityKeysetCursor | undefined {
  if (before === undefined || before === '') {
    return undefined;
  }
  const cursor = typeof before === 'string' ? decodeActivityCursor(before) : null;
  if (!cursor) {
    throw new BadRequestException('before must be a cursor returned by a previous page');
  }
  return cursor;
}

function toEntry(row: ActivityEntryRow): ActivityEntryResponse {
  return {
    id: row.id,
    actorName: row.actor_display_name,
    actionCode: row.action_code,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityName: row.entity_name,
    details: row.details,
    createdAt: row.created_at.toISOString(),
  };
}

export function toHistoryResponse(page: HistoryPage): ActivityHistoryResponse {
  return { entries: page.rows.map(toEntry), nextCursor: page.nextCursor };
}
