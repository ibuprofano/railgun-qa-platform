import { describe, expect, it } from 'vitest';
import { canCreateExecution, canRecordOutcome, canRestart, executionActionsFor } from './execution-permissions';
import type { ExecutionStatus } from './executions-api';
import type { ProjectRole } from './test-case-permissions';

const STATUSES: ExecutionStatus[] = ['Draft', 'Ready', 'InProgress', 'Paused', 'Completed', 'Done', 'Canceled'];

const EXPECTED: Record<ProjectRole, Record<ExecutionStatus, string[]>> = {
  Viewer: { Draft: [], Ready: [], InProgress: [], Paused: [], Completed: [], Done: [], Canceled: [] },
  Contributor: {
    Draft: ['edit', 'markReady'],
    Ready: ['backToDraft', 'runAll'],
    InProgress: ['pause', 'cancel'],
    Paused: ['resume', 'cancel'],
    Completed: ['tryAgain'],
    Done: ['tryAgain'],
    Canceled: ['tryAgain'],
  },
  Admin: {
    Draft: ['edit', 'markReady', 'delete'],
    Ready: ['backToDraft', 'runAll'],
    InProgress: ['pause', 'cancel'],
    Paused: ['resume', 'cancel'],
    Completed: ['signOff', 'tryAgain'],
    Done: ['tryAgain'],
    Canceled: ['tryAgain'],
  },
};

describe('executionActionsFor', () => {
  for (const role of Object.keys(EXPECTED) as ProjectRole[]) {
    it.each(STATUSES)(`${role} on %s`, (status) => {
      expect(executionActionsFor(status, role)).toEqual(EXPECTED[role][status]);
    });
  }

  it('offers nothing without a role', () => {
    expect(executionActionsFor('Draft', null)).toEqual([]);
  });
});

describe('canRestart', () => {
  it('lets a Contributor restart Completed or Canceled, but not Done', () => {
    expect(STATUSES.filter((status) => canRestart(status, 'Contributor'))).toEqual(['Completed', 'Canceled']);
  });

  it('lets an Admin restart Completed, Done or Canceled', () => {
    expect(STATUSES.filter((status) => canRestart(status, 'Admin'))).toEqual(['Completed', 'Done', 'Canceled']);
  });

  it('never lets a Viewer restart', () => {
    expect(STATUSES.some((status) => canRestart(status, 'Viewer') || canRestart(status, null))).toBe(false);
  });
});

describe('canCreateExecution', () => {
  it('allows Contributors and Admins only', () => {
    expect([canCreateExecution('Viewer'), canCreateExecution('Contributor'), canCreateExecution('Admin')]).toEqual([
      false,
      true,
      true,
    ]);
  });
});

describe('canRecordOutcome', () => {
  it('allows Contributor+ only while In Progress or Completed', () => {
    const allowed = STATUSES.filter((status) => canRecordOutcome(status, 'Contributor'));
    expect(allowed).toEqual(['InProgress', 'Completed']);
  });

  it('never allows a Viewer', () => {
    expect(STATUSES.some((status) => canRecordOutcome(status, 'Viewer'))).toBe(false);
  });
});
