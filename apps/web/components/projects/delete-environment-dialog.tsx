'use client';

import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../lib/api-client';
import { environmentKeys } from '../../lib/environment-keys';
import { deleteEnvironment, type Environment } from '../../lib/environments-api';
import { notifySuccess } from '../../lib/notify';
import { ActionError } from '../action-error';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export const DELETE_ENVIRONMENT_TEXT = 'The environment and its credentials are removed permanently. Executions that used it keep its name.';

/**
 * Deleting an environment (specs/project-settings-screen; project-settings-environments
 * design.md decision 5): permanent, with its credentials; executions keep the stored name.
 */
export function DeleteEnvironmentDialog({
  projectId,
  environment,
  onClose,
}: {
  projectId: string;
  environment: Environment | null;
  onClose: () => void;
}) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: (id: string) => deleteEnvironment(apiClient, projectId, id),
    onSuccess: async () => {
      notifySuccess('Environment deleted');
      onClose();
      // A prefix: the list, and every environment's detail (the execution panel).
      await queryClient.invalidateQueries({ queryKey: environmentKeys.list(projectId) });
    },
  });

  useEffect(() => {
    if (environment) remove.reset();
    // Reset only when the dialog opens for an environment.
  }, [environment]);

  return (
    <Dialog open={environment !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{environment?.name}”?</DialogTitle>
          <DialogDescription>{DELETE_ENVIRONMENT_TEXT}</DialogDescription>
        </DialogHeader>
        <ActionError error={remove.error} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={remove.isPending} onClick={() => environment && remove.mutate(environment.id)}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
