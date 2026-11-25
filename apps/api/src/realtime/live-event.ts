import type { Prisma } from '@prisma/client';

/** The one Postgres channel every live event travels on (design.md decision 2). */
export const LIVE_CHANNEL = 'railgun_live';

/**
 * Live events are hints, not state (ADR 0005): identifiers only, so the client
 * refetches through the normal API. `workspaceId` is for the stream's tenant check
 * and is never sent to the browser.
 */
export type LiveEvent =
  | { type: 'execution.changed'; workspaceId: string; projectId: string; executionId: string }
  | { type: 'run.bugs.changed'; workspaceId: string; projectId: string; executionId: string; runId: string }
  | { type: 'report.changed'; workspaceId: string; projectId: string; reportId: string };

/**
 * Queues a live event on the caller's transaction. Postgres delivers a NOTIFY only
 * when the transaction commits and drops it on rollback, so a refused or failed
 * change never reaches a stream.
 */
export async function emitLiveEvent(tx: Prisma.TransactionClient, event: LiveEvent): Promise<void> {
  await tx.$executeRaw`SELECT pg_notify(${LIVE_CHANNEL}, ${JSON.stringify(event)})`;
}

/** The tenant and project an event belongs to; an `ExecutionActor` satisfies it. */
export interface LiveScope {
  workspaceId: string;
  projectId: string;
}

export function emitExecutionChanged(tx: Prisma.TransactionClient, scope: LiveScope, executionId: string): Promise<void> {
  return emitLiveEvent(tx, {
    type: 'execution.changed',
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    executionId,
  });
}

export function emitRunBugsChanged(
  tx: Prisma.TransactionClient,
  scope: LiveScope,
  executionId: string,
  runId: string,
): Promise<void> {
  return emitLiveEvent(tx, {
    type: 'run.bugs.changed',
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    executionId,
    runId,
  });
}

/** The ids each event type must carry (report-pipeline design.md decision 8). */
const REQUIRED_IDS: Record<LiveEvent['type'], readonly string[]> = {
  'execution.changed': ['workspaceId', 'projectId', 'executionId'],
  'run.bugs.changed': ['workspaceId', 'projectId', 'executionId', 'runId'],
  'report.changed': ['workspaceId', 'projectId', 'reportId'],
};

/** Parses a notification payload, or returns null for anything that isn't a live event. */
export function parseLiveEvent(payload: string | undefined): LiveEvent | null {
  if (!payload) {
    return null;
  }
  try {
    const value = JSON.parse(payload) as Record<string, unknown>;
    const type = value.type;
    if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(REQUIRED_IDS, type)) {
      return null;
    }
    const ids = REQUIRED_IDS[type as LiveEvent['type']];
    return ids.every((key) => typeof value[key] === 'string') ? (value as LiveEvent) : null;
  } catch {
    return null;
  }
}
