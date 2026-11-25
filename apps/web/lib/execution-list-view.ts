import { EXECUTION_STATUSES } from '@railgun-qa/reporting';
import type { Execution } from './executions-api';

/** The list filter lives in the shared package, so the dashboard and its PDF scope the same way. */
export { filterExecutions, type ExecutionFilters } from '@railgun-qa/reporting';

export type ExecutionSortKey = 'updatedAt' | 'createdAt' | 'status';
export type SortDirection = 'asc' | 'desc';

/** Client-side sort over the list the API returns (PRD §6.3.2), in lifecycle order for status. Returns a new array. */
export function sortExecutions(list: Execution[], key: ExecutionSortKey, direction: SortDirection): Execution[] {
  const compare = (a: Execution, b: Execution): number => {
    if (key === 'status') {
      return EXECUTION_STATUSES.indexOf(a.status) - EXECUTION_STATUSES.indexOf(b.status);
    }
    return Date.parse(a[key]) - Date.parse(b[key]);
  };
  const sign = direction === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => sign * compare(a, b));
}
