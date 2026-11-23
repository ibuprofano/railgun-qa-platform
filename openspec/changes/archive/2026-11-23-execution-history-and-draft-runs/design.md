# Design

## Context

See proposal.md, Why, and [ADR 0021](../../../docs/adr/0021-execution-history-and-draft-run-changes.md). The current codebase constrains the approach:

- **Reading the log.** `activity_entries` has no FKs, and its only index is `(workspace_id, project_id, created_at DESC, id DESC)`. `common/activity-log-reader.ts` already pages a whole project by keyset, but no route uses it.
- **Which entries mention an execution:**
  - Execution entries use entity type `test_execution`.
  - Run outcome entries are `test_run.outcome_set`, with `details.executionId`.
  - Bug entries use entity type `bug`. Bugs link to runs through `bug.test_run_id`.
- **Draft run edits today.** The only per-run Draft edit is `POST …/runs/:runId/move`: it locks the execution row, refuses with 409 unless the execution is Draft, renumbers with `unnest … WITH ORDINALITY`, logs `test_execution.runs_reordered`, and emits `execution.changed`. Positions are `UNIQUE … DEFERRABLE INITIALLY DEFERRED`, and `(execution_id, test_case_id)` is unique.
- **Environments.** All three environment mutations (create, update, delete) are Admin-only. Ciphertexts are computed before the update's transaction opens. Delete is a hard `DELETE`, and only reveals are logged (`environment_credential.revealed`).
- **Web cache:**
  - `useApplyExecution` calls `setQueryData` on `executionKeys.detail` and invalidates the list.
  - The live provider invalidates the `executionKeys.detail` prefix on `execution.changed`, and `bugKeys.forRun` on `run.bugs.changed`.
  - The bug detail calls `setQueryData` on `bugKeys.detail` after an edit.
  - The test case detail's Run calls `onRun`, which makes the screen open `ExecutionFormDialog`.
  - shadcn `dropdown-menu` is already in `components/ui`.

## Goals / Non-Goals

**Goals:**
- One API shape and one web component serve both histories, and later the Phase 9 Activity screen.
- History queries stay on the existing keyset index plus bounded lookups. No migration.
- Adding and removing runs follow the move route's pattern exactly: lock, status check, renumber, log, emit.

**Non-Goals:**
- Category filters, day grouping or avatars (PRD §6.6). Those belong to the Activity screen.
- Turning `details` into human prose on the server. The formatter is client-side.
- Logging environment changes from the seed. The seed backdates its own entries and isn't affected.

## Decisions

### 1. History endpoints and response
- **Routes:** `GET /projects/:projectId/executions/:executionId/activity?before=<cursor>` and `GET /projects/:projectId/bugs/:bugId/activity?before=<cursor>`, both guarded at Viewer.
- **Response:** `{ entries: ActivityEntry[], nextCursor: string | null }`. Each entry has `{ id, actorName, actionCode, entityType, entityId, entityName, details, createdAt }`.
- **Cursor:** base64url of `<createdAt ISO>|<id>`. Anything that doesn't decode to a valid timestamp and uuid → 400.
- **Paging:** fetch 21 rows; a 21st row means `nextCursor` is the 20th entry's key.
- **Existence check:** the execution or bug must exist, belong to the project and not be deleted, else 404.

*Alternative:* offset paging. Rejected: ADR 0007 requires keyset, and entries arrive while paging.

### 2. Execution history query
A new reader in `activity-log-reader.ts`, `listExecutionHistory(tx, { workspaceId, projectId, executionId, before, limit })`:

```sql
WHERE workspace_id = $ws AND project_id = $p
  AND ( (entity_type = 'test_execution' AND entity_id = $e)
     OR (entity_type = 'test_run' AND details->>'executionId' = $e::text)
     OR (entity_type = 'bug' AND entity_id IN (
           SELECT b.id FROM bug b JOIN test_run r ON r.id = b.test_run_id WHERE r.execution_id = $e)) )
  AND (created_at, id) < cursor
ORDER BY created_at DESC, id DESC LIMIT 21
```

The bug subquery is current links only (ADR 0021 decision 1), and it includes soft-deleted bugs, whose deletion entry stays relevant. The project-scoped keyset index bounds the scan to the project. The `details` match is a filter, not an index lookup, which is acceptable at v1 volumes (ADR 0021 consequence). `listBugHistory` filters on `entity_type = 'bug' AND entity_id = $b`.

*Alternative:* a materialized "subject" column on entries. Rejected: it needs a migration and a backfill of an append-only table.

### 3. Add and remove runs
Both live in `executions.controller.ts`, next to `move`, and share its steps: `withTenantContext`, then `SELECT … FOR UPDATE` of the execution (404 if missing, 409 unless Draft).

**Add:** `POST …/runs`, body `{ testCaseId }`, guarded at Contributor.
1. Validate the test case with the controller's existing `assertSelectableTestCases`: same project, not deleted, Ready → else 400.
2. If the execution already holds the test case → 409.
3. Insert at `max(position) + 1`.
4. Log `test_execution.run_added` with details `{ testCaseId, testCaseName, position }`.
5. Emit `execution.changed`, and return `loadExecution`.

**Remove:** `DELETE …/runs/:runId`, guarded at Contributor.
1. Run not in the execution → 404.
2. It's the only run → 409.
3. Delete it and renumber.
4. Log `test_execution.run_removed` with details `{ testCaseId, testCaseName, fromPosition }`.
5. Emit, and return `loadExecution`.

A Draft run has no snapshot, no outcome and no bugs, since bugs need a started execution (ADR 0013), so deleting it loses nothing.

### 4. Environment logging
- Each write gets `log()` inside its existing `withTenantContext` transaction, with category `Environments` and entity type `environment`. The actor's name is read the way the reveal route already reads it.
  - **Create:** `environment.created`, details `{ credentials: [aliases] }`.
  - **Update:** `environment.updated`, details `{ changes: { name?, baseUrl?, defaultBrowser? : {from, to} }, credentials: { added, changed, removed } }`, where each credential list holds aliases. It's derived from the reconciliation plan the update already builds. Nothing is logged when nothing changed.
  - **Delete:** `environment.deleted`, with the environment's name.
- A rejected request (400 duplicate alias) rolls back its own entry with the transaction.

### 5. Web: formatter and component
- **`lib/activity-api.ts`:**
  - `listExecutionActivity` and `listBugActivity`
  - query keys `[...executionKeys.detail(p, e), 'activity']` and `[...bugKeys.detail(p, b), 'activity']`
  - `useInfiniteQuery` with `getNextPageParam = nextCursor`
- **`lib/activity-format.ts`:** a `describeActivity(entry)` map from action code to a sentence, built from the entity name and details:
  - "started the execution"
  - "set run "Login" to Fail"
  - "filed bug "Total is wrong""
  - "changed status of bug "X" from Open to Resolved"

  Unknown codes fall back to `actionCode` plus the entity name, so later codes never break the panel. Times are shown as relative time, with the absolute time on hover.
- **`components/activity/activity-history.tsx`:** renders pages, an empty state, and "Load more". The execution detail and bug detail each mount it in a History section.

### 6. Web: keeping histories fresh
- `useApplyExecution` also invalidates `[...detail, 'activity']`, and while it's there the run attempts prefix as well. Both are refetched from the server, never patched. Today they only refresh through the SSE echo of the user's own change, which goes stale when the stream is down; this also fixes that for Slice 1's attempt lists.
- The live provider's `run.bugs.changed` handler also invalidates the execution's history.
- The bug detail's edit success invalidates the bug's history.

### 7. Web: remove and add
- **Remove:** `RunsTable` gains `removable` and `onRemove` props. The execution detail passes them when the existing `canReorderRuns(status, role)` holds (Contributor+ and Draft); it's renamed `canEditDraftRuns`, since it now covers both actions. When a single run remains, the button is disabled with a tooltip giving the reason. Removing calls `removeRun`, then `applyExecution`, and shows any `ActionError`.
- **Add:**
  - The test case detail's Run becomes a `DropdownMenu` with "New execution" (the current `onRun`) and "Add to existing execution…" (a new `onAddToExisting`).
  - `AddToExecutionDialog` lists the cached or fetched executions filtered to `status === 'Draft'`. Those whose detail runs include the test case are disabled.
  - The list response has no runs, so the dialog fetches each Draft's detail. That's bounded by the number of Drafts, which is small. *Alternative:* a server filter `?draftsWithout=<testCaseId>`. Rejected for now; it can be added if Drafts pile up.
  - Choosing one calls `addRun`, then navigates to `/executions?execution=<id>`.

## Risks / Trade-offs

- **[Risk] The `details->>'executionId'` filter scans every entry in the project.** → It's bounded by the project-scoped index and LIMIT 21 with a keyset. An expression index can be added without changing the API if logs grow (ADR 0021 consequence).
- **[Trade-off] A bug linked after the fact brings its whole earlier history into the execution panel.** → This is accepted in ADR 0021.
- **[Risk] The add dialog's per-Draft fetches.** → Detail queries are cached and shared with the Executions screen. A project with many Drafts is the signal to add the server filter.
- **[Trade-off] The formatter knows every action code.** → The fallback sentence keeps unknown codes readable, and a unit test lists every code the API logs today, so a missing mapping is caught.

## Migration Plan

No database change. Deploy the API and web together. The new routes are additive, and the old web build never calls them.
