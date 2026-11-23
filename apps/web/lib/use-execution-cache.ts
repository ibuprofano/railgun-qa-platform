'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { executionKeys, type Execution } from './executions-api';

/**
 * Every execution mutation returns the full execution, so the user's own change is
 * written straight into the detail cache (shows instantly, no refetch) and the list —
 * whose counts and order may have changed — is invalidated. Queries nested under the
 * detail key (its history, run attempts) are refetched too, so they don't depend on the
 * live stream's echo of the user's own change (design.md decision 6).
 */
export function useApplyExecution(projectId: string): (execution: Execution) => void {
  const queryClient = useQueryClient();
  return useCallback(
    (execution: Execution) => {
      const detailKey = executionKeys.detail(projectId, execution.id);
      queryClient.setQueryData(detailKey, execution);
      queryClient.invalidateQueries({ queryKey: executionKeys.list(projectId), exact: true });
      queryClient.invalidateQueries({ queryKey: detailKey, predicate: (query) => query.queryKey.length > detailKey.length });
    },
    [queryClient, projectId],
  );
}
