'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../lib/api-client';
import { attemptOf, executionKeys, listRunAttempts, type Execution, type Run } from '../../lib/executions-api';
import { OutcomeBadge } from './status-badge';

export interface RunAttemptsProps {
  projectId: string;
  execution: Execution;
  run: Run;
}

/**
 * The run panel's earlier results (PRD §6.3.3 "attempt history", ADR 0020), newest
 * first. Nothing to show, and nothing fetched, until the execution has been restarted.
 */
export function RunAttempts({ projectId, execution, run }: RunAttemptsProps) {
  const apiClient = useApiClient();
  const restarted = attemptOf(execution) > 1;

  const { data: attempts = [], isLoading } = useQuery({
    queryKey: executionKeys.runAttempts(projectId, execution.id, run.id),
    queryFn: () => listRunAttempts(apiClient, projectId, execution.id, run.id),
    enabled: restarted,
  });

  if (!restarted) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2" aria-label="Earlier attempts">
      <span className="text-sm font-medium">Earlier attempts</span>
      {isLoading ? null : attempts.length === 0 ? (
        <p className="text-sm text-muted-foreground">This run has no earlier results.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {attempts.map((attempt) => (
            <li key={attempt.attempt} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-20 shrink-0 text-muted-foreground">Attempt {attempt.attempt}</span>
              <OutcomeBadge outcome={attempt.outcome} />
              {attempt.outcomeUpdatedAt && (
                <span className="text-muted-foreground">
                  by {attempt.outcomeUpdatedByName ?? 'Unknown user'}, {new Date(attempt.outcomeUpdatedAt).toLocaleString()}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
