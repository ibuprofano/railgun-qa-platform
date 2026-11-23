import type { ExecutionStatus } from './executions-api';
import type { ProjectRole } from './test-case-permissions';

export type ExecutionAction =
  | 'edit'
  | 'markReady'
  | 'delete'
  | 'backToDraft'
  | 'runAll'
  | 'pause'
  | 'resume'
  | 'signOff'
  | 'cancel'
  | 'tryAgain';

/**
 * Which actions each status offers (PRD §6.3.4), and the minimum role for each. Mirrors
 * the API's transition table (apps/api/src/executions/execution-lifecycle.ts) and ADRs
 * 0012, 0019 and 0020 — the API stays the authority, so a drifted entry shows up as a
 * 409/403 the screen displays. Try Again's Restart has its own rule: see canRestart.
 */
const ACTIONS_BY_STATUS: Record<ExecutionStatus, ExecutionAction[]> = {
  Draft: ['edit', 'markReady', 'delete'],
  Ready: ['backToDraft', 'runAll'],
  InProgress: ['pause', 'cancel'],
  Paused: ['resume', 'cancel'],
  Completed: ['signOff', 'tryAgain'],
  Done: ['tryAgain'],
  Canceled: ['tryAgain'],
};

const ADMIN_ONLY: ExecutionAction[] = ['delete', 'signOff'];

const isContributorOrAbove = (role: ProjectRole | null) => role === 'Contributor' || role === 'Admin';

export function executionActionsFor(status: ExecutionStatus, role: ProjectRole | null): ExecutionAction[] {
  if (!isContributorOrAbove(role)) {
    return [];
  }
  return ACTIONS_BY_STATUS[status].filter((action) => role === 'Admin' || !ADMIN_ONLY.includes(action));
}

/**
 * Try Again's Restart (ADR 0020): Contributor+ from Completed or Canceled; a signed-off
 * (Done) execution only by an Admin, since restarting undoes the sign-off.
 */
export function canRestart(status: ExecutionStatus, role: ProjectRole | null): boolean {
  if (status === 'Done') {
    return role === 'Admin';
  }
  return isContributorOrAbove(role) && (status === 'Completed' || status === 'Canceled');
}

export function canCreateExecution(role: ProjectRole | null): boolean {
  return isContributorOrAbove(role);
}

/** Outcomes are recordable while In Progress or Completed (ADR 0012 decision 2). */
export function canRecordOutcome(status: ExecutionStatus, role: ProjectRole | null): boolean {
  return isContributorOrAbove(role) && (status === 'InProgress' || status === 'Completed');
}

/** A Draft's runs can be reordered, removed and added (PRD §6.3.4, ADR 0021), by Contributors and Admins. */
export function canEditDraftRuns(status: ExecutionStatus, role: ProjectRole | null): boolean {
  return isContributorOrAbove(role) && status === 'Draft';
}
