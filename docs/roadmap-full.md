# Implementation Roadmap — Full Product

Consolidated from [PRD.md](../PRD.md) and ADRs [0001](adr/0001-tech-stack.md)–[0007](adr/0007-activity-log-and-trash-purge.md), as of 2026-10-23. This is the build order for the complete product. See [roadmap-mvp.md](roadmap-mvp.md) for a narrower, faster path to a demoable slice that feeds into this same order without rework.

Ordering principle: anything cross-cutting that every later feature depends on (tenant isolation, the activity log, authorization) is built once, correctly, before any feature table — retrofitting these after features exist means auditing every query and mutation already shipped. Feature work then follows the domain's own dependency graph.

**Status after the MVP (reconciled 2026-10-26):** [roadmap-mvp.md](roadmap-mvp.md) Phases 0–9 are complete and built most of this roadmap's foundation and core domain. Each phase below keeps its original plan and adds its status (✅ Complete, 🚧 Partly done, ⬜ Not started), what the MVP covered (by MVP phase — **the two roadmaps number phases independently**), and what remains. Future work is scoped as "Phase N remainder" from those lists; a slice that closes one is recorded under its phase the same way roadmap-mvp.md records slices (OpenSpec change, Built, Key decisions, Deferred).

**Suggested order for the remaining work:** Phase 4 remainder (no new infrastructure) → Phase 0 B2 decision → Phase 6 (unblocks invitations, Trash purge, Health Score job, live updates) → Phase 3 and 7 remainders → Phase 9 → Phase 8 attachments (after E3) → Phases 10–12.

---

## Phase 0 — Lock in mechanism decisions 🚧

Settle before writing code, since changing these later touches everything built on top of them. See [open-questions.md](open-questions.md) for full context; decide each with an ADR per the project's usual workflow.

- **B1** — Prisma tenant-context mechanism (extension vs. explicit transaction helper).
- **A2** — Bearer token vs. cookie auth; SSE auth approach (native `EventSource` can't send `Authorization`).
- **E1 / E2 / E3** — Postgres host, compute host, object storage.
- **E4** — Region / data residency.
- **B2** — Queue library (pg-boss vs. Graphile Worker). ✅ [ADR 0018](adr/0018-queue-library.md): Graphile Worker.

- **Covered by MVP Phase 0:** B1 → [ADR 0008](adr/0008-tenant-context-implementation.md); A2 (bearer token; SSE client reuses it) → [ADR 0009](adr/0009-api-authentication-transport.md).
- **Remaining:** E1–E4 (hosting, storage, region), needed before deploying and before Phase 8 attachments (E3); not needed for local development.

## Phase 1 — Monorepo scaffold ✅

pnpm workspace per [readme §2.3](../readme-GR.md): `apps/web` (Next.js), `apps/api` (NestJS), `apps/worker`; `packages/shared-types`, `packages/config`, `packages/reporting`; `prisma/`. Docker-compose for local Postgres with the two DB roles (migration role, `railgun_app`) from ADR 0003/0007. Minimal CI (lint, typecheck, test placeholder).

- **Covered by MVP Phase 1:** npm workspaces instead of pnpm ([ADR 0010](adr/0010-monorepo-layout.md)); `apps/api`, `apps/web`, `apps/worker` (placeholder), `packages/*`; docker-compose Postgres 16 with the migrator/app roles; CI (lint, typecheck, test).
- **Remaining:** none.

## Phase 2 — Database foundation ✅

Built before any feature table — this is the layer every later phase depends on.

- Base migration: `workspace`, `user`, `project`, `membership`.
- RLS policy pattern + tenant-context helper, proven end-to-end on one table (resolves the B1 spike).
- `activity_entries` table, `ActivityLogger.log(tx, …)`, the immutability trigger, revoked `UPDATE`/`DELETE`/`TRUNCATE` privileges (ADR 0007).
- CI check: fails if a `workspace_id` table lacks a forced RLS policy.
- Cross-tenant test harness (workspace A vs. B), reused by every feature's tests from here on.

- **Covered by MVP Phase 2:** all of it: base schema, forced RLS + `withTenantContext`, append-only `activity_entries`, `db:check-rls`, cross-tenant harness.
- **Remaining:** none.

## Phase 3 — Auth & authorization skeleton 🚧

- Clerk integration (sign-up, sign-in, session) — ADR 0002.
- `users` mirror table; atomic user+workspace+Owner-membership transaction.
- Authorization policy module (NestJS guards): workspace role × project role matrix.
- Project membership CRUD.
- Invitation model + accept/decline/revoke/resend (§3.3).

- **Covered by MVP Phase 3:** Clerk sign-up/sign-in, atomic user + workspace + Owner provisioning, the role-combining policy module and guards (`project-authorization`).
- **Remaining:** project membership CRUD (add, change role, remove); the invitation model and flows (§3.3), which need A1 (email provider) and Phase 6's email job to deliver them. A3–A5 stay open until then.

## Phase 4 — Core domain CRUD: Project, Folders, Tags, Test Cases 🚧

First real vertical slice — no lifecycle state machine, no secrets, no real-time. Folder tree (3-level, drag/reorder via position keys) built here while low-stakes, since F6 flags it as one of the hardest UI pieces and nothing downstream depends on it yet. Resolves G2 (status transitions) and G3 (tag management).

- **Covered by MVP Phases 4 and 9:** test case authoring and deletion; the folder tree, nested **4** levels (PRD §2.3 amended), with drag-and-drop ordering on fractional keys ([ADR 0014](adr/0014-drag-and-drop-and-ordering.md)); the New Test Case modal. G2 resolved as already built ([ADR 0015](adr/0015-test-case-status-changes.md)), except that status changes aren't activity-logged yet.
- **Remaining** (decided 2026-10-26: tags first, projects later; tag rules in [ADR 0016](adr/0016-tag-management.md)):
  - **Slice 1: Tags on test cases ✅** (OpenSpec change `test-case-tags`, archived 2026-10-27)
    - **Built:**
      - Migration `0011_tag`: `tag` (unique name per project ignoring case, eight-colour palette check) and `test_case_tag`, both with forced RLS.
      - `/projects/:projectId/tags`: list with test case counts, create (default colours rotate), rename/recolour, and Admin-only permanent delete. A duplicate name returns 409.
      - Test cases carry `tagIds`, set on create and update.
      - Test case create, update (a diff of status, name, "script changed", and tags added/removed) and delete are now activity-logged, closing ADR 0015's gap.
      - Web:
        - tag badges with palette tokens for light and dark mode
        - a searchable tag picker with create-on-type, in the test case detail and the New Test Case modal
        - a Tags filter on the tree ("any of"; dragging pauses while it's on)
        - the Manage tags dialog: rename and recolour for Contributors, delete for Admins after a confirmation stating how many test cases carry the tag
    - **Key decisions / discoveries:**
      - The picker sends the full tag set (one write path, one diff, one log entry) rather than per-tag add/remove routes.
      - shadcn `popover` and `command` were added (and `cmdk`).
      - `logTreeActivity` was widened to tags rather than adding a third logging helper.
      - Manage tags is an interim home: it moves to a project settings page later (Phase 11, ADR 0016).
      - Tags in the New Test Case modal were added at the user's request during implementation.
    - **Deferred / out of scope:** tags on bugs and the Executions/Bugs tag filters (Slice 2); tag badges in tree rows; tags in the demo seed; G5 (concurrent edits: the full-set write means last write wins).
  - **Slice 2: Tags on bugs + list filters ✅** (OpenSpec change `bug-tags-and-filters`, archived 2026-10-27)
    - **Built:**
      - Migration `0012_bug_tag`: adds `bug (id, workspace_id)` unique (it was missing) and `bug_tag` with forced RLS.
      - Bugs carry `tagIds`, set when filed (manually or from a run) and on edit; activity entries name the tags. Auto-created bugs start untagged.
      - Tags report `bugCount`; deleting a tag removes it from bugs and logs `{testCases, bugs}`.
      - The executions list reports the tags its test cases carry now.
      - Web:
        - the shared `TagsField` in the test case and bug details
        - a Tags field in New Bug / File bug
        - a Tags filter on the Bugs list (with Manage tags) and on the Executions list (without it)
        - Manage tags shows "N test cases · M bugs" and names both counts in the delete confirmation
    - **Key decisions / discoveries:**
      - Tag writes for test cases and bugs share `setItemTags` (`src/tags/tag-queries.ts`), which validates and writes only the difference.
      - Tag counts use scalar subqueries, since joining both carriers would multiply rows.
      - Executions match on their test cases' current tags, not tags at the time they ran.
      - A bug tag filter goes slightly beyond PRD §6.4.2's filter list, justified by §2.4 and ADR 0016.
    - **Deferred / out of scope:** historical (run-time) tags; tags on auto-created bugs; tags in the demo seed; moving Manage tags to a settings page (Phase 11).
  - **Slice 3: Projects ✅** (OpenSpec change `project-management`, archived 2026-10-27)
    - **Scope:** create projects (Workspace Owners), rename them (Project Admins, in Project Settings › General), a project switcher in the sidebar, delete with a 30-day trash and Restore from Workspace Settings › Projects, and workspace rename. The last live project can't be deleted. The active project is remembered on the server ([ADR 0017](adr/0017-active-project.md)).
    - **Deferred / out of scope:**
      - Workspace Settings › Members and Transfer Ownership; Project Members (Phase 3 remainder)
      - several workspaces per user and the workspace switcher (needs invitations)
      - New Project offering to add an environment, as an optional step (PRD §7.5 step 4); for now it asks only for a name
      - Execution Defaults on Project Settings (Environments: see Phase 5, Project Settings › Environments)
      - purging projects after 30 days in the trash (Phase 6)
  - G5 (concurrent edits) stays open.

## Phase 5 — Environments & Secrets ✅

Envelope encryption (ADR 0004), `KeyProvider` interface, reveal endpoint with same-transaction audit logging and rate limiting. Self-contained; get it right in isolation before executions reference it.

- **Covered by MVP Phase 5:** envelope encryption with a `KeyProvider`, environment + credential CRUD, audited and rate-limited reveal.
- **Remaining:** key/DEK rotation and a KMS-backed `KeyProvider` (ADR 0004's explicit "later"); C1 (where the master key lives in production) and C2 (re-mask after reveal), decided with hosting.
  - **Project Settings › Environments ✅** (OpenSpec change `project-settings-environments`, archived 2026-11-25)
    - **Scope:** the web screen for the API above: an Environments section in Project Settings (Admins) listing each environment's name, base URL, default browser and credential count; an editor dialog to add and edit environments and their credentials (blank password keeps the stored one), with field checks, server errors in the dialog, and Reveal password through the audited reveal, forgotten on close; delete with a confirmation; changes reach the New Execution picker and the execution's environment panel without a reload. Web only, no API or database change.
    - **Out of scope:** Execution Defaults; the add-an-environment step in New Project (PRD §7.5 step 4); live updates for environments; C2 beyond forgetting a revealed password when the dialog closes.
    - **Key decisions / discoveries:** the list keeps the API's order (oldest first), as the New Execution picker does; an environment may have no credentials, as the API allows; the base URL and email formats are checked in the browser only, since the API accepts any non-empty text; duplicate environment names stay allowed, an ambiguity in the picker noted but not decided; an edit sends the whole credential list in one PATCH, so one activity entry records it; the query keys live in `lib/environment-keys.ts`, so tests that mock `environments-api` keep working; concurrent edits stay last-write-wins (G5).
    - **Tests:** web 629 (21 new: section, delete, editor add, edit and reveal, settings screen).
    - **Manual run:** checked in the browser by the user: add, edit, reveal, activity entries, the New Execution picker, and an execution keeping a deleted environment's name.

## Phase 6 — Background jobs & real-time infra 🚧

- Graphile Worker queue ([ADR 0018](adr/0018-queue-library.md)), worker process, transactional enqueue (job in the same transaction as the triggering change, through the allow-listed enqueue wrapper).
- SSE stream endpoint + auth (fetch-based client), channels per execution and per user.
- Email job — unblocks Phase 3's invitations actually being delivered.

Needed before Phase 7, which depends on both the live-update channel and a proven job pattern.

- **Covered by the MVP:** nothing. The MVP polls (5 s while an execution is live, ADR 0005/0011) and has no jobs.
- **Remaining:** the email job (Slice 3, needs A1). Slices 1 and 2 below are done; SSE replaced polling inside the existing data hooks, with no API contract change (roadmap-mvp.md "What's safe to cut").
  - **Slice 1: Queue and worker ✅** (OpenSpec change `background-jobs`, archived 2026-10-27)
    - **Scope:** Graphile Worker installed by the migrate step, a least-privilege `railgun_worker` role, the allow-listed `enqueue_job` wrapper (transactional enqueue), the first worker code in `apps/worker`, and the daily `trash_purge` job (ADR 0007: items in the trash over 30 days, removed in dependency order with one system activity entry each).
    - **Deferred / out of scope:**
      - SSE live updates (slice 2)
      - the email job (slice 3; needs A1)
      - enqueueing jobs from API routes (no route needs one yet)
      - deleting bug images on purge (attachments are Phase 8)
      - where the worker runs when deployed (E1–E2)
  - **Slice 2: SSE live updates ✅** (OpenSpec change `sse-live-updates`, archived 2026-11-10)
    - **Built:**
      - **Emitting:** execution create, edit, delete, run move, lifecycle transitions and run outcomes emit `execution.changed`. Bugs filed from a run, auto-created, linked, or edited or deleted while linked emit `run.bugs.changed`. Both go through `pg_notify` in the change's own transaction (`src/realtime/live-event.ts`), so a refused or rolled-back change sends nothing.
      - **Listener:** `LiveEventsService` keeps one `LISTEN` connection per API process on `REALTIME_DATABASE_URL` (defaults to `DATABASE_URL`). It fans events out per project, reconnects with backoff, sends `resync` after a reconnect, and runs a keepalive.
      - **Stream:** `GET /projects/:projectId/events` checks the bearer token and Viewer role at open, checks the workspace on every event, sends a 25 s heartbeat, and closes after 5 minutes so access is checked again.
      - **Web:**
        - an in-house fetch-based SSE reader (no new dependency)
        - `LiveUpdatesProvider` in the app layout: one stream per tab for the active project, backoff reconnect, a 60 s silence timeout, and a refetch after every reconnect
        - the Executions detail and list poll only while the stream is down
    - **Key decisions / discoveries:**
      - One project-scoped stream carries both of ADR 0005's channels. Execution access is exactly project access, and the client applies the events it has cached (ADR 0005 records this).
      - A raw Express response, not `@Sse()`, so the stream can write heartbeat comments and close itself.
      - `autoCreateBugForRun` now reports whether it created a bug, so failing a run twice announces the bug once.
      - The listener and controller are registered in the flat `AppModule`, not a separate module.
      - The secrets e2e suites need `SECRETS_MASTER_KEY` in the shell, since tests never load `.env`.
    - **Deferred / out of scope:**
      - the per-user channel (invitations, Phase 3 remainder)
      - live updates for the Bugs list, Test Cases tree and tags
      - console and step streams (automated engine)
      - report-ready notifications (Phase 10)
      - fan-out tested beyond one API instance (E1–E2)

## Phase 7 — Test Execution lifecycle 🚧

The readme's three example tickets, in their documented order:

1. **DB** — `test_execution` / `test_run` schema: timer fields (`elapsed_ms_accumulated`, `last_resumed_at`), snapshot columns, RLS, constraints.
2. **Backend** — `run-all` / `pause` / `resume` as a transactional domain state machine; later, mark-ready / back-to-draft / cancel / completed / sign-off / try-again.
3. **Frontend** — execution header (live timer, lifecycle buttons by role, SSE subscription), runs table, run detail side panel, console drawer placeholder.

Resolves G6 (what makes an execution Completed) and G7 (Try Again semantics).

- **Covered by MVP Phases 7 and 9:** schema with timer and snapshot fields; Draft → Ready → In Progress ⇄ Paused → Completed → Done with role rules; manual outcomes; automatic completion and sign-off rules ([ADR 0012](adr/0012-execution-completion-and-sign-off.md), resolves G6); Executions screen with live timer (polling), run panel, environment panel; folder-tree picker and drag-and-drop run ordering.
- **Remaining:** automated-mode placeholder; console drawer, step results, traceability graph; Executions dashboard (Phase 9 Slice 5) and report downloads (Phase 10); curated locale/timezone lists (G9).
  - **Slice 1: Cancel and Try Again ✅** (OpenSpec change `execution-cancel-and-try-again`, archived 2026-11-23)
    - **Built:**
      - Migration `0015_execution_attempts`:
        - `test_execution.attempt`, and `test_run.outcome_updated_by_name`
        - `test_run_attempt`, with forced RLS; its run and test case links are set to null rather than cascaded
        - `bug.attempt`, backfilled to 1 for bugs linked to a run, and required whenever a bug has a run
        - the auto-bug index moved to `(test_run_id, attempt)`
      - **Cancel** (`POST …/cancel`, [ADR 0019](adr/0019-execution-cancel.md)): Contributor+, from In Progress or Paused. The timer stops, Pending runs stay Pending, and outcomes lock.
      - **Restart** (`POST …/restart`, [ADR 0020](adr/0020-execution-try-again.md)):
        - from Completed, Done or Canceled; restarting Done needs an Admin
        - one transaction under the execution's row lock
        - every run's result is copied into attempt history, runs whose test case was deleted are dropped, positions close up, everything else resets, and the execution goes back to Ready at the next attempt
        - refused when no runs would be left
      - **Attempt history:** `GET …/runs/:runId/attempts`, newest first.
      - **Responses:** executions report `attempt`, runs report `testCaseStatus`, and bugs report `attempt`.
      - **Bugs:** filing, linking and auto-create record the current attempt, so a run that fails again after a Restart gets a new auto-created bug.
      - **Web:**
        - Cancel and Try Again on the detail view, with confirmations
        - Restart's confirmation names the runs it will drop
        - Duplicate opens the New Execution form pre-filled ("<name> (retry)", same settings, eligible test cases selected, a "Not carried over" note)
        - an "Attempt N" badge in the header
        - the run panel lists earlier attempts and groups bugs by attempt
    - **Key decisions / discoveries:**
      - `Transition.from` became a list, so Cancel fits the table.
      - Every table-driven transition now locks the execution and reads its status before the guarded `UPDATE`, so Cancel logs which status it left.
      - Restart has its own handler, because its role depends on the source status.
      - Duplicate is client-only and reuses the create endpoint.
      - Outcome authors are stored by name, because user rows aren't readable across users under RLS (ADR 0013 decision 6).
      - The bug backfill lifts `FORCE ROW LEVEL SECURITY` for one statement, as migration 0010 does.
      - The demo seed and the worker test fixtures now set `attempt` on bugs linked to runs.
      - Trash purge needed no code change: the FK cascades cover the new table.
    - **Deferred / out of scope:**
      - the execution activity panel
      - removing individual runs from a Draft
      - "add to existing execution"
      - a Restart limited to failed runs
      - live updates for the Bugs list
      - showing a dropped run's attempts anywhere
      - recording which execution a duplicate came from
      - the traceability graph
      - attempt data in reports (Phases 9–10)
  - **Slice 2: Execution history and Draft runs ✅** (OpenSpec change `execution-history-and-draft-runs`, archived 2026-11-23, [ADR 0021](adr/0021-execution-history-and-draft-run-changes.md))
    - **Built:**
      - **History reads:** `GET …/executions/:id/activity` and `GET …/bugs/:id/activity`, Viewer+, newest first, 20 per page with an opaque keyset cursor (`before`).
        - An execution's history combines its own entries, its runs' entries (matched on `details.executionId`) and every entry of the bugs currently linked to its runs.
        - The readers live in `common/activity-log-reader.ts`. No migration.
      - **Draft runs:**
        - `POST …/executions/:id/runs` adds a Ready test case as the last run; 409 if it's already there.
        - `DELETE …/executions/:id/runs/:runId` removes a run and renumbers; 409 on the last run.
        - Both are Draft only and Contributor+, are logged (`test_execution.run_added` / `run_removed`) and emit `execution.changed`.
      - **Environment logging:** `environment.created`, `environment.updated` and `environment.deleted`.
        - Edits record changed fields (from → to) and credential aliases added, changed and removed. Nothing is written when nothing changed, and passwords never appear.
        - This closes Phase 5's logging gap.
      - **Web:**
        - `lib/activity-format.ts` turns every logged action code into a sentence, falling back to the raw code. A test lists all codes.
        - `ActivityHistory` component, with a History section on the execution and bug details.
        - A remove button on Draft run rows.
        - The test case's Run is now a menu: "New execution" or "Add to existing execution…", whose dialog marks Drafts that already hold the test case.
    - **Key decisions / discoveries:**
      - History query keys sit under each item's detail key. `useApplyExecution` now also refetches everything nested under an execution's detail (history, run attempts), so the user's own changes don't depend on the live stream. That fixes stale attempt lists from Slice 1 too.
      - `run.bugs.changed` also refreshes the execution's history.
      - An outcome and its auto-created bug share one transaction's timestamp, so their order in History is arbitrary.
      - `canReorderRuns` became `canEditDraftRuns`.
      - The add dialog reads each Draft's detail to find the ones holding the test case, sharing the Executions screen's cache.
    - **Deferred / out of scope:**
      - the project-wide Activity screen and the Overview's recent history (Phase 9)
      - an index on activity `details`, if logs grow
      - a server-side filter for Drafts that don't hold a test case, if Drafts pile up
      - the traceability graph

## Phase 8 — Bugs 🚧

Bug CRUD, image attachments (S3/R2 presigned, server-side validation per F8), linked run/test case snapshots, auto-create-on-failure (resolves G8). Depends on Executions (run linkage) and Secrets/storage.

- **Covered by MVP Phase 8:** bug CRUD, run/test case snapshots with failed step, auto-create on failure (G8) and status rules (G4), both in [ADR 0013](adr/0013-bug-lifecycle-and-auto-creation.md); Bugs screen and run-panel bug links.
- **Remaining:** image attachments (needs E3 and F8); tags on bugs (after Phase 4's tags); Bugs dashboard (Phase 9 Slice 6) and its PDF (Phase 10); unlinking or moving a bug between runs.

## Phase 9 — Activity feed UI, Trash UI, Dashboards ✅

- Activity log backend has existed since Phase 2; build the filterable, paginated feed UI.
- Trash list/restore UI and the daily purge job (ADR 0007) land together.
- Health Score snapshot job (resolves B3) and the Overview dashboard KPIs/charts, since they aggregate everything built in prior phases.
- The Test Cases, Executions and Bugs dashboard views (PRD §6.2.4, §6.3.6, §6.4.4), on the same metric definitions (PRD §6.12).

- **Covered by the MVP:** the data only. Every mutation is activity-logged, and deleted items keep `deleted_at` / `deletion_id`. The demo seed (MVP Phase 9) gives realistic history to build these screens against. The MVP's optional stats readout was dropped.
- **Remaining:** none. Slices 1–6 below built the Activity and Trash screens, then the four dashboards (PRD §6.1, §6.2.4, §6.3.6, §6.4.4, on the shared definitions in §6.12); Slice 3 settled F6 (ADR 0023) and B3 (ADR 0024). The dashboard PDFs, their Download buttons and their activity entries are Phase 10. Smaller follow-ups stay in each slice's Deferred list, such as live updates for the dashboards.
  - **Slice 1: Activity and Trash ✅** (OpenSpec change `activity-and-trash`, archived 2026-11-24, [ADR 0022](adr/0022-trash-restore.md))
    - **Built:**
      - **Feed:** `GET /projects/:projectId/activity` (Viewer+), newest first, 20 per page with the item histories' keyset cursor. `?type=` takes the PRD §6.6 pills, matched on `entity_type`: `environments` covers password reveals, and deletes, restores and purges count under their item's type. Workspace entries are excluded.
      - **Trash list:** `GET /projects/:projectId/trash` (Admin; Workspace Owners implicitly). One entry per deletion, using the purge's own predicates: a bug, an execution, a test case deleted on its own, or a folder delete with its folder and test case counts. Each entry has who deleted it, `purgeAfter` and `daysLeft`, and `?type=` filters it.
      - **Restore:** `POST /projects/:projectId/trash/:type/:id/restore` (Admin), one transaction. A folder delete comes back whole, along with the deletions of every trashed ancestor folder. An item returns to its old position, or goes last if that place is taken. Restored rows get `deletion_id` cleared. Name clashes, the 4-level depth limit and a second auto-filed bug for the same run attempt are refused with 409, and nothing is restored. Each restored deletion gets its own `<type>.restored` entry (`restoredWith` on ancestors). Restored executions emit `execution.changed`, and linked bugs emit `run.bugs.changed`.
      - **Web:**
        - the Activity screen (`/activity`): pills in `?type=`, day headings, initials, sentences coloured by kind, entity icons, Load more
        - the Trash screen (`/trash`, Admins): a type filter, the days left (or "Removed at the next cleanup"), and Restore per row, with a toast naming any folders that came back and refusal reasons on the row
        - sidebar links: Activity for everyone, Trash after Project Settings for Admins
      - **Tests:** API e2e (`activity-feed`, `trash`) and two worker purge tests showing restored rows aren't purged with their old deletion.
    - **Key decisions / discoveries:**
      - [ADR 0022](adr/0022-trash-restore.md): the trash unit is the purge's unit, a trashed parent comes back with its whole deletion, and clashes are refused rather than renamed.
      - The deleter's name comes from the item's latest delete entry in the activity log. RLS lets a user read only their own `user` row, and the log also keeps the name as it was at delete time.
      - Another workspace's member gets 403 on the feed, not 404: the project role guard answers 403 for any project the caller has no role on.
      - The depth check runs after the restore's update, since `subtreeHeight` counts only live rows. A failure throws and rolls the whole restore back.
      - The Trash filter reuses the Activity pill row instead of a dropdown, which is also testable in jsdom.
      - Manual run: the API flow was checked end to end with a real Clerk session, against a seeded project with four deletions. The browser walkthrough was signed off by the user.
    - **Deferred / out of scope:**
      - the Overview dashboard, its Recent History feed and the Health Score job (next slices)
      - live updates for the Activity and Trash screens
      - links from activity entries to their items
      - emptying the trash or deleting an item permanently by hand (the PRD has neither)
      - trashed items in the demo seed
      - an `entity_id` index on the activity log, if the feed filters or deleter lookups slow down

  - **Slice 2: Dashboard metrics and the Overview without charts ✅** (OpenSpec change `overview-dashboard`, archived 2026-11-25)
    - **Built:**
      - **Resolution date:** migration `0016_bug_resolved_at` adds `bug.resolved_at`, with a check that a date is set exactly when the status is Resolved, Closed or Won't Fix. Existing bugs were backfilled from their logged moves into the resolved set, falling back to `updated_at`. `PATCH` sets the date on entering the set, keeps it within, and clears it on leaving. Bug responses report `resolvedAt`, and the seed writes it.
      - **Overview stats:** `GET /projects/:projectId/overview` (Viewer+) returns, in one read and one transaction:
        - total test cases with the Ready share, coverage, the 30-day pass rate (counting Needs Review; null with no runs), active runs, open bugs and open critical bugs
        - the Health Score with its band and four components ("no data" with no completed run)
        - up to 6 Top Failing Tests (3 or more completed runs and a failure, ordered by exact fail ratio) and up to 6 Urgent Bugs

        Trashed items, runs of deleted executions and earlier attempts never count.
      - **Web:**
        - `/overview`: a header with the project, seven tiles with info tooltips and the band colour, Top Failing Tests and Urgent Bugs linking to the item in a new tab, and Recent History (10 entries) with a Full History dialog reusing the Activity feed
        - Overview is the first sidebar link and the landing page
        - every app screen now requires a session (a public list: `/`, sign-in/up and static files)
    - **Key decisions / discoveries:**
      - The metrics live in `apps/api/src/overview/`: pure formulas in `overview-metrics.ts`, SQL counts in `overview-queries.ts`. No app imports a workspace package yet and the API's `rootDir` is `src`, so the move to `packages/reporting` waits for Phase 10's worker.
      - The score is computed from the rounded components, so the components shown always reproduce it.
      - "Last 30 / 14 days" on the KPIs is rolling from the database clock. Calendar days in the viewer's time zone are only for trend charts.
      - Runs of a trashed test case stay in their execution's pass rate (PRD §2.11), but drop out of coverage and Top Failing Tests.
      - The backfill lifts FORCE RLS on `bug` and `activity_entries` within the migration's transaction, as `0010` did.
      - Until now, the session check guarded only `/test-cases`; the other screens relied on the API's 401.
      - A flaky trash test from Slice 1 (expecting no live event at all) now counts only its own workspace's events.
    - **Manual run:** checked against the running app with a real Clerk session on the seeded project:
      - signed out, `/overview` and `/executions` redirect to sign-in
      - the KPIs match the Bugs, Executions and Test Cases data
      - the Health Score is 62, At Risk (components 71 / 52 / 59 / 54)
      - every resolved bug has a date
      - the feed pages without overlap

      The browser walkthrough (landing, the links' new tabs, the Full History dialog) was not run; the user asked to tick the task without it.
    - **Deferred / out of scope:**
      - the four charts and the Health Score history (Slice 3)
      - the per-screen dashboard views (Slices 4–6)
      - the Overview PDF (Phase 10)
      - live updates for the Overview
      - showing the resolution date on the Bugs screen
      - switching project still opens Test Cases (project-management spec); revisit together with the landing page
      - Top Failing Tests is empty on the seed, since no seeded test case has 3 completed runs; more seeded runs would show the panel
  - **Slice 3: Charts and Health Score history ✅** (OpenSpec change `overview-charts`, archived 2026-11-25, [ADR 0023](adr/0023-chart-rendering.md), [ADR 0024](adr/0024-health-score-history.md))
    - **Built:**
      - **`packages/reporting`** is the first workspace package an app imports. It is compiled to `dist/` by a root `postinstall`, watched by `npm run dev`, and imported by the API, worker and web. It holds:
        - the Health Score formulas, moved from the API
        - `AS_OF_COUNTS_SQL` with `figuresFromCounts`: one counting query for any list of instants, used by the live Overview, the daily snapshot and recomputed past days
        - line and donut chart geometry (scales, nice ticks, date ticks, paths, arcs) and a static SVG writer within ADR 0023's element subset

        It has 32 unit tests.
      - **Snapshots:** migration `0017_health_snapshot`, one row per project per UTC day, with forced RLS. The app can read it; the worker can read it and insert into it, and gets `SELECT` on `test_run`. The `health_snapshot` crontab task runs at `15 0 * * *` with `?fill=1d`. It labels the day by `_cron.ts`, inserts with `ON CONFLICT DO NOTHING`, gives each project its own transaction, and fails the job if any project failed. A project purge cascades to its snapshots.
      - **`GET /projects/:projectId/overview/trends?tz=`** returns 90 days at once:
        - run and bug counts per calendar day in the caller's zone, which is validated against `pg_timezone_names`
        - the Health Score per UTC day, from a snapshot, recomputed, or live for today
        - the 30-day outcome split
      - **Web:**
        - `components/charts/`: `LineChart` (its own 7/15/30/90-day range, ←/→/Home/End and hover readout, legend toggles, a one-sentence summary for screen readers, theme colours) and `DonutChart` (centre total, legend counts with percentages, zero parts hidden)
        - the Overview's four charts in the PRD §6.1 rows
    - **Key decisions / discoveries:**
      - The package is compiled, not consumed as source: the API and worker production builds only compile their own `src`. ADR 0023 decision 6 is amended accordingly.
      - Past days exclude items in the Trash today, as every dashboard does (PRD §2.11). Snapshots keep what they recorded.
      - Stacked bars and the word cloud moved to Slices 5 and 6, their first users.
      - The Pass Rate series uses the shared `pct` rounding, with 0 on days without runs.
    - **Known issue (recorded 2026-11-25, left as is at the user's request):** the worker test `trash-purge.spec.ts` › "runs as the trash_purge job" is flaky. Graphile Worker's `runOnce` returns on every other call while its job is still running, leaving the job locked, and the test checks the result straight after. It reproduces with a task list holding only `trash_purge`, so it predates this slice. The likely fix is to loop `runOnce` until the queue is empty. Everything else passed: API 483, worker 31 of 32, web 493, package 32, plus lint, typecheck and the API and worker builds.
    - **Manual run:** not done; the user asked to tick the task without it. Covered by automated tests only.
    - **Deferred / out of scope:**
      - stacked bars and the word cloud (Slices 5 and 6)
      - the dashboard PDFs (Phase 10)
      - live updates for the charts
      - replaying past test case statuses for recomputed days (ADR 0024)
  - **Slice 4: Test Cases dashboard view ✅** (OpenSpec change `test-cases-dashboard`, archived 2026-11-25, [ADR 0025](adr/0025-test-case-health-and-edit-times.md))
    - **Built:**
      - **Edit times:** migration `0018_test_case_edit_times` adds `test_case.updated_at` and `script_updated_at`.
        - Existing rows are backfilled from their `test_case.updated` and `test_case.moved` entries, falling back to `created_at`.
        - Update sets them only when something changed, and move always does. Restore and folder changes leave them.
        - Reads report `createdAt`, `updatedAt` and `scriptUpdatedAt`.
      - **Health rules** in `packages/reporting/src/test-case-health.ts`: the PRD §6.12.3 thresholds, `TEST_CASE_FACTS_SQL` (one row of run facts per live test case) and the pure `testCaseHealth`. The flags are No Script, Orphan, Never Run, Dormant, Degrading, Improving and Trend Reset. The detail and every write's response carry `health`; the list doesn't.
      - **Dashboard read:** `GET /projects/:projectId/test-cases/dashboard?tz=` (Viewer+), declared above `:testCaseId`, in one transaction:
        - the tiles
        - 90 days of created, added, completed and passed counts in the caller's zone
        - the Last Run Outcome and Source Type splits
        - Needs Attention
        - Most Run, Top Failing, Top Flaky (a Pass after an earlier Fail or Needs Review attempt) and Top Tags
        - Folder Health
        - `failingBelowMinimum`, which the Overview also reports
      - **Web:**
        - the health banners on the test case detail
        - the dashboard as the default right panel, with a Dashboard toggle in the tree's toolbar
        - tiles, Test Cases Over Time and Pass Rate Trend (hidden without completed runs), the two donuts
        - the Needs Attention table: name filter, sortable columns, "Show N more"
        - the 2 × 2 rankings and Folder Health
        - the collapsible History panel
        - the Overview's tile and card moved to `components/dashboard/`
      - **Seed:** every test case has edit times. `card-3ds` and `wallet-paypal` get a logged script edit 6 days ago, after their last run, with earlier runs and the bug keeping the old script, so they show Trend Reset. Two signed-off regressions ("Auth regression", "Search regression") give the sign-in and search test cases a third completed run, so Top Failing lists three and reports two unranked. The seed has 8 executions.
    - **Key decisions / discoveries:**
      - The facts SQL lives in the package with the rules, so Phase 10's worker can reuse both for the PDF.
      - Daily run series count every run of a live execution, as the Overview's do, so the two Pass Rate charts agree. Test-case figures count live test cases only.
      - "Never Run" means two things: no completed run in the donut and Coverage, but added and none completed as an issue and a banner.
      - Clearing a script is a script edit, so a test case with earlier runs then shows both No Script and Trend Reset.
      - Found in review: on the demo data every failing test case had 1 or 2 completed runs, so both Top Failing panels were empty and read "No failing tests — nice!". The 3-run minimum stays; both panels now say how many failing test cases aren't ranked yet, and "— nice!" shows only when nothing has failed.
      - Needs Attention is filtered, sorted and paged in the browser, from one full list.
      - A Prettier run with the default config reformatted the untracked `overview-screen.tsx`. It was restored from the Next.js build cache's source map.
    - **Tests:** API e2e (`test-case-dashboard`, `test-case-health`, `test-case-edit-times-backfill`, extended `test-cases`, `overview` and `demo-seed`), package unit tests for the rules, and web tests for each widget. Results: API 520, web 526, package 43, worker 31 of 32. The one worker failure is the known flaky `trash_purge` job test recorded under Slice 3.
    - **Manual run:** not done; the user asked to tick the task without it. Covered by automated tests only.
    - **Deferred / out of scope:**
      - the dashboard PDF and its download button (Phase 10)
      - the run history table on the test case detail (PRD §6.2.3)
      - per-project thresholds (PRD §6.12.3)
      - AI confidence: Avg Confidence shows "—" until automated runs exist
      - live updates for the dashboard
      - seeding enough runs to show Degrading
  - **Slice 5: Executions dashboard view ✅** (OpenSpec change `executions-dashboard`, archived 2026-11-25)
    - **Built:**
      - **Dashboard read:** `GET /projects/:projectId/executions/dashboard?tz=` (Viewer+), declared above `:executionId`, in one transaction. It returns today's date in the caller's zone, one row per live execution (the list filter's fields and its completion day) and one row per current run of a live execution:
        - execution, position and test case name (as recorded at start)
        - current outcome and the day it was recorded
        - attempts (earlier attempts plus the current one) and live linked bugs
        - the failed step from a bug filed in the current attempt
        - created and last-updated times

        The browser scopes the rows with the list's filters and counts them. No migration.
      - **`packages/reporting`:**
        - `execution-dashboard.ts`: the list filter (`filterExecutions`, `carriesAnyTag`, moved from the web and re-exported there), the two row queries, the tiles, the 90-day series and the splits, the runs-table filters and sort, and `ExecutionReportOptions` for Phase 10's PDF
        - `charts/stacked-bar.ts` with `stackedBarChartSvg`, and `donutChart`'s `sort: 'count'`
      - **Web:**
        - charts: `StackedBarChart` (own range, legend toggles, hover and keyboard readout, selectable segments); `DonutChart` with selectable parts and `sortByCount`; `LineChart` and `StackedBarChart` take an optional controlled range
        - Executions screen: the dashboard as the default right panel with a Dashboard toggle; list filters kept by the screen, with a scope notice and Clear filters; the Canceled status filter; `?run=` opens a run's panel
        - the dashboard: four tiles; Executions Over Time, Runs Over Time, Execution Status (sets the list's status filter) and Run Outcomes; the runs table (Needs Attention and All Runs, layered filters, seven sortable columns, 50 rows at a time as the end scrolls into view, "N of M"); the export dialog with its switches and notice; the two-tab History panel
        - `DashboardHistory` takes tabs; with one tab it is unchanged
        - execution status colours as `--status-*` theme variables, light and dark
    - **Key decisions / discoveries:**
      - The API returns rows, not figures. The scope is the list's own filter, which runs in the browser, so every chart click is instant and there is one filter definition. Days are dated in SQL with the caller's zone, as on the other dashboards.
      - The dashboard query key sits outside the list key, so live events don't refetch it. It refetches every time it is shown.
      - Selecting a Run Outcomes part also switches the table to All Runs, beyond the PRD: on Needs Attention every other outcome would be empty.
      - Executions Over Time counts `completed_at`, which Restart clears and Cancel never sets.
      - Download PDF stays disabled ("PDF export is not available yet."), but the dialog already builds the report options.
      - The list's status filter was missing Canceled.
    - **Tests:** API e2e `execution-dashboard` (access, route order, time zones, trashed rows, restarts, bugs and the failed step, and the list and dashboard agreeing on a tag filter); package tests for the figures, runs table, stacked bars and donut order; web tests for the charts, list, screen, dashboard, runs table, export dialog and History tabs. Results: API 527, web 570, package 66, worker 31 of 32. The one worker failure is the known flaky `trash_purge` job test recorded under Slice 3.
    - **Manual run:** checked in the browser by the user.
    - **Deferred / out of scope:**
      - the PDF, enabling Download PDF, and its activity entry (Phase 10)
      - run duration and AI confidence: Avg Duration shows "—" until automated runs exist
      - live updates for the dashboard
      - list filters in the address
      - the traceability graph
      - server-side paging of the runs table, if projects outgrow loading every run at once
  - **Slice 6: Bugs dashboard view ✅** (OpenSpec change `bugs-dashboard`, archived 2026-11-25)
    - **Built:**
      - **Dashboard read:** `GET /projects/:projectId/bugs/dashboard?tz=` (Viewer+), declared above `:bugId`, in one transaction. It returns:
        - one row per live bug: id, title, severity, status, tag ids, created, updated and resolved times, and the days it was reported and resolved in the caller's zone
        - the tags carried by live bugs
        - `today` in the caller's zone and `now` from the database clock

        It covers the whole project; the list's filters don't apply. No migration.
      - **`packages/reporting`:**
        - `bug-dashboard.ts`: the three queries, and the pure tiles, 90-day Reported vs Resolved series (all and Critical), the four splits, Avg Resolution Time, tag counts and Needs Attention, plus `BugReportOptions` for Phase 10
        - `charts/word-cloud.ts` with `wordCloudSvg` and `TAG_PRINT_COLORS`: √count sizing, large and small words interleaved, an FNV-1a fallback colour, centred rows with estimated widths
      - **Web:**
        - `WordCloud` (hover and focus readout, screen-reader summary); `DonutChart` gains an info tooltip; severity, bug status and backlog age colours in `chart-format.ts`
        - Bugs screen: the dashboard as the default right panel, with a Dashboard toggle in the list header
        - the dashboard: the header with a disabled Download report ("PDF export is not available yet."), the four tiles, both Reported vs Resolved charts on one range, the four donuts, Avg Resolution Time beside Bugs by Tag, and the Needs Attention table, whose rows open the bug
      - **Seed:** four tags (`checkout`, `auth`, `payments`, `mobile`) on the bugs, carried by 3, 3, 1 and 1 of them, with `tag.created` entries and tags named in `bug.created`; and `order-email-currency`, an Open Medium bug reported 45 days ago and never updated, so it shows as Idle and Old.
    - **Key decisions / discoveries:**
      - As on the Executions dashboard, the API returns rows and the browser builds the figures with the package's rules, so the PDF can reuse them. Days are dated in SQL; rolling ages (Idle, Backlog Age) use the database clock in whole days, so exactly 30 days is Aging.
      - Bug status colours beyond the PRD's two: Open red, Closed dark green, Won't Fix muted grey ([design.md](../openspec/changes/archive/2026-11-25-bugs-dashboard/design.md) decision 8).
      - The Critical chart counts each bug by its current severity, and Resolved per day follows the current resolution date, so a reopened bug leaves its old day.
      - A tag name too wide for the cloud on its own is shrunk to fit.
      - Found while seeding: an existing project tag with a seeded name would break the unique-name rule, so the seed now refuses it with a conflict, as it does for the root folder name.
      - A project seeded before this slice keeps its old data on a rerun; the new rows show on a freshly seeded project.
    - **Tests:** API e2e `bug-dashboard` (access, route order, time zones, trashed and other-project bugs, resolution fields, tags) and extended `demo-seed` (dashboard figures, tag filter, tag entries, tag-name clash); package tests for the figures and the word cloud; web tests for the charts, the dashboard and the screen. Results: API 540, web 588, package 89, worker 31 of 32. The one worker failure is the known flaky `trash_purge` job test recorded under Slice 3.
    - **Manual run:** checked in the browser by the user.
    - **Deferred / out of scope:**
      - the PDF, enabling Download report, and its activity entry (Phase 10)
      - live updates for the dashboard
      - the resolution date on the bug detail
      - tags on seeded test cases
      - measured word widths, if the estimated layout crowds
      - the `demo-seed` "believable history" requirement is now over the 500-character strict-validation limit; split it in a change of its own if wanted

## Phase 10 — Reports (HTML / PDF) ⬜

Time-boxed spike first (D1: SVG chart fidelity, Japanese font coverage, PDF generation time for a large execution) before building. Shared data-assembly + chart module (ADR 0006), execution HTML/PDF, per-dashboard PDFs. The dashboard PDFs use Phase 9's metrics module and the on-screen ranges and filters, so a PDF always matches its screen (PRD §8). Built last among "real" features since it's a pure consumer of every other entity's trash-exclusion and secret-exclusion rules.

- **Remaining:** the six reports of PRD §8 and their job, storage and delivery (ADR 0006), rendered with pdfmake and the Noto fonts of [ADR 0026](adr/0026-report-rendering-library-and-fonts.md). Slice 1 settled D1. Report storage needs E3; images in reports need D2 and Phase 8 attachments; D3 (retention) is decided with storage.
  - **Slice 1: Rendering spike (D1) ✅** (OpenSpec change `report-rendering-spike`, archived 2026-11-25, [ADR 0026](adr/0026-report-rendering-library-and-fonts.md))
    - **Scope:** a throwaway harness outside the workspaces renders three sample PDFs (every chart type from `packages/reporting`'s SVG writers; Japanese, Portuguese and English text with monospace Gherkin; a 500-run, 100-bug execution) with pdfmake and with react-pdf. It measures time, memory and size, grades chart fidelity and glyph coverage, and presents a recommendation. The decision becomes ADR 0026 (library, fonts, the report job's time budget) amending ADR 0006, D1 moves to resolved, and the harness is deleted.
    - **Out of scope:** images and D2's caps; D3 retention; headless Chromium as a third option; building any report, the job, storage or the Download buttons.
    - **Outcome:** [ADR 0026](adr/0026-report-rendering-library-and-fonts.md), amending ADR 0006 and ADR 0023:
      - **pdfmake**, taking `packages/reporting`'s SVG strings unchanged. 500 runs took 1.0 s (median), 1.2 s cold and 348 MB, linear in run count. react-pdf took 13.5 s and 602 MB, faster than linearly, and loses Gherkin indentation and hyphenates Japanese.
      - **Fonts:** Noto Sans JP for body and chart text, Noto Sans Mono CJK JP for Gherkin. Both are subset on embed, so one Japanese line costs about 15 KB.
      - **Report job:** a 30 s timeout and about 350 MB per job. Reports must turn off remote URL fetching.
      - **Found in our own SVG writers,** to fix in a small change of their own before the first report: the word cloud assumes 0.6 em per character, so Japanese tags overlap, on screen too; and the last date label is clipped in print SVGs.
      - D1 is resolved. D2 and D3 stay open. The spike harness was deleted.
  - **Writer fixes ✅** (OpenSpec change `chart-writer-fixes`): word-cloud widths by character class, so Japanese tags no longer overlap (screen and print); date ticks anchored inside the plot, the last ending at its right edge; print SVGs label days "24 Nov". Checked in the browser by the user.
  - **Slice 2: Report pipeline and the Bugs dashboard PDF ✅** (OpenSpec change `report-pipeline`, archived 2026-11-25, [ADR 0027](adr/0027-report-storage-and-delivery.md))
    - **Scope:** `report` and `report_file` (migration 0019), `enqueue_job` gains `report_generate` (3 attempts); `POST`/`GET …/reports` and the file route (requester only, `report.downloaded` logged); the worker's `report_generate` (tenant context, `bugReportData` from `packages/reporting`, pdfmake in a worker thread with a 30 s limit, `report.changed` events, retries); expiry in the daily purge; the font fetch script; Download report enabled on the Bugs dashboard with Generating and failure states.
    - **Out of scope:** the other five reports; S3/R2 and signed links (E3); images (D2); a reports list; deleting a report by hand.
    - **Key decisions / discoveries:** controllers are registered directly (no feature modules); the API exposes `Content-Disposition` over CORS for the file name; the render thread is plain CommonJS copied into `dist`, and adds the page-number footer itself (functions can't cross into a thread); CI fetches and verifies the fonts but still runs no test suites.
    - **Tests:** API 550, web 599, package 105, worker 42 of 43 (the known flaky `trash_purge` job test, about one run in three).
    - **Manual run:** checked in the browser by the user.
  - **Slice 3: Executions dashboard PDF ✅** (OpenSpec change `executions-dashboard-report`, archived 2026-11-25)
    - **Scope:** report kinds become a registry (names and labels in `packages/reporting`, a validator per kind in the API, a builder per kind in the worker); the `executions-dashboard` kind with `ExecutionReportOptions` validated on request; migration 0020 (the kind check, worker SELECT on `test_run_attempt` and `test_case_tag`); `executionReportData` from the dashboard's scope, filter and sort functions; the PDF (filters, tiles, both charts for their ranges, both donuts, the executions and runs tables by switch); Download PDF live in the export dialog with Generating and failure states.
    - **Out of scope:** the Overview and Test Cases dashboard PDFs; the execution HTML/PDF report; images (D2); object storage (E3).
    - **Key decisions / discoveries:** the kind list (`REPORT_KINDS`, `REPORT_KIND_LABELS`) lives in `packages/reporting`, and the API's parsers and the worker's builders are `Record<ReportDbKind, …>`, so a new kind can't miss either; request bodies stay flat, so the Bugs request is unchanged; download entries now record only the kind (the Executions report has two ranges); the worker needed SELECT on `test_run_attempt` and `test_case_tag` (migration 0020); tag names in the filters are read at render time.
    - **Tests:** API 564, web 603, package 110, worker 45 of 46 (the known flaky `trash_purge` job test).
    - **Manual run:** checked in the browser by the user.
  - **Slice 4: Test Cases dashboard PDF ✅** (OpenSpec change `test-cases-dashboard-report`, archived 2026-11-25)
    - **Scope:** the Test Cases dashboard's queries and figures move from the API into `packages/reporting` (`test-case-dashboard.ts`, with Needs Attention's filter and sort), so the screen and the PDF share them; the `test-cases-dashboard` kind with `TestCaseReportOptions` (zone, both chart ranges, the Needs Attention filter and sort) validated on request; migration 0021 (the kind check only, as the worker already reads every table the dashboard does); `testCaseReportData` and the PDF (tiles, both charts for their ranges, both donuts, every matching Needs Attention row in the screen's order, the rankings, Folder Health); Download report in a new dashboard header, with Generating and failure states.
    - **Out of scope:** the Overview PDF and the execution HTML/PDF report; the dashboard's recent history in the PDF; images (D2); object storage (E3); live updates for the dashboard.
    - **Key decisions / discoveries:** the API's `loadTestCaseDashboard` is now a thin loader over the package's queries and `testCaseDashboardFromRows`, as `loadBugDashboard` is; the existing dashboard tests passed unchanged after the move. Its row type is `TestCaseNeedsAttentionRow`, since the Bugs dashboard already exports `NeedsAttentionRow`. The PDF lists every Needs Attention row matching the screen's filter, in its sort order, not only the first 10. The file's day is the dashboard's last day in the requester's zone. "The report couldn't be generated." moved to `lib/reports-api.ts`, shared by both dashboards. `report-generation`'s request requirement is now over the 500-character advisory length; splitting it is left for a change of its own.
    - **Tests:** API 574, web 608, package 126, worker 49 of 50 (the known flaky `trash_purge` job test, which passed on its own rerun).
    - **Manual run:** checked in the browser by the user; the PDF matches the screen.

## Phase 11 — Project Members / Workspace Settings / Profile polish ⬜

Backend logic mostly exists from Phase 3; this is UI plus remaining edge cases (ownership transfer, "Former member" attribution).

- **Covered by the MVP:** the user menu (theme, sign out) only.
- **Remaining:** all of it, after the Phase 3 remainder. Includes moving **Manage tags** (built in Phase 4 Slice 1 as a dialog opened from the Test Cases tag filter) to a project settings page, rules unchanged ([ADR 0016](adr/0016-tag-management.md) revisit trigger).

## Phase 12 — Hardening ⬜

Disabled-state placeholders for roadmap items (§9: automated execution engine, test generation, code generation, integrations, AI/LLM config). Full end-to-end suite across the journeys in §10. Observability (F1), finalized CI/CD (F2).

- **Covered by the MVP:** CI runs lint, typecheck and tests; API e2e tests cover every endpoint.
- **Remaining:** everything listed above.

---

**Why this order minimizes rework:** RLS, the activity log, and authorization sit under every feature, so Phase 2–3 are non-negotiable first. The folder tree (hardest UI) is pulled into the simplest domain slice rather than deferred into a harder one. Executions — the slice with the most concurrency and timer-math risk — is built last among core features, once logging, auth, secrets, and jobs are already proven, matching the dependency order the project's own example tickets assume.
