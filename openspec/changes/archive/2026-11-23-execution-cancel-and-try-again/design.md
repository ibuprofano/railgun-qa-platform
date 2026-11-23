# Design

## Context

See proposal.md, Why. The behavior is fixed by [ADR 0019](../../../docs/adr/0019-execution-cancel.md) and [ADR 0020](../../../docs/adr/0020-execution-try-again.md). The current codebase constrains the approach:

- **The state machine is data.** `execution-lifecycle.ts` maps each action to a single `from → to` with a minimum role. `ExecutionLifecycleController.transition` turns each action into one conditional `UPDATE … WHERE status = from`, with an optional SQL precondition. Every action uses one fixed role through `@RequireProjectRole`.
- **Outcome writes lock the execution row** (`SELECT … FOR UPDATE`) so the automatic completion is reliable (ADR 0012). `OUTCOME_EDITABLE_STATUSES` is `InProgress`, `Completed`.
- **Run snapshots.** Runs snapshot name and script at Run All with one `UPDATE … FROM test_case`. `loadExecution` falls back to the live test case when the snapshot is null.
- **Run positions.** `UNIQUE (execution_id, position)` is `DEFERRABLE INITIALLY DEFERRED`, and the run-move handler already renumbers 1..n in one statement.
- **Who set an outcome.** Runs store `outcome_updated_by` as a user id only. Under RLS a user can read only their own `user` row (ADR 0013 decision 6), which is why bugs and activity entries store display names.
- **Bugs.**
  - Bugs reference runs with `ON DELETE SET NULL (test_run_id)`.
  - Auto-create uses `ON CONFLICT (test_run_id) WHERE auto_created AND deleted_at IS NULL DO NOTHING`, matching `bug_one_auto_per_run_idx`.
  - Bugs are filed from runs in `bugs.controller.ts` (create and link) and auto-created in `bug-queries.ts`.
- **Trash purge.** The worker's `trash_purge` deletes executions and test cases. Runs are removed or unlinked by FK cascades, and referential actions bypass RLS and run as the table owner.
- **Web.**
  - `execution-permissions.ts` mirrors the transition table.
  - `LifecycleActions` renders buttons and dialogs.
  - `ExecutionFormDialog` has create mode (`initialTestCaseIds`, `defaultName`) and edit mode (`execution`).
  - The run panel lists bugs through `bugKeys.forRun`.
  - SSE `execution.changed` refetches the `executionKeys.detail` prefix.

## Goals / Non-Goals

**Goals:**
- Cancel and Restart are each one transaction, atomic with their activity entry and live event, and safe against concurrent outcome writes.
- Attempt history is complete: no run result is lost, even for dropped runs and purged test cases.
- Duplicate adds no new API surface beyond what the form needs to decide which test cases are eligible.

**Non-Goals:**
- Showing a dropped run's attempts anywhere in the UI. They are kept for the traceability graph and reports (Phases 7 and 10). No screen lists execution-level attempts yet.
- Recording which execution a duplicate came from. The create entry is an ordinary one; provenance can come with the traceability graph.
- Seeding restarted executions in the demo data.

## Decisions

### 1. Cancel goes in the transition table; `from` becomes a list
`Transition.from` becomes `ExecutionStatus[]`. Cancel is `{ from: ['InProgress', 'Paused'], to: 'Canceled', minRole: 'Contributor', actionCode: 'test_execution.canceled' }`, and its SQL is the existing `STOP_TIMER`. That fragment's `COALESCE` already adds 0 when `last_resumed_at` is null, as it is while Paused. The guarded `UPDATE` becomes `status = ANY(from)`. Single-source actions become one-element lists, and `canTransition` checks membership.
*Alternative:* two actions, `cancelRunning` and `cancelPaused`. Rejected: one user action would get two codes, two routes or a dispatcher, and two activity codes.

No change is needed to keep outcomes locked: `Canceled` is simply not in `OUTCOME_EDITABLE_STATUSES`.

### 2. Restart is its own handler, not a table entry
Restart has three source statuses, a role that depends on the source, and several statements. It doesn't fit "one conditional UPDATE". `POST …/executions/:id/restart` is guarded at `Contributor`, then runs in one `withTenantContext` transaction:

1. `SELECT … FOR UPDATE` the execution, which is the same lock outcome writes take, so a Restart and a concurrent outcome write serialize.
   - Missing → 404.
   - Status not in Completed, Done or Canceled → 409.
   - Done and the caller's role (from `request.auth.projectRole`, set by `ProjectRoleGuard`) is below Admin → 403.
2. Count the runs whose test case exists and isn't in the trash. If there are none → 409, with nothing written.
3. `INSERT INTO test_run_attempt … SELECT` from **every** run, with the execution's current `attempt`.
4. `DELETE` the runs whose test case is deleted or purged. Bugs linked to them are unlinked by the existing `SET NULL`, and their attempt rows by the new one.
5. Renumber the remaining positions 1..n, the same way the run-move handler does.
6. Reset the runs: `outcome = 'Pending'`, and the outcome author and time and both snapshots set to null.
7. Update the execution: `status = 'Ready'`, `attempt = attempt + 1`, elapsed time 0, and `last_resumed_at`, `started_at`, `completed_at`, `signed_off_at` and `signed_off_by` all null.
8. Write the activity entry `test_execution.restarted`, with `{ from, to: 'Ready', elapsedMs, attempt, droppedRuns }`, then emit `execution.changed`, and return `loadExecution`.

The order of checks (404, then 409 for status, then 403 for Done) keeps a Contributor's "wrong status" answer the same as for every other action.
*Alternative:* a second guard decorator per source status. Rejected: the guard runs before the status is known.

### 3. Attempt table belongs to the execution
Migration `0015_execution_attempts`:

- `test_execution.attempt integer NOT NULL DEFAULT 1 CHECK (attempt > 0)`.
- `test_run_attempt` with these columns:
  - `id`, `workspace_id`, `execution_id`
  - `test_run_id` (nullable), `test_case_id` (nullable)
  - `attempt`, `position`, `outcome`
  - `outcome_updated_at`, `outcome_updated_by_name`
  - `test_case_name_snapshot`, `gherkin_script_snapshot`, `created_at`

  It has composite tenant FKs: execution `ON DELETE CASCADE`, run and test case `ON DELETE SET NULL (column)`, the Postgres ≥ 15 form already used by migration `0008`. It also has `UNIQUE (test_run_id, attempt)` and an index on `(execution_id, attempt)`. RLS is forced with the standard policy. `railgun_app` gets `SELECT, INSERT` only, so attempts are never edited; cascades remove them.
- `test_run.outcome_updated_by_name text`, which `setOutcome` sets from the actor's display name. This is the bug-reporter pattern, needed because attempt rows must say who set the outcome and user rows aren't readable across users. Existing runs keep null, shown as "Unknown user".
- `bug.attempt integer CHECK (attempt > 0)`, backfilled to 1 where `test_run_id IS NOT NULL`. `bug_one_auto_per_run_idx` is replaced by a unique index on `(test_run_id, attempt) WHERE auto_created AND deleted_at IS NULL`.

The down migration reverses all of it. If more than one auto bug per run exists by then, the old index can't be recreated, and the down migration says so in a comment.
*Alternative:* attempts keyed only to the run, cascading. Rejected: dropped runs would lose their history (ADR 0020 decision 4). *Alternative:* a JSON column of attempts on the run. Rejected for the same reason, and it's harder to query for reports.

### 4. Bugs take the attempt from the execution at write time
Each of the three paths that ties a bug to a run already reads the run and its execution. Each one adds `e.attempt` to that read and writes it into `bug.attempt`:

- filing from a run (`bugs.controller.ts` create)
- linking (`bugs.controller.ts` link)
- auto-create (`autoCreateBugForRun`)

Auto-create's `ON CONFLICT` target becomes `(test_run_id, attempt)`. Bug responses gain `attempt: number | null`.

### 5. Runs report `testCaseStatus`; Duplicate reuses the create endpoint
`loadExecution` adds `tc.status`, null when the test case is deleted or purged, as `RunResponse.testCaseStatus`. Duplicate is purely client-side:

- `ExecutionFormDialog` gains a `source?: Execution` prop for create mode.
- Initial values: the name `${source.name} (retry)`, the source's run conditions, and `testCaseIds` set to the runs with `testCaseStatus === 'Ready'`, in position order.
- The excluded runs appear in a "Not carried over" note ("deleted" or "no longer Ready: Deprecated"). They are not in the picker, since the picker only offers Ready test cases (existing requirement).
- Saving posts the usual create request, and the screen selects the new execution as it does today.

*Alternative:* `POST …/executions/:id/duplicate`. Rejected: it would duplicate create's validation and still need the form for the subset.

### 6. Attempt history endpoint, cached under the execution
`GET …/executions/:id/runs/:runId/attempts` is guarded at Viewer. It returns the run's attempts newest first, and 404 for a run not in that execution (or another tenant). On the web it's keyed `[...executionKeys.detail(p, id), 'runs', runId, 'attempts']`, so the SSE `execution.changed` refetch and the user's own Restart (which invalidates the detail prefix) both refresh it. It's fetched only when the run panel is open and `execution.attempt > 1`.

### 7. Web actions
- `ExecutionAction` gains `cancel` and `tryAgain`:
  - `InProgress: ['pause', 'cancel']`
  - `Paused: ['resume', 'cancel']`
  - `Completed: ['signOff', 'tryAgain']`
  - `Done` and `Canceled: ['tryAgain']`
- `canRestart(status, role)` encodes "Done needs Admin".
- `LifecycleActions` adds a Cancel confirmation dialog and a Try Again dialog:
  - two choices; Restart lists `runs.filter(r => r.testCaseDeleted)` as runs to be dropped and is disabled when every run is in that list
  - Duplicate calls a new `onDuplicate` callback that opens the form with `source`
- `transitionExecution` gains the `cancel` and `restart` verbs.
- The header shows an "Attempt N" badge when `attempt > 1`.
- The run panel groups its bugs by `attempt`, current first; bugs with a null attempt go under the current one. It also lists earlier attempts.

## Risks / Trade-offs

- **[Risk] Restart is a multi-statement transaction on a hot row.** → It holds the same row lock as outcome writes for a few statements over at most a few hundred runs, and writes are human-paced (ADR 0012 consequence).
- **[Risk] A Restart from a stale screen.** Example: a colleague signed off a Completed execution, and a Contributor restarts it. → The status is re-checked under the lock. The Contributor now gets 403 (Done needs Admin), and the screen shows the server's reason.
- **[Trade-off] Runs whose test case is no longer Ready are restarted** but not carried over by Duplicate. → This is deliberate (ADR 0020 decisions 5 and 7). Duplicate creates a Draft, and Drafts only accept Ready test cases.
- **[Trade-off] Outcome author names before this change are unknown.** → Attempt rows copied from those runs show "Unknown user". Only development and demo data are affected.
- **[Risk] The bug-index swap fails on duplicate data.** → It can't fail going up: the old index is strictly tighter than the new one.

## Migration Plan

1. Apply `0015_execution_attempts.up.sql` as `railgun_migrator` (`npm run db:migrate`), then run `npm run db:check-rls`.
2. Deploy the API and web together. The new response fields are additive, and the old web build ignores them.
3. Rollback: `0015_execution_attempts.down.sql`, after restoring the previous API build.
