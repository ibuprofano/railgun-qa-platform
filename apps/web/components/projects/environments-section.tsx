'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Server, Trash2 } from 'lucide-react';
import { useApiClient } from '../../lib/api-client';
import { environmentKeys } from '../../lib/environment-keys';
import { listEnvironments, type Environment } from '../../lib/environments-api';
import { EmptyState, ErrorState } from '../states';
import { DeleteEnvironmentDialog } from './delete-environment-dialog';
import { EnvironmentDialog } from './environment-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Which dialog is open: the editor (null environment adds one) or the delete confirmation. */
export type EnvironmentDialogState = { type: 'edit'; environment: Environment | null } | { type: 'delete'; environment: Environment } | null;

/**
 * Project Settings › Environments (PRD §6.7, specs/project-settings-screen): the project's
 * environments, oldest first as the New Execution picker lists them, with Add, Edit and
 * Delete. The screen is already Admin-only.
 */
export function EnvironmentsSection({ projectId }: { projectId: string }) {
  const apiClient = useApiClient();
  const [dialog, setDialog] = useState<EnvironmentDialogState>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: environmentKeys.list(projectId),
    queryFn: () => listEnvironments(apiClient, projectId),
  });

  const add = (
    <Button type="button" size="sm" onClick={() => setDialog({ type: 'edit', environment: null })}>
      <Plus className="size-4" />
      Add environment
    </Button>
  );

  return (
    <Card className="max-w-4xl" aria-label="Environments">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle>Environments</CardTitle>
        {data && data.length > 0 && add}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-20 w-full" aria-label="Loading environments" />
        ) : isError || !data ? (
          <ErrorState message="The environments could not be loaded." onRetry={() => void refetch()} />
        ) : data.length === 0 ? (
          <EmptyState icon={Server} title="No environments yet" description="Add the application under test's address and the accounts testers sign in with." action={add} />
        ) : (
          <div className="overflow-x-auto">
            <table aria-label="Environments" className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">Name</th>
                  <th className="py-1.5 pr-3 font-medium">Base URL</th>
                  <th className="py-1.5 pr-3 font-medium">Default browser</th>
                  <th className="py-1.5 pr-3 font-medium">Credentials</th>
                  <th className="py-1.5 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((environment) => (
                  <tr key={environment.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">{environment.name}</td>
                    <td className="py-2 pr-3 break-all text-muted-foreground">{environment.baseUrl}</td>
                    <td className="py-2 pr-3">{environment.defaultBrowser}</td>
                    <td className="py-2 pr-3 tabular-nums">{environment.credentials.length}</td>
                    <td className="py-2">
                      <span className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Edit ${environment.name}`}
                          onClick={() => setDialog({ type: 'edit', environment })}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Delete ${environment.name}`}
                          onClick={() => setDialog({ type: 'delete', environment })}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      <EnvironmentDialog
        projectId={projectId}
        environment={dialog?.type === 'edit' ? dialog.environment : null}
        open={dialog?.type === 'edit'}
        onOpenChange={(open) => !open && setDialog(null)}
      />
      <DeleteEnvironmentDialog
        projectId={projectId}
        environment={dialog?.type === 'delete' ? dialog.environment : null}
        onClose={() => setDialog(null)}
      />
    </Card>
  );
}
