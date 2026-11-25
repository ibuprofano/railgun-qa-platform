# Proposal

## Why

PRD §6.7 gives Project Settings an **Environments** section, where a Project Admin lists, adds, edits and deletes environments and their credentials. The API for all of it was built in MVP Phase 5 (`environment-credentials`): create, update and delete, encrypted passwords, an audited reveal and activity entries.

The web app has no way to use it. Phase 4 Slice 3 deferred "Environments and Execution Defaults on Project Settings", and no later phase picked it up. Today an environment exists only through the demo seed or a direct API call. So a real user can't set up the environment that PRD §7's journey ("create a test case → set up an environment → run an execution") depends on, even though the New Execution dialog and the execution's environment panel already read environments.

## What Changes

- **Project Settings gets an Environments section** below General, for Project Admins (the screen is already Admin-only). It lists each environment's name, base URL, default browser and credential count, with **Add environment**, and Edit and Delete per row. With none, it says so and offers Add environment.
- **An environment editor dialog** for adding and editing:
  - name, base URL and default browser
  - credentials, each with alias, email and password: add rows and remove rows
  - an existing credential's password shows masked; leaving it blank keeps it, and typing replaces it
  - Admins can reveal an existing password in the editor, through the existing audited reveal
  - errors are shown inline: required fields, a malformed URL or email, aliases repeated within the environment, and refusals from the API
- **Deleting** asks for confirmation. It warns that the environment and its credentials are removed for good, and that executions that used it keep its name.
- **Everywhere environments are read is refreshed after a change:** the New Execution dialog's picker and the execution's environment panel.
- **Passwords stay out of the cache:** typed and revealed passwords live only in the open dialog and are dropped when it closes.
- **Web API client:** `createEnvironment`, `updateEnvironment`, `deleteEnvironment` and shared query keys.
- **Docs:** a roadmap entry.

No API, database or job changes.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `project-settings-screen`: gains the Environments section (list, editor, reveal in the editor, delete).

The `environment-credentials` requirements are unchanged: this change is their first web client.

## Impact

- **Web:**
  - `components/projects/project-settings-screen.tsx` adds the section
  - new `components/projects/environments-section.tsx`, `environment-dialog.tsx` and `delete-environment-dialog.tsx`, with tests
  - `lib/environments-api.ts` gains the write calls and `environmentKeys`, which `execution-form-dialog.tsx` and `environment-panel.tsx` adopt
- **API, DB, worker:** none.
- **Out of scope:**
  - Execution Defaults (headless toggle, timeout, screenshot policy)
  - the optional add-an-environment step in New Project (PRD §7.5 step 4)
  - live updates for environments
  - C2 (re-masking after a reveal) beyond dropping it when the dialog closes
