'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, X } from 'lucide-react';
import { z } from 'zod';
import { useApiClient } from '../../lib/api-client';
import { environmentKeys } from '../../lib/environment-keys';
import { createEnvironment, revealCredential, updateEnvironment, type Environment } from '../../lib/environments-api';
import type { Browser } from '../../lib/executions-api';
import { notifySuccess } from '../../lib/notify';
import { ActionError } from '../action-error';
import { FormDialog } from '../form-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const BROWSERS: readonly Browser[] = ['Chromium', 'Firefox', 'WebKit'];

export const BASE_URL_MESSAGE = 'Base URL must start with http:// or https://';
export const DUPLICATE_ALIAS_MESSAGE = 'Alias already used in this environment';
export const UNCHANGED_PLACEHOLDER = 'Unchanged — type to replace';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  baseUrl: z.string().trim().regex(/^https?:\/\/\S+$/i, BASE_URL_MESSAGE),
  defaultBrowser: z.enum(['Chromium', 'Firefox', 'WebKit']),
  credentials: z
    .array(
      z
        .object({
          id: z.string().optional(),
          alias: z.string().trim().min(1, 'Alias is required'),
          email: z.string().trim().pipe(z.email('Enter a valid email')),
          password: z.string(),
        })
        // A stored credential keeps its password when left empty; a new one needs one.
        .refine((c) => c.id !== undefined || c.password.length > 0, { message: 'Password is required', path: ['password'] }),
    )
    // Aliases are unique within an environment, compared as the API compares them.
    .superRefine((credentials, ctx) => {
      const aliases = credentials.map((c) => c.alias.trim());
      aliases.forEach((alias, index) => {
        if (alias !== '' && aliases.indexOf(alias) !== aliases.lastIndexOf(alias)) {
          ctx.addIssue({ code: 'custom', message: DUPLICATE_ALIAS_MESSAGE, path: [index, 'alias'] });
        }
      });
    }),
});

type FormValues = z.infer<typeof schema>;

function defaultsFor(environment: Environment | null): FormValues {
  return {
    name: environment?.name ?? '',
    baseUrl: environment?.baseUrl ?? '',
    defaultBrowser: environment?.defaultBrowser ?? 'Chromium',
    // Stored passwords are never sent to the browser: an existing row starts empty.
    credentials: (environment?.credentials ?? []).map((c) => ({ id: c.id, alias: c.alias, email: c.email, password: '' })),
  };
}

export interface EnvironmentDialogProps {
  projectId: string;
  /** null adds a new environment. */
  environment: Environment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The environment editor (PRD §6.7; specs/project-settings-screen; project-settings-
 * environments design.md decision 4). Saving sends the whole credential list: existing
 * rows by id, with a password only when one was typed. Typed and revealed passwords live
 * only in this dialog and are dropped when it closes.
 */
export function EnvironmentDialog({ projectId, environment, open, onOpenChange }: EnvironmentDialogProps) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaultsFor(environment) });
  const { fields, append, remove } = useFieldArray({ control, name: 'credentials', keyName: 'key' });

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const base = { name: values.name.trim(), baseUrl: values.baseUrl.trim(), defaultBrowser: values.defaultBrowser };
      if (environment === null) {
        return createEnvironment(apiClient, projectId, {
          ...base,
          credentials: values.credentials.map((c) => ({ alias: c.alias.trim(), email: c.email.trim(), password: c.password })),
        });
      }
      return updateEnvironment(apiClient, projectId, environment.id, {
        ...base,
        credentials: values.credentials.map((c) => ({
          ...(c.id !== undefined ? { id: c.id } : {}),
          alias: c.alias.trim(),
          email: c.email.trim(),
          ...(c.password.length > 0 ? { password: c.password } : {}),
        })),
      });
    },
    onSuccess: async () => {
      notifySuccess('Environment saved');
      onOpenChange(false);
      // A prefix: the list, the New Execution picker and every environment panel.
      await queryClient.invalidateQueries({ queryKey: environmentKeys.list(projectId) });
    },
  });

  // Never cached: the result lives in `revealed` and goes when the dialog closes.
  const reveal = useMutation({
    mutationFn: (credentialId: string) => revealCredential(apiClient, projectId, environment!.id, credentialId),
    onSuccess: ({ password }, credentialId) => setRevealed((current) => ({ ...current, [credentialId]: password })),
  });

  // Re-seed on every open, and forget everything typed or revealed when it closes.
  useEffect(() => {
    reset(defaultsFor(open ? environment : null));
    setRevealed({});
    save.reset();
    reveal.reset();
    // Keyed on `open` and the environment only: the form is re-seeded when it opens.
  }, [open, environment]);

  const credentialErrors = errors.credentials;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={environment ? `Edit “${environment.name}”` : 'Add environment'}
      description="Where tests run, and the accounts testers sign in with."
      size="wide"
      submitLabel="Save"
      pending={save.isPending}
      error={save.error}
      onSubmit={handleSubmit((values) => save.mutate(values))}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="environment-name">Name</Label>
        <Input id="environment-name" aria-invalid={!!errors.name} {...register('name')} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="environment-base-url">Base URL</Label>
        <Input id="environment-base-url" placeholder="https://staging.example.com" aria-invalid={!!errors.baseUrl} {...register('baseUrl')} />
        {errors.baseUrl && <p className="text-sm text-destructive">{errors.baseUrl.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Default browser</Label>
        <Controller
          control={control}
          name="defaultBrowser"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger aria-label="Default browser" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BROWSERS.map((browser) => (
                  <SelectItem key={browser} value={browser}>
                    {browser}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Credentials</legend>
        {fields.length === 0 && <p className="text-sm text-muted-foreground">No credentials. Add one if testers need to sign in.</p>}
        {fields.map((field, index) => {
          const rowErrors = credentialErrors?.[index];
          const label = field.alias || `credential ${index + 1}`;
          const stored = field.id !== undefined;
          return (
            <div key={field.key} className="flex flex-col gap-2 rounded-md border p-3" aria-label={`Credential ${index + 1}`} role="group">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`credential-${index}-alias`}>Alias</Label>
                  <Input id={`credential-${index}-alias`} aria-invalid={!!rowErrors?.alias} {...register(`credentials.${index}.alias`)} />
                  {rowErrors?.alias && <p className="text-xs text-destructive">{rowErrors.alias.message}</p>}
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`credential-${index}-email`}>Email</Label>
                  <Input id={`credential-${index}-email`} type="email" aria-invalid={!!rowErrors?.email} {...register(`credentials.${index}.email`)} />
                  {rowErrors?.email && <p className="text-xs text-destructive">{rowErrors.email.message}</p>}
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`credential-${index}-password`}>Password</Label>
                  <Input
                    id={`credential-${index}-password`}
                    type="password"
                    autoComplete="new-password"
                    placeholder={stored ? UNCHANGED_PLACEHOLDER : undefined}
                    aria-invalid={!!rowErrors?.password}
                    {...register(`credentials.${index}.password`)}
                  />
                  {rowErrors?.password && <p className="text-xs text-destructive">{rowErrors.password.message}</p>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {stored &&
                  (revealed[field.id!] !== undefined ? (
                    <code className="rounded bg-muted px-2 py-1 text-sm" aria-label={`Password for ${label}`}>
                      {revealed[field.id!]}
                    </code>
                  ) : (
                    <Button type="button" size="sm" variant="outline" disabled={reveal.isPending} onClick={() => reveal.mutate(field.id!)}>
                      Reveal password
                    </Button>
                  ))}
                <Button type="button" size="sm" variant="ghost" className="ml-auto" aria-label={`Remove ${label}`} onClick={() => remove(index)}>
                  <X className="size-4" />
                  Remove
                </Button>
              </div>
            </div>
          );
        })}
        <ActionError error={reveal.error} />
        <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => append({ alias: '', email: '', password: '' })}>
          <Plus className="size-4" />
          Add credential
        </Button>
      </fieldset>
    </FormDialog>
  );
}
