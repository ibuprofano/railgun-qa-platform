# Design

## Context

See proposal.md, Why. The relevant code:

- **API (`apps/api/src/environments/environments.controller.ts`, unchanged):**
  - `POST /projects/:projectId/environments` (Admin) takes `{ name, baseUrl, defaultBrowser, credentials?: { alias, email, password }[] }`.
  - `PATCH …/:environmentId` (Admin) takes any of the same fields. Its `credentials` array is the full new list, reconciled against the stored one:
    - an item with an `id` updates that credential, and its `password` is optional (absent keeps the stored one)
    - an item without an `id` is created and needs a password
    - stored credentials left out are deleted
  - `DELETE …/:environmentId` (Admin) answers 204 and is permanent. Executions keep `environment_name` (migration 0008).
  - `GET` (Viewer) lists environments oldest first, never with passwords.
  - `POST …/credentials/:credentialId/reveal` (Contributor+) is audited and rate-limited (HTTP 429).
  - Validation is non-empty strings, a known browser, and unique aliases. There is no URL or email format check and no unique name.
- **Web:**
  - `lib/environments-api.ts` has `listEnvironments`, `getEnvironment` and `revealCredential` only.
  - The New Execution dialog queries `['projects', id, 'environments']`, and the environment panel queries `['projects', id, 'environments', environmentId]`, both written inline.
  - `ProjectSettingsScreen` renders General in a `Card`, behind `role !== 'Admin'` → `AccessDenied`. Workspace Owners arrive as the effective role `Admin`.
  - Forms use `FormDialog` (which shows `ActionError` for the server's reason) with react-hook-form and zod, as in `bug-form-dialog.tsx`. Confirmations are plain `Dialog`s, as in `tree-dialogs.tsx`.

## Goals / Non-Goals

**Goals:**
- An Admin can manage environments and credentials entirely from the web, through the existing API.
- A password is never put in the TanStack Query cache, never logged, and never kept after the editor closes.

**Non-Goals:**
- API changes, such as server-side URL or email checks or unique environment names. The client checks the formats. A unique name stays undecided, since the API and PRD don't require one.
- Execution Defaults, the New Project step, live updates (proposal.md, Out of scope).

## Decisions

### 1. Where it lives
- `ProjectSettingsScreen` renders `<EnvironmentsSection projectId={projectId} />` in a second `Card` under General. The page header's description is unchanged.
- The section lives in `components/projects/environments-section.tsx`, with the editor in `environment-dialog.tsx` and the confirmation in `delete-environment-dialog.tsx`.

### 2. API client and keys
`lib/environments-api.ts` gains:

```ts
export const environmentKeys = {
  list: (projectId) => ['projects', projectId, 'environments'] as const,
  detail: (projectId, id) => ['projects', projectId, 'environments', id] as const,
};
createEnvironment(client, projectId, body: EnvironmentInput): Promise<Environment>
updateEnvironment(client, projectId, id, body: EnvironmentUpdate): Promise<Environment>
deleteEnvironment(client, projectId, id): Promise<void>
```

- `EnvironmentInput` is `{ name, baseUrl, defaultBrowser, credentials: { alias, email, password }[] }`.
- In `EnvironmentUpdate`, credentials are `{ id?, alias, email, password? }`.
- `environmentKeys` lives in `lib/environment-keys.ts`, re-exported from `environments-api.ts`. Several existing tests mock `environments-api` with a factory that doesn't return it, and components importing it from its own module keep working under those mocks.
- `execution-form-dialog.tsx` and `environment-panel.tsx` switch to `environmentKeys`. The key values are unchanged, so their tests need no change.

After any create, update or delete, the section invalidates `environmentKeys.list(projectId)`. Without `exact`, that is a prefix, so every detail query refreshes too: the picker and the panel see the change (spec: "reach the rest of the app").

### 3. The section
- **Loading:** a skeleton. **Error:** `ErrorState` with retry.
- **Empty:** "No environments yet" with Add environment.
- **Rows:** a table with Name, Base URL, Default browser, Credentials (count), and an actions cell with Edit and Delete buttons, each labelled with the environment's name for accessibility. Rows keep the API's order (oldest first).

### 4. The editor (`EnvironmentDialog`)
Props: `projectId`, `environment: Environment | null` (null adds), `open`, `onOpenChange`.

- **Form schema (zod):**
  - `name`: trimmed, non-empty
  - `baseUrl`: trimmed, `/^https?:\/\/\S+$/i` ("Base URL must start with http:// or https://")
  - `defaultBrowser`: one of the three browsers, default `Chromium`
  - `credentials`: an array of `{ id?: string; alias; email; password }`:
    - `alias` is trimmed and non-empty
    - `email` passes `z.email()`
    - `password` is a string, required (non-empty) when `id` is absent
    - a `superRefine` marks every alias that repeats (case-sensitive, as the API's check) with "Alias already used in this environment"
- **Rows:** credential rows come from `useFieldArray`. Each shows alias, email, password (`type="password"`) and a Remove button. **Add credential** appends an empty row.
  - For an existing credential, the password field is empty with the placeholder "Unchanged — type to replace".
  - The empty-state line reads "No credentials. Add one if testers need to sign in."
- **Saving:**
  - **Add:** `createEnvironment` with every row's password.
  - **Edit:** `updateEnvironment` with the name, URL, browser and the full credentials list. Existing rows send their `id` and send `password` only when it was filled in, so a blank keeps the stored one. Removed rows are simply absent, and the API deletes them.
  - On success: `notifySuccess('Environment saved')`, invalidate the list key (decision 2), and close.
  - On failure, `FormDialog`'s `error` shows the server's message and the values stay.
- **Reveal:**
  - For rows with an `id`, a **Reveal password** button calls `revealCredential` through a `useMutation` that writes nothing to the cache. The result lands in local state `revealed: Record<credentialId, string>` and shows as read-only text under the row.
  - Errors, including 429, show through `ActionError`.
  - The Admin is the only caller here (the screen is Admin-only), and the API allows Contributor+.
- **Forgetting:** on close, `reset()` the form and clear `revealed`. Re-opening for the same environment starts from `environment`'s fields again, with empty passwords. The dialog is keyed by environment id and open state, so React state never survives between openings.

**Why one PATCH with the full list** rather than per-credential calls: the API was designed for one modal (environment-credentials design), and one request means one activity entry ("admin changed, buyer removed"), as the spec for that capability describes.

### 5. Delete (`DeleteEnvironmentDialog`)
- A `Dialog` titled `Delete “Staging”?`, with the text: "The environment and its credentials are removed permanently. Executions that used it keep its name."
- Buttons: Cancel, and a destructive Delete, disabled while pending.
- On success: notify, invalidate, close. On failure: `ActionError` in the dialog.

### 6. Tests (Vitest + React Testing Library)
- **`environments-section.test.tsx`:** the list, the empty state, delete with confirm and with cancel, and invalidation reaching a detail key.
- **`environment-dialog.test.tsx`:**
  - add with one credential (the request body)
  - add with none
  - the URL check, the repeated alias, a server 400 kept in the dialog
  - edit sending `id` and no `password` for an untouched row, a replaced password and a removed row
  - reveal showing the password and forgetting it after close
- **`project-settings-screen.test.tsx`:** the section appears for an Admin, and is absent from the access-denied state.

The API's own e2e tests already cover the endpoints, so no API tests are added.

## Risks / Trade-offs

- **[Client-only format checks]** → a direct API call can still store `staging` as a base URL. Acceptable: the PRD sets no format, and the API stays permissive. If this matters later, add the same checks server-side.
- **[Concurrent edits (G5, still open)]** → two Admins editing the same environment: the second save's full credential list wins, and may delete a credential the first just added. This matches every other edit in the app today (last write wins); G5 is unchanged.
- **[Duplicate environment names]** → allowed by the API and therefore by the editor. The picker shows names only, so two "Staging"s would be ambiguous. Recorded, not decided here.
- **[Revealed password on screen]** → it is shown until the dialog closes (C2's re-masking is still open). This is the same behaviour as the execution's environment panel.

## Migration Plan

Web-only: deploy the web app. Rollback is redeploying the previous web build. No data changes.
