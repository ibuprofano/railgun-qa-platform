# Tasks

## 1. Docs

- [x] 1.1 In `docs/roadmap-full.md`, under Phase 5, add a **Project Settings › Environments 🚧** entry pointing at the OpenSpec change `project-settings-environments`, with the scope and out-of-scope list from proposal.md, and remove "Environments … on Project Settings" from Phase 4 Slice 3's deferred list in favour of a pointer to it. Verify that it reads correctly.

## 2. API client

- [x] 2.1 In `apps/web/lib/environments-api.ts`, add `environmentKeys`, `EnvironmentInput`, `EnvironmentUpdate`, `createEnvironment`, `updateEnvironment` and `deleteEnvironment` (design.md decision 2). Switch `execution-form-dialog.tsx` and `environment-panel.tsx` to `environmentKeys`. Verify that the web typecheck passes and that the existing execution tests pass unchanged.

## 3. Environments section

- [x] 3.1 Add `components/projects/environments-section.tsx` (design.md decision 3) and render it under General in `ProjectSettingsScreen` (decision 1). Add `environments-section.test.tsx`:
  - two environments listed oldest first, with base URL, browser and credential count
  - the empty state with Add environment
  - a load error with retry

  Extend `project-settings-screen.test.tsx`: the section is shown to an Admin and absent from the access-denied state. Verify the tests pass.
- [x] 3.2 Add `components/projects/delete-environment-dialog.tsx` (design.md decision 5), opened from a row's Delete. Extend `environments-section.test.tsx`:
  - confirming calls `deleteEnvironment`, the row disappears after refetch, and a cached detail query for that environment is invalidated
  - cancelling calls nothing
  - the dialog text names the environment and says executions keep its name

  Verify the tests pass.

## 4. Environment editor

- [x] 4.1 Add `components/projects/environment-dialog.tsx` for adding (design.md decision 4: schema, credential rows, save, forgetting on close), opened from Add environment. Add `environment-dialog.test.tsx` for the add path:
  - "Staging", `https://staging.shop.test`, Firefox and credential "admin" sends that body and closes
  - no credentials sends `credentials: []`
  - `staging.shop.test` shows the URL message and sends nothing
  - two "admin" aliases are marked and nothing is sent
  - a bad email is marked
  - a server 400 shows its message and keeps the values

  Verify the tests pass.
- [x] 4.2 Add the edit path, opened from a row's Edit:
  - prefilled fields
  - masked, empty passwords for existing credentials
  - the full credentials list with `id`, and `password` only when typed

  Extend the tests:
  - changing only the base URL sends each credential with its `id` and no `password`
  - typing a new password for "admin" and removing "buyer" sends "admin" with the new password and leaves "buyer" out
  - a new row without a password is marked, while an existing one isn't

  Verify the tests pass.
- [x] 4.3 Add Reveal password for existing credentials (design.md decision 4, Reveal). Extend the tests:
  - Reveal password calls `revealCredential` and shows the password next to its row
  - after closing and reopening, the password is masked again and `revealCredential` is not called again
  - a 429 shows the rate-limit message

  Verify the tests pass.

## 5. Integration

- [x] 5.1 From the repository root, run `npm run lint`, `npm run typecheck` and `npm run test -w apps/web`, and verify that all pass.
- [x] 5.2 Manual run (`npm run dev`, seeded project, as an Admin):
  1. In Project Settings, add "QA" with two credentials.
  2. Edit it: change the base URL, replace one password, remove the other credential, and reveal the remaining password.
  3. Check that the Activity feed shows the creation, the edit and the reveal under Environments, with no password.
  4. Open New Execution and check that "QA" is offered.
  5. Run an execution on "QA", delete "QA" in Project Settings, and check that the execution still shows its name.

  Record the outcome in the roadmap entry.

## Workflow follow-up

- Archive the change after review. Update the roadmap entry to ✅, with what was built, key decisions and anything deferred.
