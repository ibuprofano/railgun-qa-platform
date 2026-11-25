/**
 * Environment query keys (project-settings-environments design.md decision 2). Invalidating
 * `list` without `exact` also refreshes every detail key, so the New Execution picker and
 * the execution's environment panel both see a change made in Project Settings.
 */
export const environmentKeys = {
  list: (projectId: string) => ['projects', projectId, 'environments'] as const,
  detail: (projectId: string, environmentId: string) => ['projects', projectId, 'environments', environmentId] as const,
};
