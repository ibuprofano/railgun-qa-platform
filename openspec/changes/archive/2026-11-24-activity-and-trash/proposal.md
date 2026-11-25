# Proposal

## Why

Phase 9 of [roadmap-full.md](../../../docs/roadmap-full.md) starts with two screens whose data already exists:

- **Activity:** every change has written an activity entry since Phase 2, but only single executions and bugs can read it back (ADR 0021). The project-wide Activity screen (PRD §6.6) is missing.
- **Trash:** test cases, folders, executions and bugs are soft-deleted, and the daily `trash_purge` job removes them after 30 days. Nobody can see or restore them in the meantime, so a mistaken delete is permanent in practice. Only projects can be restored today (Workspace Settings). The Trash screen (PRD §6.11) is missing.

Neither needs an open question settled. B3 (Health Score backfill) and the chart library (F6) only block the dashboards, which are a later slice of Phase 9. PRD §6.11 leaves two restore rules open. Both were decided for this change and will be recorded in a new ADR 0022:

- Restoring an item whose parent folder is in the trash restores the parent's whole folder-tree deletion.
- A restored folder whose name a live sibling now uses is refused, not renamed.

## What Changes

- **Project activity feed** (`GET /projects/:projectId/activity`): Viewer+. It returns the project's entries newest first, 20 per page, with the `before` keyset cursor the item histories already use. An optional `type` filter matches PRD §6.6's pills: Test Cases, Executions, Runs, Bugs, Folders, Environments, Projects, Tags. Workspace-level entries (no project) are not included.
- **Trash list** (`GET /projects/:projectId/trash`): Admin. One row per deletion, the same unit the purge removes:
  - an individually deleted test case, execution or bug
  - a folder-tree delete, with how many folders and test cases it took

  Each row has its type, name, who deleted it, when, and the days left before the purge. An optional `type` filter narrows the list.
- **Restore** (`POST /projects/:projectId/trash/:type/:id/restore`): Admin. It brings the item back where it was, with:
  - **its folder tree:** a folder-tree delete comes back whole
  - **its parent folders:** if a parent folder is still in the trash, every folder-tree deletion holding one of its trashed ancestors comes back too, in the same transaction
  - **refusals** (`409`, nothing restored):
    - a folder whose name a live sibling now uses (the reason names it)
    - a folder that would end up deeper than 4 levels, because its parent moved while it was in the trash
    - an auto-filed bug whose run attempt has since got another auto-filed bug
  - **logging and events:** each restored deletion writes a `<type>.restored` activity entry in the same transaction. Restoring an execution emits `execution.changed`. Restoring a bug linked to a run emits `run.bugs.changed`.
- **Web:**
  - **Activity screen** (`/activity`, every member): filter pills, entries grouped by day (Today, Yesterday, weekday names this week, then dates). Each entry shows actor initials, actor, the description coloured by kind of action, an entity-type icon and the relative time. "Load more" fetches older entries. It reuses the existing `activity-format` sentences, extended with the new `*.restored` codes.
  - **Trash screen** (`/trash`, Admins): a type filter, rows with what was deleted, by whom, when and the days left, and a Restore button. A refusal shows its reason. Success shows a toast and refreshes the Test Cases, Executions and Bugs data.
  - **Navigation:** Activity is a sidebar link for everyone. Trash is a link for Admins, next to Project Settings.

## Capabilities

### New Capabilities

- `trash-restore`: listing a project's trash and restoring an item from it, including folder trees, parent folders, conflicts, authorization and logging.
- `activity-screen`: the web Activity screen with its filters, day grouping and paging.
- `trash-screen`: the web Trash screen with its type filter, rows and Restore.

### Modified Capabilities

- `activity-log`: a project-wide feed read with a type filter, alongside the existing per-item histories.
- `live-updates`: restoring an execution emits `execution.changed`. Restoring a bug linked to a run emits `run.bugs.changed`.
- `web-app-shell`: navigation gains Activity for every member and Trash for Admins.

## Impact

- **API:**
  - `src/common/activity-log-reader.ts` gains a project feed reader with a type filter.
  - A new `src/trash/` module holds the trash queries, restore rules and controller, registered in `AppModule`.
  - `activity-history.ts` keeps its response shape for the feed.
  - No migration: `deleted_at`, `deleted_by` and `deletion_id` already exist, and `railgun_app` can already update them.
- **Worker:** no change. The purge's "re-check due in the same statement" already makes a restore that races the purge safe.
- **Web:**
  - new routes `app/(app)/activity` and `app/(app)/trash`
  - new `components/activity/activity-screen.tsx` and `components/trash/trash-screen.tsx`
  - new `lib/trash-api.ts`
  - `lib/activity-api.ts` gains the feed fetch
  - `lib/activity-format.ts` gains restore codes, an action kind and day grouping
  - `components/shell.tsx` gains the nav links
- **Docs:**
  - ADR 0022 records the two restore rules.
  - open-questions.md H1 notes that the trash endpoints exist.
  - roadmap-full.md Phase 9 records the slice.
- **Out of scope:**
  - the Overview dashboard, its Recent History feed and the Health Score job (Phase 9's next slices)
  - live updates for the Activity and Trash screens
  - links from activity entries to their items
  - emptying the trash or deleting an item permanently by hand (PRD has neither)
  - restoring projects, which stays in Workspace Settings
