'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../lib/api-client';
import { bugKeys, linkBugToRun, listBugs, type Bug } from '../../lib/bugs-api';
import { attemptOf, type Execution, type Run } from '../../lib/executions-api';
import { canFileBugFromRun } from '../../lib/bug-permissions';
import type { ProjectRole } from '../../lib/test-case-permissions';
import { ActionError } from '../action-error';
import { BugStatusBadge, SeverityDot } from '../bugs/bug-badges';
import { BugFormDialog } from '../bugs/bug-form-dialog';
import { SELECTED_BUG_PARAM } from '../bugs/bugs-screen';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { notifySuccess } from '../../lib/notify';

/**
 * Bugs grouped by the attempt they were found in, current attempt first (ADR 0020). A
 * bug with no recorded attempt goes under the current one.
 */
export function groupBugsByAttempt(bugs: Bug[], currentAttempt: number): { attempt: number; bugs: Bug[] }[] {
  const groups = new Map<number, Bug[]>();
  for (const bug of bugs) {
    const attempt = bug.attempt ?? currentAttempt;
    groups.set(attempt, [...(groups.get(attempt) ?? []), bug]);
  }
  return [...groups.entries()].sort(([a], [b]) => b - a).map(([attempt, grouped]) => ({ attempt, bugs: grouped }));
}

export interface RunBugsProps {
  projectId: string;
  execution: Execution;
  run: Run;
  role: ProjectRole | null;
}

/**
 * The run panel's bug section (PRD §6.3.3): bugs linked to this run, plus File bug and
 * Link existing bug once the execution has started (ADR 0013 decision 3).
 */
export function RunBugs({ projectId, execution, run, role }: RunBugsProps) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [filing, setFiling] = useState(false);
  const [linking, setLinking] = useState(false);
  const canFile = canFileBugFromRun(execution.status, role);
  const currentAttempt = attemptOf(execution);

  const { data: linked = [] } = useQuery({
    queryKey: bugKeys.forRun(projectId, run.id),
    queryFn: () => listBugs(apiClient, projectId, run.id),
  });
  const { data: allBugs = [] } = useQuery({
    queryKey: bugKeys.list(projectId),
    queryFn: () => listBugs(apiClient, projectId),
    enabled: linking,
  });
  const unlinked = allBugs.filter((bug) => bug.run === null);

  const link = useMutation({
    mutationFn: (bugId: string) => linkBugToRun(apiClient, projectId, bugId, run.id),
    onSuccess: () => {
      notifySuccess('Bug linked to this run');
      queryClient.invalidateQueries({ queryKey: bugKeys.all(projectId) });
      setLinking(false);
    },
  });

  return (
    <section className="flex flex-col gap-2" aria-label="Linked bugs">
      <span className="text-sm font-medium">Bugs</span>
      {linked.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bugs linked to this run.</p>
      ) : currentAttempt === 1 ? (
        <BugList bugs={linked} />
      ) : (
        groupBugsByAttempt(linked, currentAttempt).map((group) => (
          <div key={group.attempt} className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              {group.attempt === currentAttempt ? `Current attempt (${group.attempt})` : `Attempt ${group.attempt}`}
            </span>
            <BugList bugs={group.bugs} label={`Bugs from attempt ${group.attempt}`} />
          </div>
        ))
      )}

      {canFile && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setFiling(true)}>
              File bug
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setLinking((open) => !open)}>
              Link existing bug
            </Button>
          </div>
          {linking &&
            (unlinked.length === 0 ? (
              <p className="text-sm text-muted-foreground">No unlinked bugs to link.</p>
            ) : (
              <Select onValueChange={(bugId) => link.mutate(bugId)}>
                <SelectTrigger aria-label="Bug to link" className="w-full">
                  <SelectValue placeholder="Choose a bug without a run" />
                </SelectTrigger>
                <SelectContent>
                  {unlinked.map((bug) => (
                    <SelectItem key={bug.id} value={bug.id}>
                      {bug.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}
          <ActionError error={link.error} />
        </div>
      )}

      <BugFormDialog projectId={projectId} open={filing} onOpenChange={setFiling} run={run} onSaved={() => {}} />
    </section>
  );
}

function BugList({ bugs, label }: { bugs: Bug[]; label?: string }) {
  return (
    <ul className="flex flex-col gap-1" aria-label={label}>
      {bugs.map((bug) => (
        <li key={bug.id} className="flex items-center justify-between gap-2 text-sm">
          <Link href={`/bugs?${SELECTED_BUG_PARAM}=${bug.id}`} className="truncate underline">
            {bug.title}
          </Link>
          <span className="flex shrink-0 items-center gap-2">
            <SeverityDot severity={bug.severity} />
            <BugStatusBadge status={bug.status} />
          </span>
        </li>
      ))}
    </ul>
  );
}
