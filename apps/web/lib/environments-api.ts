import type { ApiClient } from './api-client';
import type { Browser } from './executions-api';

export interface EnvironmentCredential {
  id: string;
  alias: string;
  email: string;
}

export interface Environment {
  id: string;
  name: string;
  baseUrl: string;
  defaultBrowser: Browser;
  credentials: EnvironmentCredential[];
}

const base = (projectId: string) => `/projects/${projectId}/environments`;

export function listEnvironments(client: ApiClient, projectId: string): Promise<Environment[]> {
  return client.request(base(projectId));
}

export function getEnvironment(client: ApiClient, projectId: string, environmentId: string): Promise<Environment> {
  return client.request(`${base(projectId)}/${environmentId}`);
}

/** Audited, rate-limited reveal (environment-credentials spec). Never cache the result. */
export function revealCredential(
  client: ApiClient,
  projectId: string,
  environmentId: string,
  credentialId: string,
): Promise<{ password: string }> {
  return client.request(`${base(projectId)}/${environmentId}/credentials/${credentialId}/reveal`, { method: 'POST' });
}

// Query keys live in their own module so tests that mock this one keep them (project-settings-environments).
export { environmentKeys } from './environment-keys';

/** A new environment, as POST takes it; every credential needs a password. */
export interface EnvironmentInput {
  name: string;
  baseUrl: string;
  defaultBrowser: Browser;
  credentials: { alias: string; email: string; password: string }[];
}

/**
 * An edit, as PATCH takes it. `credentials` is the full new list: an item with an `id`
 * keeps that credential (and its password, when `password` is absent), one without is
 * created, and stored credentials left out are deleted.
 */
export interface EnvironmentUpdate {
  name: string;
  baseUrl: string;
  defaultBrowser: Browser;
  credentials: { id?: string; alias: string; email: string; password?: string }[];
}

export function createEnvironment(client: ApiClient, projectId: string, body: EnvironmentInput): Promise<Environment> {
  return client.request(base(projectId), { method: 'POST', body: JSON.stringify(body) });
}

export function updateEnvironment(client: ApiClient, projectId: string, environmentId: string, body: EnvironmentUpdate): Promise<Environment> {
  return client.request(`${base(projectId)}/${environmentId}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function deleteEnvironment(client: ApiClient, projectId: string, environmentId: string): Promise<void> {
  return client.request(`${base(projectId)}/${environmentId}`, { method: 'DELETE' });
}
