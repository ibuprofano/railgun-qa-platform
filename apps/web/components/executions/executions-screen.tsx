'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSessionContext } from '../../lib/session-context';
import { PageHeader } from '../page-header';
import { canCreateExecution } from '../../lib/execution-permissions';
import type { Execution } from '../../lib/executions-api';
import type { ExecutionFilters } from '../../lib/execution-list-view';
import { ExecutionList } from './execution-list';
import { ExecutionDetail } from './execution-detail';
import { ExecutionFormDialog } from './execution-form-dialog';
import { ExecutionDashboard } from './execution-dashboard';

/** Query-string key holding the selected execution, so links and "Run" can open one. */
export const SELECTED_EXECUTION_PARAM = 'execution';
/** Query-string key holding the open run, so a dashboard row can open it in a new tab. */
export const SELECTED_RUN_PARAM = 'run';

/**
 * PRD §6.3.1 split layout: list on the left, the selected execution, or the dashboard
 * when none is selected, on the right. The screen keeps the list filters so the dashboard
 * covers exactly what the list shows (PRD §6.3.6). Uses useSearchParams, so the page
 * wraps it in <Suspense> (Next 16 docs).
 */
export function ExecutionsScreen() {
  const session = useSessionContext();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [creating, setCreating] = useState(false);
  // Try Again → Duplicate: the execution the New Execution form is pre-filled from.
  const [duplicateSource, setDuplicateSource] = useState<Execution | undefined>(undefined);
  const [filters, setFilters] = useState<ExecutionFilters>({});

  if (session.loading || !session.data) {
    return null;
  }

  const { projectId, role } = session.data;
  const selectedId = searchParams.get(SELECTED_EXECUTION_PARAM);
  const selectedRunId = searchParams.get(SELECTED_RUN_PARAM);
  const setParams = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };
  // Changing (or clearing) the execution always closes its run.
  const select = (id: string | null) => setParams({ [SELECTED_EXECUTION_PARAM]: id, [SELECTED_RUN_PARAM]: null });

  return (
    <>
      <PageHeader title="Executions" description="Plan, run and review batches of test cases." />
      <div className="grid h-[calc(100vh-10rem)] grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr]">
        <ExecutionList
          projectId={projectId}
          selectedId={selectedId}
          onSelect={select}
          canCreate={canCreateExecution(role)}
          onCreateClick={() => setCreating(true)}
          filters={filters}
          onFiltersChange={setFilters}
          dashboardShown={selectedId === null}
          onShowDashboard={() => select(null)}
        />
        <div className="min-h-0 overflow-y-auto">
          {selectedId ? (
            <ExecutionDetail
              key={selectedId}
              projectId={projectId}
              executionId={selectedId}
              role={role}
              onDeleted={() => select(null)}
              onDuplicate={(source) => {
                setDuplicateSource(source);
                setCreating(true);
              }}
              selectedRunId={selectedRunId}
              onSelectRun={(runId) => setParams({ [SELECTED_RUN_PARAM]: runId })}
            />
          ) : (
            <ExecutionDashboard projectId={projectId} filters={filters} onFiltersChange={setFilters} />
          )}
        </div>
        <ExecutionFormDialog
          projectId={projectId}
          open={creating}
          onOpenChange={(open) => {
            setCreating(open);
            if (!open) {
              setDuplicateSource(undefined);
            }
          }}
          source={duplicateSource}
          onSaved={(execution) => select(execution.id)}
        />
      </div>
    </>
  );
}
