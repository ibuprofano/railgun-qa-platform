# Design

## Context

See proposal.md, Why. The current codebase constrains the approach:

- **The log.** `activity_entries` has no FKs. Its index is `(workspace_id, project_id, created_at DESC, id DESC)`.
  - `common/activity-log-reader.ts` has `historyPage()` (21-row fetch, base64url `<createdAt>|<id>` cursor) and `encode/decodeActivityCursor`.
  - `common/activity-history.ts` has `parseHistoryCursor` (400 on a bad cursor) and the `{ entries, nextCursor }` response.
  - Workspace entries (`workspace.renamed`) have `project_id = NULL`. Project entries carry their own id as `project_id`.
- **Entity types in the log:** `test_case`, `folder`, `tag`, `test_execution`, `test_run`, `bug`, `environment`, `environment_credential`, `project`, `workspace`. The stored `category` does not match PRD §6.6's pills: folders and tags are logged under `Test Cases`, and runs under `Executions`. So the filter has to use `entity_type`.
- **How each item is deleted:**
  - test case: `deleted_at`, `deleted_by`, with `deletion_id` left NULL
  - execution: Draft only, `deleted_at`, `deleted_by`
  - bug: `deleted_at`, `deleted_by`
  - folder: the folder, its subfolders and their *live* test cases all get one fresh `deletion_id`. Items already in the trash keep their own deletion.
- **The purge (`apps/worker/src/tasks/trash-purge.ts`) already defines the trash unit:**
  - A test case counts as "individually deleted" when `deletion_id IS NULL OR NOT EXISTS (folder with that deletion_id)`.
  - A folder tree's root is the folder whose parent is not in the same group.
  - Every `DELETE` re-checks "still due" in the same statement. So a restore that commits first wins, and the purge then removes nothing it touched.
- **Ordering.** Folders and test cases have separate sibling key spaces (`position_key COLLATE "C"`, read with `ORDER BY position_key, id`). `folder-queries.ts` already has `keyForAppend`, which returns the key after the last sibling. Sibling folder names are unique among live rows, ignoring case (`folder_sibling_name_idx`). Depth is capped at 4 (`tree-rules.ts` `fitsDepth`; `folder-queries.ts` `folderDepth`, and `subtreeHeight`, which only counts live descendants).
- **Bugs.** `bug_one_auto_per_run_attempt_idx` is unique on `(test_run_id, attempt) WHERE auto_created AND deleted_at IS NULL`.
- **Live events.** `emitExecutionChanged(tx, scope, id)` and `emitRunBugsChanged(tx, scope, executionId, runId)` live in `realtime/live-event.ts`.
- **Web:**
  - `components/activity/activity-history.tsx` and `lib/activity-format.ts` (sentences, `actorOf`, `relativeTime`) exist.
  - Admin-only pages follow `settings/page.tsx` (`session.data.role === 'Admin'`, else `AccessDenied`).
  - The shell has `NAV_LINKS` and `ADMIN_NAV_LINKS`.
  - Screens keep filters in the URL (Executions `?execution=`).

## Goals / Non-Goals

**Goals:**
- The trash list and restore use exactly the purge's notion of a "deletion", so what an Admin sees is what the purge would remove.
- A restore is one transaction: everything comes back, or nothing does.
- No migration, and no change to the worker.
- The feed reuses the history response shape, cursor and web formatter.

**Non-Goals:**
- Adding trashed items to the demo seed. The screen is easy to fill by deleting something.
- Feed performance work beyond today's index (see Risks).
- Server-side sentence formatting. That stays client-side, as in ADR 0021.

## Decisions

### 1. Feed route and type filter

`GET /projects/:projectId/activity?type=<t>&before=<cursor>`, guarded at Viewer. Page size 20, built on a generalized `historyPage` with the subject predicate `entity_type = ANY(:types)` (or `TRUE` when there is no type). Pill → entity types:

| `type` | entity types |
|---|---|
| `test-cases` | `test_case` |
| `executions` | `test_execution` |
| `runs` | `test_run` |
| `bugs` | `bug` |
| `folders` | `folder` |
| `environments` | `environment`, `environment_credential` |
| `projects` | `project` (memberships and invitations join here later, per PRD §6.6) |
| `tags` | `tag` |

Any other value → 400. **Why `entity_type` and not `category`:** categories were written per screen, not per pill. Changing them would mean rewriting immutable rows (impossible by design) or mapping old and new values side by side. `entity_type` already matches the pills one to one, apart from the credential reveal.

The `historyPage` query already pins `project_id`, so workspace entries are excluded with no extra condition.

### 2. Trash types and entry ids

API type values: `test-case`, `folder`, `execution`, `bug`. They are used in `?type=` on the list and in `POST /projects/:projectId/trash/:type/:id/restore`. Each entry's `id` is the item's id. For a folder tree, it is the **root folder's** id.

A type in the path means the server never has to guess which table an id belongs to. A uuid that is a live item, a member of another deletion (for example, a test case taken by a folder delete), or not in this project → 404.

### 3. Listing = four queries mirroring the purge

One `trash-queries.ts` module holds four queries:
- bugs where `deleted_at IS NOT NULL`
- executions likewise
- test cases with the purge's "individually deleted" predicate
- folder roots: `deletion_id IS NOT NULL AND parent not in the same group`, with `count(*)` of folders and test cases sharing the root's `deletion_id`

Each query's deleter name comes from the item's latest delete entry in the activity log (`bug.deleted`, `test_execution.deleted`, `test_case.deleted`, `folder.deleted`), through a `LATERAL` lookup by `entity_id`. `"user"` rows are only readable by their owner (RLS `self_access`), which is why bugs already store a copy of the reporter's name. If there is no entry, the name is NULL and the web shows "Unknown".
- `purgeAfter = deletedAt + 30 days`
- `daysLeft = max(0, ceil((purgeAfter − now) / 1 day))`, computed in SQL with the same `now()` the request sees

The 30 days is the same constant the worker uses, so it lives next to the queries with a comment pointing at ADR 0007.

**Why no paging:** a project's trash only ever holds 30 days of deletions, and a deletion is a deliberate Admin action. Paging can be added without changing the response shape (see Risks).

### 4. Restore algorithm (one `withTenantContext` transaction)

1. **Lock the requested item** with `SELECT … FOR UPDATE`, using that type's trash predicate. Missing → 404. Locking first makes two concurrent restores of the same item give one 200 and one 404.
2. **Work out the deletions to restore:**
   - bug and execution: the item alone
   - test case: the item, plus its folder's ancestry
   - folder: its `deletion_id` group, plus the root's parent's ancestry

   **Ancestry** is a recursive CTE up `parent_folder_id` from the starting folder to the root. It collects the distinct `deletion_id` of every deleted ancestor. The full chain is walked, not stopped at the first live folder: a live folder can't sit under a deleted one, but walking the whole chain avoids relying on that. All rows of those groups are locked `FOR UPDATE`.
3. **Run the checks, before any write.** Any failure → 409 and the transaction rolls back.
   - **Names:** every folder about to be restored whose parent is live (or root) is compared with live siblings by `lower(name)`. The 409 message names the first clash.
   - **Depth:** for each restored root whose parent was live, `fitsDepth(folderDepth(parent), subtreeHeight(root))`. Inner levels keep their relative depth, so they need no check. `subtreeHeight` only counts live rows, so this check runs **after** step 5's update, and before the log writes. A failure throws 409 and the transaction rolls back like the other checks.
   - **Auto-filed bug:** a bug with `auto_created` and a live auto bug on the same `(test_run_id, attempt)`. A unique violation during the update (`isUniqueViolation`, already in `folder-queries.ts`) also maps to 409, as a guard against races.
4. **Positions:** for each restored root with a live (or root) parent, and for a restored individual test case, if a live sibling of the same kind has the same `position_key`, set the root's key to `keyForAppend(...)`. Inner members keep their keys, because their siblings come back with them.
5. **Update:** `deleted_at = NULL, deleted_by = NULL, deletion_id = NULL` on every member row. Clearing `deletion_id` matters: a stale group id on a live row would let a later folder purge treat it as part of the old tree. Executions and bugs only have `deleted_at` and `deleted_by` cleared.
6. **Log:** one entry per restored deletion, the requested item first:
   - `test_case.restored`, `folder.restored` (details `{ folders, testCases, deletionId }`), `test_execution.restored`, `bug.restored`
   - categories `Test Cases` / `Test Cases` / `Executions` / `Bugs`, matching the delete entries
   - ancestor folder entries also carry `details.restoredWith: { type, id, name }`, so the feed can say why they came back
7. **Emit:** `execution.changed` for a restored execution. For a restored bug whose run belongs to a live execution, `run.bugs.changed`.
8. **Respond** `200 { restored: [{ type, id, name }] }`, the requested item first and then the ancestor folders, nearest first.

**Alternative considered:** restoring only the ancestor folder rows, not their whole deletions. Rejected in ADR 0022: it leaves deletions half restored, which both the trash list and the purge would then have to handle.

**Alternative considered:** auto-renaming a clashing folder. Rejected in ADR 0022: a silent rename surprises the Admin, and a 409 with the clashing name is one rename away from success.

### 5. Module placement

`src/trash/trash.controller.ts` (`@Controller('projects/:projectId/trash')`, `ProjectRoleGuard` at Admin) plus `src/trash/trash-queries.ts`, registered in the flat `AppModule` like the other controllers. The feed route goes on a small `src/activity/activity.controller.ts` (`projects/:projectId/activity`), because no existing controller owns project-wide reads. Activity logging reuses `logTreeActivity`, `logExecutionActivity` and `logBugActivity`, so actor handling is unchanged.

### 6. Web: feed

- **`lib/activity-api.ts`:**
  - `listProjectActivity(client, projectId, type, before)`
  - `activityKeys.project(projectId, type)` = `['projects', projectId, 'activity', type ?? 'all']`
  - `ACTIVITY_FILTERS` (pill label ↔ `type`)
- **`lib/activity-format.ts`** gains:
  - the four `*.restored` sentences. `restoredWith` renders as "restored folder “Checkout” with test case “Pay”".
  - `actionKind(entry): 'create' | 'remove' | 'change'`, by code suffix:
    - create: `created`, `restored`, `run_added`
    - remove: `deleted`, `purged`, `run_removed`
    - change: everything else
  - `groupByDay(entries, now)` returns `[{ label, entries }]` in local time. "This week" means the same ISO week (Monday start) and before yesterday.
  - `ENTITY_ICONS`, a map from entity type to a lucide icon, kept in the component file so `lib/` stays free of React
- **`components/activity/activity-screen.tsx`:**
  - pills as a `role="radiogroup"` row of toggle buttons
  - `useInfiniteQuery`, with the type read from and written to `?type=` via `router.replace`
  - day sections from `groupByDay` over all loaded pages
  - each row: `Avatar` initials, actor, sentence, icon, `<time>`
  - shared `ListSkeleton`, `EmptyState` and `ErrorState` (with Retry)
- **Kind colours:** existing tokens, with create → `--pass`, remove → `--fail`, change → the default foreground. They colour the sentence's verb span and a small dot. The verb text carries the meaning on its own, which is why "creations and restores" can share a colour.
- **No live updates for this screen.** It refetches on mount and window focus, which TanStack Query does by default.

### 7. Web: trash

- **`lib/trash-api.ts`:** `listTrash`, `restoreTrashItem`, and `trashKeys.list(projectId, type)`.
- **`components/trash/trash-screen.tsx`:**
  - type filter (the same pill row as the Activity screen, kept in `?type=`) and a row list
  - each row has its own `useMutation`, so one row's pending state or error never affects another
  - on success:
    - toast through `notifySuccess`: "Restored “Pay with card”", or "… with folder “Checkout”"
    - invalidate the trash and activity keys, the tree's `folderKeys` and test case keys, and the `executionKeys` and `bugKeys` list prefixes
  - on failure: `ActionError` under the row with the server's reason
- **`app/(app)/trash/page.tsx`:** the Admin gate, the same as Project Settings.
- **Shell:** Activity (`History` icon) goes in `NAV_LINKS`. Trash (`Trash2`) goes in `ADMIN_NAV_LINKS`, after Project Settings.

## Risks / Trade-offs

- [The feed's type filter scans the project's index range, filtering by `entity_type`. With a rare type in a large project, a page can touch many rows.] → This is acceptable at current volumes, and ADR 0007's partitioning work (B4) is where log scale gets handled. If needed, add an index `(workspace_id, project_id, entity_type, created_at DESC, id DESC)` with no API change.
- [The deleter-name lookup scans the project's log range for each trash entry (no `entity_id` index).] → This is the same access path the item histories already use (ADR 0021), multiplied by a trash that holds only 30 days of deletes. The same future index work applies.
- [The trash list has no paging.] → It is bounded by 30 days of deliberate deletes. If it grows, add `limit`/`before` with the same keyset cursor, keeping the shape.
- [A restore can race the purge on an item that is due.] → Row locks serialize them. Whichever commits first wins: the purge's `DELETE … WHERE still due` removes nothing a committed restore touched, and a restore after the purge finds no row (404).
- [Restoring a test case can bring back a large ancestor folder tree the Admin didn't expect.] → The success toast names every folder restored with it, and each one gets its own activity entry. This was accepted in ADR 0022 as the price of keeping deletions whole.
- [Clearing `deletion_id` loses which delete an item came from.] → The activity log keeps it (`folder.deleted` and `folder.restored` both record `deletionId`), and nothing else reads the column for live rows.
- [`daysLeft` is computed at request time, and the purge runs at 03:00 UTC.] → The row says "removed at the next cleanup" at 0 rather than promising a moment.

## Migration Plan

No schema change. It deploys like any API and web change. To roll back, revert the code. Restored items stay restored, which is correct data either way.
