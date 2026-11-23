'use client';

import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../lib/api-client';
import { addRun, executionKeys, getExecution, listExecutions, type Execution } from '../../lib/executions-api';
import { useApplyExecution } from '../../lib/use-execution-cache';
import { notifySuccess } from '../../lib/notify';
import { ActionError } from '../action-error';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface AddToExecutionDialogProps {
  projectId: string;
  testCase: { id: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (execution: Execution) => void;
}

/**
 * Run → Add to existing execution (PRD §6.2.3, ADR 0021 decision 4): Draft executions
 * only. The list has no runs, so each Draft's detail is read (shared with the Executions
 * screen's cache) to mark the ones that already hold the test case.
 */
export function AddToExecutionDialog({ projectId, testCase, open, onOpenChange, onAdded }: AddToExecutionDialogProps) {
  const apiClient = useApiClient();
  const applyExecution = useApplyExecution(projectId);

  const { data: executions = [], isLoading } = useQuery({
    queryKey: executionKeys.list(projectId),
    queryFn: () => listExecutions(apiClient, projectId),
    enabled: open,
  });
  const drafts = executions.filter((execution) => execution.status === 'Draft');
  const details = useQueries({
    queries: drafts.map((draft) => ({
      queryKey: executionKeys.detail(projectId, draft.id),
      queryFn: () => getExecution(apiClient, projectId, draft.id),
      enabled: open,
    })),
  });
  const holds = (draftId: string) =>
    details.some((query) => query.data?.id === draftId && query.data.runs?.some((run) => run.testCaseId === testCase.id));

  const add = useMutation({
    mutationFn: (executionId: string) => addRun(apiClient, projectId, executionId, testCase.id),
    onSuccess: (saved) => {
      notifySuccess(`Added to ${saved.name}`);
      applyExecution(saved);
      onOpenChange(false);
      onAdded(saved);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to an existing execution</DialogTitle>
          <DialogDescription>
            &ldquo;{testCase.name}&rdquo; is added as the last run of the Draft execution you choose.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading executions…</p>
        ) : drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            There are no Draft executions. Use Run → New execution to create one with this test case.
          </p>
        ) : (
          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto" aria-label="Draft executions">
            {drafts.map((draft) => {
              const already = holds(draft.id);
              return (
                <li key={draft.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-between"
                    disabled={already || add.isPending}
                    onClick={() => add.mutate(draft.id)}
                  >
                    <span className="truncate">{draft.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {already ? 'Already includes it' : `${draft.counts.total} run${draft.counts.total === 1 ? '' : 's'}`}
                    </span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <ActionError error={add.error} />
      </DialogContent>
    </Dialog>
  );
}
