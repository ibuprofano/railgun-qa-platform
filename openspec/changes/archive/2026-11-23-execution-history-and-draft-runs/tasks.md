# Tasks

## 1. Docs

- [x] 1.1 In roadmap-full.md, add a Phase 7 "Slice 2: Execution history and Draft runs 🚧" entry pointing at the OpenSpec change `execution-history-and-draft-runs`, with its scope and out-of-scope list from proposal.md and a link to ADR 0021. Verify it reads like Slice 1's entry.

## 2. API: Draft run changes

- [x] 2.1 Add `POST …/executions/:executionId/runs` (design.md decision 3): Contributor+; row lock; Draft only (409); `assertSelectableTestCases` (400); 409 if the test case is already in the execution; append at the end; log `test_execution.run_added`; emit `execution.changed`. Extend `executions.e2e-spec.ts` and verify:
  - D is appended as run 4 of A, B, C, Pending
  - a duplicate → 409
  - Draft, Deprecated, deleted or another project's test case → 400
  - a Ready execution → 409
  - Viewer → 403
  - the activity entry names the test case
  - `execution.changed` is emitted, and nothing is emitted on a refusal
- [x] 2.2 Add `DELETE …/executions/:executionId/runs/:runId`: Contributor+; row lock; Draft only (409); 404 for a run of another execution; 409 when it's the only run; delete and renumber; log `test_execution.run_removed`; emit. Extend the e2e spec and verify:
  - removing B from A, B, C leaves A and C at 1 and 2 with the same ids
  - the last run → 409
  - Ready → 409
  - another execution's run → 404
  - Viewer → 403
  - the activity entry is written and `execution.changed` emitted

## 3. API: history reads

- [x] 3.1 In `common/activity-log-reader.ts`, add the cursor encode and decode helpers (base64url `createdAt|id`; invalid → error) plus `listExecutionHistory` and `listBugHistory`, per design.md decision 2, fetching `limit + 1` rows. Verify with unit tests: the cursor round-trips, and malformed cursors are rejected.
- [x] 3.2 Add `GET …/executions/:executionId/activity` and `GET …/bugs/:bugId/activity` (Viewer; 404 for a missing, deleted or other-tenant item; 400 for a bad cursor), returning `{ entries, nextCursor }`. Add `test/activity-history.e2e-spec.ts` and verify:
  - the execution history includes start, outcome, auto-created bug and cancel entries
  - a later status edit of a linked bug is included
  - a second execution's entries are excluded
  - the bug history holds exactly its own entries, newest first
  - 25 entries page as 20 plus 5, with no cursor at the end
  - a bad cursor → 400
  - no access → 403
  - another tenant → 404

## 4. API: environment logging

- [x] 4.1 Log `environment.created`, `environment.updated` (changed fields; credential aliases added, changed and removed; no entry when nothing changed) and `environment.deleted` inside each existing transaction (design.md decision 4). Extend the environments e2e spec and verify:
  - each entry exists with the aliases named
  - the serialized entries contain no password
  - a duplicate-alias rejection writes no entry
- [x] 4.2 Run the full API suite (with `SECRETS_MASTER_KEY` in the shell), `npm run lint` and `npm run typecheck`, and verify all pass.

## 5. Web: activity formatter and component

- [x] 5.1 Add `lib/activity-api.ts` (types, the two list functions, query keys under the item's detail key) and `lib/activity-format.ts` (`describeActivity`, with a fallback for unknown codes). Verify with unit tests: a sentence for every action code the API logs today (list them from the code), and the fallback for an unknown code.
- [x] 5.2 Add `components/activity/activity-history.tsx`: infinite query, newest first, relative time with the absolute time on hover, an empty state, and "Load more" while `nextCursor` is set. Verify with component tests: it renders sentences, Load more appends older entries, and it shows the empty state.

## 6. Web: History sections and freshness

- [x] 6.1 Mount a History section in the execution detail and the bug detail. Make `useApplyExecution` invalidate the execution's history and run-attempt keys, make the live provider's `run.bugs.changed` invalidate the execution history, and make the bug detail's edit invalidate the bug history (design.md decision 6). Verify with tests:
  - each detail shows its History
  - a lifecycle action from the detail refetches the history
  - a bug edit refetches the bug history
  - the live handler invalidates the history key

## 7. Web: Draft run removal

- [x] 7.1 Rename `canReorderRuns` to `canEditDraftRuns` and update its callers and tests. Give `RunsTable` a remove button per row when removable, disabled with the reason when one run remains. Wire `removeRun` and `applyExecution` in the execution detail. Verify with tests:
  - removing calls the API and renumbers the table
  - the single-run button is disabled with the reason
  - no button outside Draft or for a Viewer
  - a refusal shows the server's reason

## 8. Web: Run → add to existing execution

- [x] 8.1 Turn the test case detail's Run into a dropdown ("New execution", "Add to existing execution…"). Add `AddToExecutionDialog`: Draft executions, those already holding the test case disabled and marked, and an empty state. Choosing one calls `addRun` and navigates to the execution. Wire it in `test-cases-screen.tsx`. Verify with tests:
  - New execution still opens the form
  - the dialog lists Drafts and disables one that holds the test case
  - choosing one calls `addRun` and navigates
  - the empty state appears
  - Run isn't offered for a Draft test case or to a Viewer
- [x] 8.2 Run `npm run test -w apps/web`, `npm run lint` and `npm run typecheck`, and verify all pass.

## 9. Integration check

- [x] 9.1 With `npm run dev` and the demo data, in the browser:
  1. Add a Ready test case to a Draft execution from the Test Cases screen.
  2. Remove a run from that Draft, and check that the last run can't be removed.
  3. Open the History of a started execution and of a bug, then use Load more.
  4. Edit an environment and confirm the change is logged.
  5. Cancel an execution in another tab and see the History update.

  Record anything that diverges from the specs before archiving.

## Workflow follow-up

- Update the roadmap-full.md Phase 7 Slice 2 entry to ✅ with Built, Key decisions and Deferred, and note the Phase 5 environment-logging gap as closed.
- Archive the change with `/opsx:archive` once implementation and review are done.
