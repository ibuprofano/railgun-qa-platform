# Tasks

## 1. Docs: decisions and roadmap

- [x] 1.1 Write `docs/adr/0022-trash-restore.md`. It amends ADR 0007 and records:
  - restoring an item inside a trashed folder brings back each ancestor folder's whole deletion
  - a folder name clash or a depth overflow is refused with 409, never auto-renamed
  - the trash unit is the purge's unit
  - the alternatives in design.md decision 4

  Add the ADR to ADR 0007's amended-by header and to ADR 0001's list. Verify that every link resolves.
- [x] 1.2 In `docs/roadmap-full.md`, add a Phase 9 "Slice 1: Activity and Trash 🚧" entry pointing at the OpenSpec change `activity-and-trash`, with the scope and out-of-scope list from proposal.md and a link to ADR 0022. Mark Phase 9 🚧. In `docs/open-questions.md`, update H1 to say the trash list and restore endpoints now exist. Verify that both read like the existing Phase 6 and 7 slice entries.

## 2. API: project activity feed

- [x] 2.1 In `common/activity-log-reader.ts`:
  - generalize `historyPage` so the project feed can use it
  - add `listProjectActivity(tx, { workspaceId, projectId, entityTypes?, before })`
  - add the pill → entity-type map with a `parseActivityType` that throws 400 on an unknown value (design.md decision 1)

  Verify with unit tests: every pill maps as in the table, `environments` covers both environment types, and an unknown value is rejected.
- [x] 2.2 Add `src/activity/activity.controller.ts` with `GET /projects/:projectId/activity?type=&before=` (Viewer guard, `{ entries, nextCursor }`) and register it in `AppModule`. Add `test/activity-feed.e2e-spec.ts` and verify:
  - test case, execution and bug entries all come back, newest first
  - `workspace.renamed` and another project's entries are excluded
  - a purge entry has `actorName: null`
  - `runs` returns only outcome entries
  - `environments` returns an edit and a reveal
  - `folders` returns a delete and its restore. Add this check after group 3.
  - 25 entries page as 20 + 5, and a filtered feed pages without gaps or repeats
  - a bad cursor or bad type → 400, and no access, including from another workspace → 403

## 3. API: trash list and restore

- [x] 3.1 Add `src/trash/trash-queries.ts` with the four list queries (design.md decision 3): the purge's predicates, folder roots with folder and test case counts, deleter names, and `purgeAfter`/`daysLeft` computed in SQL. Also add `parseTrashType` (`test-case`, `folder`, `execution`, `bug`; otherwise 400). Add `src/trash/trash.controller.ts` with `GET /projects/:projectId/trash?type=` (Admin guard) and register it. Add `test/trash.e2e-spec.ts` and verify:
  - a folder delete with a subfolder and 3 test cases is one entry reporting 2 folders and 3 test cases
  - a test case deleted before its folder gives two entries, folder first
  - a backdated deletion 10 days old shows 20 days left
  - one backdated 30 days 2 hours shows 0
  - `?type=bug` filters, and an unknown type → 400
  - Contributor and Viewer → 403, and a Workspace Owner with no membership → 200
  - an empty trash → `[]`
- [x] 3.2 Add `POST /projects/:projectId/trash/:type/:id/restore` for bugs and executions (design.md decision 4, steps 1, 3, 5–8): lock or 404, the auto-filed bug clash check (409), clear the deleted columns, log `bug.restored` / `test_execution.restored`, emit events, and return `{ restored }`. Extend the e2e spec and verify:
  - a restored bug is listed again and still linked to its run
  - a restored Draft execution keeps its 4 runs in order
  - a second restore → 404
  - another workspace's bug → 404
  - a restore while another auto-filed bug exists for the run attempt → 409, with no change and no activity entry
  - `execution.changed` and `run.bugs.changed` are emitted after commit, and nothing on a refusal (`live-updates.e2e-spec.ts` pattern)
- [x] 3.3 Extend restore to test cases and folders (steps 2–6):
  - ancestry CTE and group locking
  - name clash check with the clashing name in the message
  - depth check after the update
  - position fix-up with `keyForAppend`
  - clear `deletion_id`
  - one entry per restored deletion, with `restoredWith` on ancestor entries

  Verify in the e2e spec:
  - a folder tree comes back whole under its former parent
  - a test case deleted alone, then its folder deleted with 2 more test cases: restoring the test case brings back all of them, with two activity entries and `restored` listing the test case and then the folder
  - an earlier deletion inside a restored folder stays in the trash
  - a test case's former position comes back when it is free, and the test case goes last when it is taken
  - a live "checkout" sibling → 409 naming it, with nothing restored and no entries, including when the clash is on an ancestor
  - a parent moved to level 3 → 409 for a two-level subtree
  - a test case deleted with its folder, restored by its own id → 404
  - after restore, `deletion_id` is NULL on every restored row
- [x] 3.4 Add a worker test to `apps/worker/src/tasks/trash-purge.spec.ts`: a folder tree restored (deleted columns and `deletion_id` cleared directly in SQL, as the API does) and then backdated past 30 days is not purged, and a restored-then-re-deleted test case is purged as an individual deletion. Verify with `npm test -w apps/worker`.

## 4. Web: Activity screen

- [x] 4.1 In `lib/activity-api.ts`, add `listProjectActivity`, `activityKeys.project` and `ACTIVITY_FILTERS`. In `lib/activity-format.ts`, add:
  - sentences for `test_case.restored`, `folder.restored` (including `restoredWith`), `test_execution.restored` and `bug.restored`
  - `actionKind`
  - `groupByDay(entries, now)` (Today, Yesterday, weekday names within the current Monday-start week, then the date)

  Extend `lib/activity-format.test.ts` and verify: the restore sentences, kinds for create, restore, delete, purge, run_added, run_removed and update codes, and day labels across a week boundary, a Monday "today" and a Sunday.
- [x] 4.2 Build `components/activity/activity-screen.tsx` and `app/(app)/activity/page.tsx` (design.md decision 6): pills as a radiogroup kept in `?type=`, day sections, rows (initials avatar, actor or "System", kind-coloured sentence, entity icon, `<time>` with the exact time in `title`), "Load more", and the skeleton, empty (all vs. filtered) and error-with-Retry states. Add `activity-screen.test.tsx` and verify:
  - grouping headings render
  - selecting Bugs refetches with `type=bugs` and marks the pill as selected
  - `?type=runs` on load selects Runs
  - "Load more" appends, then disappears on the last page
  - an unknown code still renders
  - both empty states and the error Retry work
- [x] 4.3 Add Activity (`History` icon) to the shell's `NAV_LINKS`. Extend the shell test to verify that a Viewer sees Activity, and that it is marked current on `/activity`.

## 5. Web: Trash screen

- [x] 5.1 Add `lib/trash-api.ts` (`TrashEntry`, `listTrash`, `restoreTrashItem`, `trashKeys`). Build `components/trash/trash-screen.tsx` and `app/(app)/trash/page.tsx` with the Admin gate (design.md decision 7): a type filter in `?type=`, and rows showing icon, name, folder counts, deleter, relative deletion time, and days left ("removed at the next cleanup" at 0). Add the empty and error states. Add `trash-screen.test.tsx` and verify:
  - a folder row shows "1 folder, 4 test cases" and "29 days left"
  - a 0-day row shows the cleanup text
  - the Executions filter refetches with `type=execution`
  - an empty trash shows the empty state
  - a Contributor sees access-denied
- [x] 5.2 Add a per-row Restore mutation:
  - disabled while pending
  - on success, a toast naming the item and any folders restored with it, then invalidate the trash, activity, folder tree and test case, execution and bug keys
  - on failure, `ActionError` on that row, with the row kept

  Extend the test and verify: the success toast text with and without ancestor folders, that the row disappears after the refetch, that the right query keys are invalidated, and that a 409 shows its server message on that row only.
- [x] 5.3 Add Trash (`Trash2` icon) to `ADMIN_NAV_LINKS` after Project Settings. Extend the shell test to verify that an Admin sees Trash and a Contributor doesn't.

## 6. Integration check

- [x] 6.1 Run `npm run lint`, `npm run typecheck`, `npm test -w apps/api`, `npm test -w apps/worker` and `npm run test -w apps/web` from the repository root, and verify that all pass.
- [x] 6.2 Manual run against the seeded database (`npm run dev`), as an Admin:
  1. Delete a test case, then delete its folder.
  2. Check that Trash shows two rows.
  3. Restore the test case. Check that the toast names the folder, both rows are gone, and the tree shows both items in place.
  4. Check that the Activity screen shows the deletes and restores under Today, and that the Folders pill narrows to the folder's entries.
  5. Sign in as a Contributor. Check that Activity shows and Trash is neither in the nav nor reachable.

  Record the result in roadmap-full.md's slice entry.

## Workflow follow-up

- Update the roadmap-full.md slice entry to ✅ with Built / Key decisions / Deferred, the same way as the Phase 7 slices.
- Archive the change with `/opsx:archive` once review is done, and verify that the `trash-restore`, `activity-screen` and `trash-screen` main specs get their Purpose sections.
