import type { ProjectRole } from '../common/project-role';

/**
 * The execution state machine (PRD §6.3.4, ADR 0005, ADR 0012) as data. Every
 * user-triggered transition is listed here; the controller turns each into one
 * conditional UPDATE guarded on `from`. InProgress → Completed is not here — it is
 * never requested, only caused by the last run outcome (see completesExecution).
 */
export type ExecutionStatus = 'Draft' | 'Ready' | 'InProgress' | 'Paused' | 'Completed' | 'Done' | 'Canceled';

export type RunOutcome = 'Pending' | 'Pass' | 'Fail' | 'NeedsReview';

export type LifecycleAction = 'markReady' | 'backToDraft' | 'runAll' | 'pause' | 'resume' | 'signOff' | 'cancel';

export interface Transition {
  /** The statuses this action may start from; any other is refused with 409. */
  from: ExecutionStatus[];
  to: ExecutionStatus;
  minRole: ProjectRole;
  /** Activity log action code (ADR 0007), recorded in the same transaction. */
  actionCode: string;
}

export const TRANSITIONS: Record<LifecycleAction, Transition> = {
  markReady: { from: ['Draft'], to: 'Ready', minRole: 'Contributor', actionCode: 'test_execution.marked_ready' },
  backToDraft: { from: ['Ready'], to: 'Draft', minRole: 'Contributor', actionCode: 'test_execution.returned_to_draft' },
  runAll: { from: ['Ready'], to: 'InProgress', minRole: 'Contributor', actionCode: 'test_execution.started' },
  pause: { from: ['InProgress'], to: 'Paused', minRole: 'Contributor', actionCode: 'test_execution.paused' },
  resume: { from: ['Paused'], to: 'InProgress', minRole: 'Contributor', actionCode: 'test_execution.resumed' },
  signOff: { from: ['Completed'], to: 'Done', minRole: 'Admin', actionCode: 'test_execution.signed_off' },
  // ADR 0019: Contributors may cancel; Pending runs stay Pending and outcomes lock.
  cancel: { from: ['InProgress', 'Paused'], to: 'Canceled', minRole: 'Contributor', actionCode: 'test_execution.canceled' },
};

/**
 * Restart (ADR 0020) is not in TRANSITIONS: it has several source statuses with
 * different role rules and more than one statement, so it has its own handler.
 */
export const RESTARTABLE_STATUSES: ExecutionStatus[] = ['Completed', 'Done', 'Canceled'];

/** Restarting a signed-off (Done) execution undoes the sign-off, so it needs an Admin. */
export function restartMinRole(status: ExecutionStatus): ProjectRole {
  return status === 'Done' ? 'Admin' : 'Contributor';
}

/** Outcomes a person may record (ADR 0012: never back to Pending). */
export const RECORDABLE_OUTCOMES: RunOutcome[] = ['Pass', 'Fail', 'NeedsReview'];

/** Execution statuses in which a run outcome may be recorded (ADR 0012 decision 2). */
export const OUTCOME_EDITABLE_STATUSES: ExecutionStatus[] = ['InProgress', 'Completed'];

/** "Active" for the test-case delete guard (ADR 0012 decision 4). */
export const ACTIVE_STATUSES: ExecutionStatus[] = ['Ready', 'InProgress', 'Paused'];

export function canTransition(action: LifecycleAction, current: ExecutionStatus): boolean {
  return TRANSITIONS[action].from.includes(current);
}

/** True when recording an outcome should move the execution to Completed. */
export function completesExecution(status: ExecutionStatus, pendingRunsRemaining: number): boolean {
  return status === 'InProgress' && pendingRunsRemaining === 0;
}

/**
 * Elapsed time excluding Paused periods: finished InProgress periods, plus the current
 * one while `lastResumedAt` is set. Mirrors what the browser computes (ADR 0005).
 */
export function elapsedMs(accumulatedMs: number, lastResumedAt: Date | null, now: Date): number {
  if (lastResumedAt === null) {
    return accumulatedMs;
  }
  return accumulatedMs + Math.max(0, now.getTime() - lastResumedAt.getTime());
}
