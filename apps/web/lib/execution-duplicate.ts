import type { Execution } from './executions-api';

export interface NotCarriedOver {
  runId: string;
  name: string;
  reason: string;
}

export interface DuplicateSelection {
  /** Test cases to pre-select, in the source's run order. */
  testCaseIds: string[];
  /** Runs whose test case can't go into a new Draft, with why (ADR 0012 decision 5). */
  notCarriedOver: NotCarriedOver[];
}

/**
 * Try Again → Duplicate (ADR 0020 decision 7): every run whose test case still exists and
 * is Ready is selected; the rest are listed as not carried over. A missing status (older
 * response) counts as Ready, and the create endpoint still has the final say.
 */
export function duplicateSelection(source: Execution): DuplicateSelection {
  const testCaseIds: string[] = [];
  const notCarriedOver: NotCarriedOver[] = [];
  for (const run of [...(source.runs ?? [])].sort((a, b) => a.position - b.position)) {
    const name = run.testCaseName ?? 'Unknown test case';
    if (run.testCaseDeleted || run.testCaseId === null) {
      notCarriedOver.push({ runId: run.id, name, reason: 'deleted' });
    } else if (run.testCaseStatus && run.testCaseStatus !== 'Ready') {
      notCarriedOver.push({ runId: run.id, name, reason: `no longer Ready (${run.testCaseStatus})` });
    } else {
      testCaseIds.push(run.testCaseId);
    }
  }
  return { testCaseIds, notCarriedOver };
}

/** The name a duplicate starts with. */
export const duplicateName = (source: Pick<Execution, 'name'>): string => `${source.name} (retry)`;
