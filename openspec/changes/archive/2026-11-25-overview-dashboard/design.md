# Design

## Context

See proposal.md, Why. The current codebase constrains the approach:

- **Runs.** `test_run` has one row per test case per execution (`UNIQUE (execution_id, test_case_id)`), `outcome` in Pending/Pass/Fail/NeedsReview, and `outcome_updated_at` (when the current outcome was recorded).
  - Earlier attempts' outcomes live in `test_run_attempt` (ADR 0020). They are never read here, so stale outcomes are excluded by construction.
  - `test_case_id` is nullable: a purge clears it.
- **Soft delete.** `test_case`, `test_execution` and `bug` carry `deleted_at`. Runs have none: a deleted execution's runs are hidden through their execution.
- **Bugs.**
  - `status` is Open/InProgress/Resolved/Closed/WontFix, and `severity` is Critical/High/Medium/Low.
  - `updated_at` changes on every edit.
  - The only status writer is `PATCH …/bugs/:id` (`bugs.controller.ts`). It logs `bug.updated` with `details.changes.status = { from, to }`. New bugs (filed, auto-created) are always Open.
  - The seed inserts bugs directly, with backdated `bug.updated` entries for its status changes.
- **Migrations under forced RLS.** `bug` and `activity_entries` force RLS even for the owner. A migration has no tenant context, so `0010_folder` lifts FORCE for its backfill and restores it in the same transaction. `apply-migrations.js` sends each file as one multi-statement query, which runs as one implicit transaction.
- **Shared packages.** `packages/reporting` is an empty placeholder, and no app imports any workspace package yet. The API builds with `tsc` (`rootDir: src`) and runs with `ts-node-dev`. The worker uses `pg`, not Prisma.
- **Web.**
  - Landing is `lib/landing.ts` (`decideLanding` → `/test-cases`).
  - The session check is `lib/route-protection.ts`, whose `PROTECTED_ROUTE` only matches `/test-cases`. Other screens currently rely on the API's 401 redirect.
  - The Activity screen's `ActivityFeed` (day grouping, Load more) and `lib/activity-format.ts` (sentences, kinds, `initialsOf`, `relativeTime`) exist.
  - `components/ui/tooltip.tsx` and `dialog.tsx` exist.

## Goals / Non-Goals

**Goals:**
- **One read** gives the whole Overview, computed in one tenant-scoped transaction, so all its figures are mutually consistent.
- **Formula logic is pure and unit-tested.** The rounding, Health Score, components and band need no database to test. SQL only counts.
- **The resolution date is correct from day one,** for both new and existing bugs.

**Non-Goals:**
- Daily trend series and Health Score history (Slice 3).
- Caching or precomputing the Overview. The queries are indexed aggregates over one project, which is fast at current volumes (see Risks).
- Moving the metrics into a shared package (decision 1).

## Decisions

### 1. Metrics live in the API for now
`src/overview/overview-metrics.ts` holds the pure functions: `roundHalfUp`, percentage, bug pressure, Health Score, band. `src/overview/overview-queries.ts` holds the SQL counts, and `src/overview/overview.controller.ts` exposes `GET /projects/:projectId/overview` (Viewer guard).

**Alternative considered:** `packages/reporting` now, as the roadmap and ADR 0006 intend. Rejected for this slice. No workspace package is wired into any app's build yet: the API's `rootDir: src` rejects files outside `src`, and the dev runner and Jest would each need checking. The pure functions have no dependencies, so moving them into the package when Phase 10's worker needs them is a file move. The SQL stays per app, since the worker has its own `pg` client. The roadmap entry is updated to say so.

### 2. Which rows count
Shared SQL fragments:
- **Completed run:** `r.outcome IN ('Pass','Fail','NeedsReview')`, joined to `test_execution e` with `e.deleted_at IS NULL` and `e.project_id = :p`.
- **Execution-level figures** (Pass Rate, Health pass rate) count every completed run of a live execution, including runs whose test case was later trashed. PRD §2.11 keeps those runs inside their executions.
- **Test-case figures** (Total, Ready share, Coverage, freshness, Top Failing) join `test_case tc` with `tc.deleted_at IS NULL`, so a trashed test case drops out of them.
- **Bugs:** `deleted_at IS NULL`. Open means `status IN ('Open','InProgress')`.

### 3. Time windows are rolling, measured from the database clock
"Last 30 days" is `outcome_updated_at > now() - interval '30 days'`, and "last 14 days" likewise. The KPIs are not calendar-day charts. Using the database's `now()` keeps one transaction's figures consistent, and avoids depending on the viewer's time zone, which PRD §6.12.2 applies to trend charts only.

### 4. Rounding and the score
Each component is a whole percentage: `roundHalfUp(100 × num / den)`, or 0 when `den = 0`. The score is `roundHalfUp(0.40·pass + 0.20·coverage + 0.25·bugPressure + 0.15·freshness)`, computed from those rounded components. That way the components the response shows reproduce its score exactly (spec example: 90, 80, 97, 75 → 87.5 → 88). The score is null, with a null band, when the project has no completed run at all.

**Response shape:**

```text
{
  testCases: { total, readyPct, coveragePct },
  passRate: number | null,
  activeExecutions, openBugs, criticalBugs,
  health: { score: number | null, band: 'Healthy' | 'AtRisk' | 'Critical' | null,
            components: { passRate, coverage, bugPressure, freshness } },
  topFailingTests: [{ id, name, failed, completed, failRatePct }],
  urgentBugs: [{ id, title, severity, status, createdAt }]
}
```

### 5. The queries
All run inside one `withTenantContext` transaction:
1. **Test cases:** `count(*)`, `count(*) FILTER (status='Ready')`, and the covered count via `EXISTS` (a completed run of a live execution) and freshness via `EXISTS` (… with `outcome_updated_at` in the last 14 days, among Ready test cases), all in one query.
2. **Runs:** `count(*) FILTER (outcome='Pass' …)` over completed runs in the last 30 days, plus `bool_or` for "any completed run ever".
3. **Executions:** `count(*) FILTER (status='InProgress')`.
4. **Bugs:** open counts by severity, in one query.
5. **Top Failing:** a `GROUP BY tc.id` of completed runs of live executions and live test cases, `HAVING count(*) >= 3 AND count(*) FILTER (outcome='Fail') > 0`, ordered by fail ratio, failures and name, limit 6. The ratio is ordered as `fail::numeric / completed`, not by the rounded percentage, so that ties are true ties.
6. **Urgent Bugs:** `ORDER BY (severity='Critical') DESC, created_at DESC, id`, limit 6.

### 6. The resolution date
- **Migration `0016_bug_resolved_at`:**
  1. Add `resolved_at timestamptz` to `bug`.
  2. Lift FORCE RLS on `bug` and `activity_entries` for the backfill, then restore it in the same transaction (the `0010` pattern).
  3. Backfill each bug in Resolved, Closed or WontFix: the newest `bug.updated` entry for it whose `details->'changes'->'status'` has `to` in that set and `from` not in it (the transition into the resolved set), else `updated_at`.
  4. Add `CHECK ((status IN ('Resolved','Closed','WontFix')) = (resolved_at IS NOT NULL))`. The database itself then refuses an inconsistent row, from any writer.

  The down migration drops the check and the column.
- **`PATCH` sets it** in the same `UPDATE`:

  ```text
  resolved_at = CASE
    WHEN new_status IN resolved AND old_status NOT IN resolved THEN now()
    WHEN new_status NOT IN resolved THEN NULL
    ELSE resolved_at END
  ```

  This uses the status already read under the row lock. A non-status edit leaves `new_status = old_status`, so the date is kept.
- **The seed** writes `resolved_at` as the status-change time (its `updatedAt`) for resolved statuses, and NULL otherwise. Without it, the check would reject the seed's inserts.
- **`BugResponse`** gains `resolvedAt: string | null`. No web screen shows it yet. The web type gains the field, and the bug fixtures set it.

### 7. Web
- **`lib/overview-api.ts`:** `getOverview` and `overviewKeys.detail(projectId)`. TanStack Query refetches on mount and window focus, and there are no live updates (PRD §6.12.4 freshness).
- **`components/overview/overview-screen.tsx`:** a header, a tile grid (`KpiTile`: icon, label, info tooltip, value, sub-label, band colour via the existing `--pass`, `--review` and `--fail` tokens), and two panels. Rows link with `target="_blank"` to `/test-cases?testCase=<id>` and `/bugs?bug=<id>`, the screens' existing deep links. Then Recent History.
- **Recent History** reads the first page of `listProjectActivity(…, null)`, which the Activity screen already caches under the same key, and shows the first 10. Its rows reuse the Activity row rendering: `ActivityRow` is exported from `activity-screen.tsx`.
- **Full History** is a `Dialog` holding the exported `ActivityFeed` with no filter, so the paging, day grouping and states are shared.
- **Landing and protection:**
  - `decideLanding` returns `/overview`.
  - `decideRouteProtection` treats every path except `/` and the auth routes as requiring a session. A positive list of app routes would silently miss the next new screen. `/` redirects by itself.
  - The shell's `NAV_LINKS` starts with Overview (`LayoutDashboard` icon).

## Risks / Trade-offs

- [The Overview runs about six aggregate queries per load, over all of a project's runs and bugs.] → These are indexed by project and bounded by one project's data. If it grows slow, precomputing (Slice 3's snapshot job, B3) can feed the same response shape.
- [The backfill trusts activity history, which might lack a status entry for a bug.] → It falls back to `updated_at`, which matches what the guide's approximation would have shown, and the check constraint guarantees every resolved bug has a date.
- [Making every non-auth path require a session could catch a future public page.] → There is none today. A future one would add itself to the allow-list explicitly, which is the safer default.
- [Landing moves from Test Cases to Overview.] → Deep links into Test Cases still work, and the change shows only after sign-in or at `/`.

## Migration Plan

Apply `0016_bug_resolved_at` as `railgun_migrator`, the same way as any other new migration on an existing database. Deploy the API and web together, since the API writes the new column and the check needs it. To roll back, apply the down migration and revert the code. Losing the dates is harmless, because they are rebuilt from the activity log on the next up migration.
