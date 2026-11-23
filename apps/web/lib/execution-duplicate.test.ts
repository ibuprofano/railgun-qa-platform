import { describe, expect, it } from 'vitest';
import { duplicateName, duplicateSelection } from './execution-duplicate';
import { makeExecutionWithRuns, makeRun } from '../test/execution-fixtures';

describe('duplicateSelection', () => {
  it('selects Ready test cases in run order and lists the rest with a reason', () => {
    const source = makeExecutionWithRuns([
      makeRun({ id: 'r3', position: 3, testCaseId: 'c', testCaseName: 'C', testCaseStatus: 'Ready' }),
      makeRun({ id: 'r1', position: 1, testCaseId: 'a', testCaseName: 'A', testCaseStatus: 'Ready' }),
      makeRun({ id: 'r2', position: 2, testCaseId: 'b', testCaseName: 'B', testCaseStatus: 'Deprecated' }),
      makeRun({ id: 'r4', position: 4, testCaseId: 'd', testCaseName: 'D', testCaseStatus: null, testCaseDeleted: true }),
    ]);

    expect(duplicateSelection(source)).toEqual({
      testCaseIds: ['a', 'c'],
      notCarriedOver: [
        { runId: 'r2', name: 'B', reason: 'no longer Ready (Deprecated)' },
        { runId: 'r4', name: 'D', reason: 'deleted' },
      ],
    });
  });

  it('treats a purged test case (no id) as deleted', () => {
    const source = makeExecutionWithRuns([makeRun({ id: 'r1', testCaseId: null, testCaseName: 'Gone', testCaseDeleted: true })]);

    expect(duplicateSelection(source).notCarriedOver).toEqual([{ runId: 'r1', name: 'Gone', reason: 'deleted' }]);
  });
});

describe('duplicateName', () => {
  it('appends "(retry)"', () => {
    expect(duplicateName({ name: 'Smoke' })).toBe('Smoke (retry)');
  });
});
