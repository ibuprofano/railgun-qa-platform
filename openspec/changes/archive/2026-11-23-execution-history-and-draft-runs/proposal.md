# Proposal

## Why

Three Phase 7 parts of PRD.md are still missing:

- the execution's activity history panel (§6.3.3), which shares a component with the bug's (§6.4)
- removing individual runs from a Draft (§6.3.4)
- the Run dropdown's "add it to an existing execution" (§6.2.3)

Every change is already in the activity log, but nothing reads it back for a single item. Separately, environment and credential changes bypass the log, against ADR 0007's every-mutation rule. [ADR 0021](../../../docs/adr/0021-execution-history-and-draft-run-changes.md) settles what each panel shows and how runs enter and leave a Draft.

## What Changes

- **History reads:**
  - An execution's history (`GET …/executions/:id/activity`) lists:
    - the execution's own entries
    - outcome changes on its runs
    - every entry of the bugs currently linked to its runs
  - A bug's history (`GET …/bugs/:id/activity`) lists the bug's own entries.
  - Both are open to Viewers and above, newest first, 20 per page with a keyset cursor (`before`).
- **Removing a run from a Draft** (`DELETE …/executions/:id/runs/:runId`): Contributor+. Positions close up. Removing the last run is refused. The change is logged and emits `execution.changed`.
- **Adding a test case to a Draft** (`POST …/executions/:id/runs` with `{ testCaseId }`): Contributor+. The test case must be Ready and not already in the execution, and is appended last. The change is logged and emits `execution.changed`.
- **Environment logging:** environment create, edit and delete write activity entries in the same transaction. Edits name the changed fields and the credential aliases added, changed and removed, never passwords.
- **Web:**
  - a shared activity formatter that turns entries into sentences, with an `ActivityHistory` component that loads more on demand
  - a History section on the execution detail and on the bug detail
  - a remove button on Draft run rows, for Contributors and Admins
  - the test case's Run becomes a dropdown: "New execution" (today's behaviour) or "Add to existing execution…", a dialog listing the Draft executions, where executions that already hold the test case are disabled

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `activity-log`: per-item history reads (execution and bug), with their scope, access and pagination.
- `test-execution-authoring`: adding a run to, and removing a run from, a Draft, and logging both.
- `environment-credentials`: environment and credential changes are logged.
- `executions-screen`:
  - the History section
  - removing runs from a Draft
  - Run offering "New execution" and "Add to existing execution"
- `bugs-screen`: the History section on the bug detail.

## Impact

- **API:**
  - `src/common/activity-log-reader.ts` gains item-scoped readers.
  - New routes go in `executions.controller.ts` and `bugs.controller.ts`.
  - Logging calls are added in `environments.controller.ts`.
  - No migration.
- **Web:**
  - new `lib/activity-api.ts` and `lib/activity-format.ts`
  - new `components/activity/activity-history.tsx`
  - changes to `execution-detail.tsx`, `runs-table.tsx`, `bug-detail.tsx`, `test-case-detail.tsx` and `test-cases-screen.tsx`
  - `lib/executions-api.ts` gains `addRun` and `removeRun`
- **Out of scope:**
  - the project-wide Activity screen and the Overview's recent history (Phase 9)
  - live updates for the History sections beyond the existing `execution.changed` refetch
  - an index on activity `details` (ADR 0021 consequence)
  - the traceability graph
