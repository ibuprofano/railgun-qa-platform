# Tasks

## 1. Docs

- [x] 1.1 In roadmap-full.md, add a Phase 7 "Slice 1: Cancel and Try Again 🚧" entry pointing at the OpenSpec change `execution-cancel-and-try-again`, with its scope and out-of-scope list from proposal.md. Verify it reads like Phase 6's slice entries and links ADRs 0019 and 0020.

## 2. Database

- [x] 2.1 Add `db/migrations/0015_execution_attempts.up.sql` and `.down.sql` per design.md decision 3:
  - `test_execution.attempt`
  - `test_run.outcome_updated_by_name`
  - `test_run_attempt`, with forced RLS, composite tenant FKs (execution cascade; run and test case `SET NULL (column)`), `UNIQUE (test_run_id, attempt)`, and `SELECT, INSERT` for `railgun_app`
  - `bug.attempt`, backfilled to 1 for bugs linked to a run
  - the auto-bug index swapped to `(test_run_id, attempt)`

  Verify `npm run db:migrate` applies it, `npm run db:check-rls` passes, and down then up again succeeds on the dev database.

## 3. API: Cancel

- [x] 3.1 In `execution-lifecycle.ts`, make `Transition.from` a list, add `cancel` (`InProgress`/`Paused` → `Canceled`, Contributor, `test_execution.canceled`), and update `canTransition`. In the controller, match `status = ANY(from)` and give `cancel` the `STOP_TIMER` SQL. Verify that `execution-lifecycle.spec.ts`, extended with the cancel rows (allowed from InProgress and Paused, refused from every other status), passes.
- [x] 3.2 Add `POST …/executions/:executionId/cancel`. Extend `execution-lifecycle.e2e-spec.ts` and verify:
  - cancel from InProgress stops the timer and keeps one Pass and two Pending runs
  - cancel from Paused keeps the elapsed time
  - cancel from Completed → 409
  - Viewer → 403
  - an outcome write on a Canceled execution → 409
  - the activity entry `test_execution.canceled` is written
  - `execution.changed` is emitted, and nothing is emitted on a 409

## 4. API: Restart and attempt history

- [x] 4.1 Make `setOutcome` also write `outcome_updated_by_name` from the actor's display name. Verify with an e2e assertion on the stored column.
- [x] 4.2 Add `attempt` to `ExecutionResponse`, and `testCaseStatus` (null when deleted) to `RunResponse`, in `execution-queries.ts`. Extend `executions.e2e-spec.ts` and verify:
  - a new execution reports attempt 1
  - a run reports `Deprecated` after its test case changes status
  - a run reports null with `testCaseDeleted` after its test case is deleted
- [x] 4.3 Add `POST …/executions/:executionId/restart` with the eight steps of design.md decision 2 in one transaction (row lock, checks in the order 404 / 409 / 403, attempt copy, drop, renumber, reset, execution update, log and emit). Add `test/execution-restart.e2e-spec.ts` and verify:
  - Completed → Ready at attempt 2, with zero elapsed time, no completion or sign-off, every run Pending, and snapshots cleared
  - Canceled → Ready, for a Contributor
  - Done → 403 for a Contributor and Ready for an Admin
  - InProgress → 409
  - Viewer → 403
  - a deleted test case's run is dropped, positions close up, and its bug is unlinked but keeps its attempt
  - a Deprecated test case's run is kept
  - every test case deleted → 409 with nothing changed
  - attempt rows hold outcome, author name, time and snapshot, including for the dropped run
  - Run All after a Restart snapshots the edited test case name
  - the activity entry `test_execution.restarted` records `from`, `elapsedMs`, `attempt` and `droppedRuns`
  - `execution.changed` is emitted
  - the tenant harness returns 404 for another workspace's execution
- [x] 4.4 Add `GET …/executions/:executionId/runs/:runId/attempts` (Viewer, newest first). Extend the restart e2e spec and verify:
  - an empty list before any Restart
  - attempts 2 and 1, in that order, after two restarts
  - 404 for a run of another execution or another workspace

## 5. API: bugs and attempts

- [x] 5.1 Record `e.attempt` into `bug.attempt` when filing from a run and when linking (`bugs.controller.ts`), and in `autoCreateBugForRun`, whose `ON CONFLICT` target becomes `(test_run_id, attempt)`. Add `attempt` to bug responses. Extend `bugs.e2e-spec.ts` and verify:
  - filing at attempt 2 reports 2
  - an unlinked bug reports null
  - linking records the current attempt
  - Fail → Pass → Fail in one attempt still yields one auto bug
  - Fail, Restart, Run All, Fail yields a second auto bug at attempt 2
- [x] 5.2 Run the full API suite (`npm test -w apps/api`, with `SECRETS_MASTER_KEY` set in the shell) and `npm run lint` and `npm run typecheck`, and verify all pass.

## 6. Worker: purge coverage

- [x] 6.1 Extend `apps/worker/src/tasks/trash-purge.spec.ts` and verify:
  - purging a test case keeps its attempt rows with their snapshot and a null `test_case_id`
  - purging a restarted execution removes its attempt rows

  `npm test -w apps/worker` must pass. Change purge code only if a test shows the cascades don't cover the table.

## 7. Web: API layer and permissions

- [x] 7.1 In `lib/executions-api.ts`, add `attempt`, `testCaseStatus`, the `cancel` and `restart` verbs, and `listRunAttempts`. In `lib/bugs-api.ts`, add `attempt`. Add the attempts query key under the execution detail prefix (design.md decision 6). Verify `npm run typecheck` passes.
- [x] 7.2 In `lib/execution-permissions.ts`:
  - add `cancel` and `tryAgain` to the status table (design.md decision 7)
  - add `canRestart(status, role)`
  - update the header comment, which currently says Cancel and Try Again are deferred

  Verify with unit tests: Pause and Cancel for a Contributor on InProgress; Try Again on Completed, Done and Canceled; `canRestart` false for a Contributor on Done and true for an Admin; nothing for a Viewer.

## 8. Web: Cancel and Try Again on the detail view

- [x] 8.1 In `LifecycleActions`, add the Cancel button with a confirmation dialog ("runs not yet run stay Pending; outcomes can no longer be changed") and its success toast. Verify with component tests: confirming calls `cancel` and applies the result, and dismissing leaves the execution unchanged.
- [x] 8.2 Add the Try Again dialog with Restart and Duplicate:
  - Restart's confirmation names the runs with `testCaseDeleted` as runs to be dropped.
  - Restart is disabled with the reason when every run is in that list.
  - Restart is hidden for a Contributor on Done.
  - Duplicate calls `onDuplicate`.

  Verify with component tests for each of those cases, and that a refused Restart shows the server's reason.
- [x] 8.3 Show the "Attempt N" badge in the execution header when `attempt > 1`. Verify with a test: shown at attempt 2, absent at attempt 1.

## 9. Web: Duplicate form

- [x] 9.1 Give `ExecutionFormDialog` a `source` prop for create mode:
  - name `"<name> (retry)"`
  - the source's run conditions
  - the test cases of runs with `testCaseStatus === 'Ready'`, in position order
  - a "Not carried over" note naming each excluded test case and its reason

  Wire `onDuplicate` in `executions-screen.tsx`. Verify with tests:
  - a source with runs A, B (Deprecated) and C pre-selects A and C and lists B as no longer Ready
  - a deleted run is listed as deleted
  - saving posts a create request without B and selects the new execution
  - the source is untouched

## 10. Web: run panel attempts

- [x] 10.1 In the run panel, when `execution.attempt > 1`, fetch and list the run's earlier attempts (attempt number, outcome badge, who set it, when), newest first. Verify with tests: listed after a Restart, not fetched at attempt 1.
- [x] 10.2 In `run-bugs.tsx`, group bugs by `attempt` (current attempt first; null under the current attempt) when the execution has been restarted. Verify with a test: bugs from attempts 1 and 2 appear under their own headings.
- [x] 10.3 Run `npm run test -w apps/web`, `npm run lint` and `npm run typecheck`, and verify all pass.

## 11. Integration check

- [x] 11.1 With `npm run dev` and the demo seed, walk the flow in the browser:
  1. Cancel an In Progress execution.
  2. Restart it and see Attempt 2.
  3. Run it, fail a run with auto-create on, and see bugs from both attempts in the run panel.
  4. Duplicate a Done execution with one Deprecated test case.
  5. Confirm a second tab updates live on Cancel and Restart.

  Record anything that diverges from the specs before archiving.

## Workflow follow-up

- Update the roadmap-full.md Phase 7 entry to ✅ with Built, Key decisions and Deferred, as the earlier slices do.
- Archive the change with `/opsx:archive` once implementation and review are done.
