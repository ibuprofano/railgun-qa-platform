# Proposal

## Why

An execution can only end today by finishing every run and being signed off. It can't be stopped, and a finished execution can't be run again. PRD §6.3.4 promises **Cancel** (In Progress or Paused) and **Try Again** (Restart or Duplicate) from the final statuses. The `Canceled` status has existed in the schema since `execution-lifecycle`, but no transition reaches it. Phase 7's remainder (roadmap-full.md) builds these two next, and the open decisions are now settled in [ADR 0019](../../../docs/adr/0019-execution-cancel.md) (Cancel) and [ADR 0020](../../../docs/adr/0020-execution-try-again.md) (Try Again, which resolves G7).

## What Changes

- **Cancel:**
  - Contributors and Admins can move an In Progress or Paused execution to `Canceled`.
  - The timer stops. Pending runs stay Pending, and every outcome becomes read-only.
- **Restart (Try Again):**
  - Available from Completed, Done and Canceled. Restarting a Done execution needs an Admin; the other two need a Contributor.
  - The execution returns to `Ready` with the timer at 0, its completion and sign-off cleared, and every run back to `Pending` with its snapshot cleared. Run All snapshots again.
  - Runs whose test case was deleted since are dropped, and the remaining positions close up. Restart is refused if no runs would be left.
- **Attempt history:**
  - Each execution carries an attempt number, starting at 1.
  - Restart first copies every run (outcome, who set it and when, snapshot) into an attempt record for the attempt that just ended. These records survive the run being dropped.
  - A run's earlier attempts can be listed.
- **Bugs and attempts:**
  - A bug filed from, auto-created for, or linked to a run records that execution's current attempt.
  - Auto-create becomes **one bug per run per attempt**, so a run that fails again after a Restart gets a new bug.
- **Duplicate (Try Again):**
  - Opens the New Execution form pre-filled from the source: name "<name> (retry)", the same run conditions, and every eligible test case selected.
  - Test cases that were deleted or are no longer Ready are listed as not carried over, with the reason.
  - It creates an ordinary Draft through the existing create endpoint. Runs report their test case's current status so the form can tell which test cases are eligible.
- **Executions screen:**
  - Cancel with a confirmation.
  - Try Again, offering Restart (whose confirmation names the runs it will drop) and Duplicate.
  - An attempt badge in the header, and earlier attempts and bugs grouped by attempt in the run panel.
- The trash purge removes attempt records with their execution and clears their test case link when a test case is purged.

## Capabilities

### New Capabilities

None. Attempt history belongs to the existing execution lifecycle.

### Modified Capabilities

- `test-execution-lifecycle`:
  - the state machine gains Cancel and Restart, with their role rules
  - Restart's reset, dropped runs and attempt records
  - the attempt number and run attempt history
  - outcomes refused on Canceled executions
  - activity entries for Cancel and Restart
- `test-execution-authoring`: a run reports its test case's current status.
- `bug-tracking`: bugs linked to a run record the attempt. Auto-create becomes one bug per run per attempt.
- `executions-screen`:
  - Cancel and Try Again offered by status and role
  - the Restart and Duplicate flows
  - the attempt badge
  - earlier attempts and bugs grouped by attempt in the run panel
- `trash-purge`: purging keeps or clears attempt records the same way it keeps or clears runs.

## Impact

- **Database:** migration `0015_execution_attempts` adds:
  - `test_execution.attempt`
  - a `test_run_attempt` table with forced RLS and composite tenant FKs
  - `bug.attempt`, backfilled to 1 for bugs linked to a run

  It also replaces `bug_one_auto_per_run_idx` with a per-attempt index. `npm run db:check-rls` must pass.
- **API (`apps/api/src/executions`, `src/bugs`):**
  - new routes: `POST …/executions/:id/cancel`, `POST …/executions/:id/restart`, and `GET …/executions/:id/runs/:runId/attempts`
  - execution responses gain `attempt`, runs gain `testCaseStatus`, and bug responses gain `attempt`
  - the auto-create conflict target changes
  - both transitions emit `execution.changed`
- **Web (`apps/web/components/executions`, `lib/`):** lifecycle actions, permissions, the form dialog's duplicate mode, the run panel, and API types.
- **Worker:** no code change expected, since the purge's existing cascades cover the new table. Its tests gain attempt coverage.
- **Out of scope:**
  - the execution activity panel
  - removing individual runs from a Draft
  - "add to existing execution"
  - a Restart limited to failed runs
  - live updates for the Bugs list
  - the traceability graph
  - attempt data in reports (Phases 9–10)
