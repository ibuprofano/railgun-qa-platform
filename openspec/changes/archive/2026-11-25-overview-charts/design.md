# Design

## Context

See proposal.md, Why, plus [ADR 0023](../../../docs/adr/0023-chart-rendering.md) and [ADR 0024](../../../docs/adr/0024-health-score-history.md). The current codebase constrains the approach:

- **`packages/reporting`** is an empty `index.ts` with `main: index.ts`, and no app depends on it.
  - The API's `tsconfig.json` has `rootDir: src`, and its production start is `node dist/main.js`. The worker has the same pattern (`tsconfig.build.json`, `rootDir: src`).
  - Both apps are CommonJS. The web is Next.js 16 with `moduleResolution: bundler`.
  - Raw TypeScript from outside `src` would break both production builds. Jest (`ts-jest`, `.ts` only) and `ts-node-dev` would cope.
- **Slice 2's live Overview:**
  - `apps/api/src/overview/overview-queries.ts` counts with `Prisma.sql` fragments.
  - `overview-metrics.ts` holds the pure formulas (`roundHalfUp`, `pct`, `bugPressure`, `healthScore`, `band`, `health`).
  - Top Failing Tests and Urgent Bugs are API-only.
- **Data available as of a past moment:**
  - `test_run.outcome_updated_at` (current outcome only)
  - `test_case.created_at` and `deleted_at`
  - `bug.created_at` and `resolved_at` (from migration `0016`)

  Test case status has no history.
- **Worker:**
  - It uses the `pg` pool and its own `withTenantContext(pool, workspaceId, fn)`.
  - `crontab.ts` holds `0 3 * * * trash_purge ?fill=1d`, and tasks are registered in `tasks/index.ts`.
  - The purge iterates every workspace by id.
  - `railgun_worker` holds `SELECT, DELETE` on `project`, `folder`, `test_case`, `test_execution` and `bug`, but nothing on `test_run`.
- **Tenant tables** follow one pattern: `workspace_id`, a composite FK to `project(id, workspace_id) ON DELETE CASCADE`, `ENABLE` and `FORCE ROW LEVEL SECURITY`, a `tenant_isolation` policy, and explicit grants.
- **The dev runner** `scripts/dev.js` spawns `npm run dev -w <workspace>` for api, web and worker. CI runs `npm install` before lint, typecheck and tests.
- **Web:**
  - Theme tokens exist (`--pass`, `--fail`, `--review`, `--primary`, exposed as `--color-*`).
  - jsdom polyfills `ResizeObserver` as a no-op.
  - Radix `Select` is awkward in jsdom, which is why the Activity and Trash filters use button rows.

## Goals / Non-Goals

**Goals:**
- **One definition per figure.** The live score, each snapshot and each recomputed day all come from one SQL query and one set of formulas.
- **Screen and report geometry identical by construction** (ADR 0023). The serializer exists and is tested now, though reports arrive in Phase 10.
- **The package works in every runtime:** dev, Jest, Vitest, the Next build, and the API and worker production builds.

**Non-Goals:**
- Stacked bars and the word cloud. Slices 5 and 6 are their first users, and the module is built to take more chart kinds.
- Report rendering itself (Phase 10).
- Exact past test case statuses (ADR 0024 revisit trigger).

## Decisions

### 1. The package is compiled to CommonJS, and every app imports the build
`packages/reporting/src/**` is compiled by `tsc -p tsconfig.build.json` to `dist/`, with `.d.ts` files. `package.json` has `main: dist/index.js`, `types: dist/index.d.ts`, and the scripts `build`, `test` (Vitest, already hoisted from the web), `typecheck` and `lint`.
- **Root `postinstall`:** `npm run build -w @railgun-qa/reporting`, so every `npm install`, locally and in CI, leaves a fresh build before lint, typecheck and tests.
- **Dev:** `scripts/dev.js` adds a `reporting` process running `tsc --watch`, so edits reach the apps during development.
- **Apps:** `apps/api`, `apps/worker` and `apps/web` each declare `"@railgun-qa/reporting": "*"`.

**Why not TypeScript source**, as ADR 0023 decision 6 said for the web: the API and worker need the package now (ADR 0024), and their production builds can't load `.ts` from outside `src`. One built artifact for every app is simpler than source for one app and a build for the others. Task 1.1 amends ADR 0023 decision 6 to match.

### 2. Package layout
- `src/health.ts`: Slice 2's formulas, moved unchanged. Their unit tests move with them.
- `src/as-of-counts.ts`: the counting SQL as one string with `$1`/`$2` placeholders, its row type, and `healthFromCounts(row)`. Both Prisma (`$queryRawUnsafe`) and `pg` (`client.query`) accept that string as written.
- `src/charts/scale.ts`: linear scales, "nice" y ticks (0–100 for percentages, rounded steps for counts), and date ticks.
- `src/charts/line.ts`: `lineChart(spec)` turns series, dates, size and visible series into axes, a path per series and point positions. A day with no data uses 0; a null in the Health series breaks the line.
- `src/charts/donut.ts`: `donutChart(spec)` turns parts and size into arc paths, the total and legend rows with percentages. It drops zero parts.
- `src/charts/svg.ts`: `toSvg(geometry, palette)` writes the static SVG string, within ADR 0023's subset (no gradients or filters).
- `src/index.ts` re-exports all of the above.

### 3. One as-of counting query
Input: `$1` project id, and `$2 timestamptz[]` instants, or `NULL` for "now" via `COALESCE($2, ARRAY[now()])`. For each instant `t`, with `WITH ORDINALITY` preserving order, it returns:
- `total`: test cases with `created_at <= t` that are not in the Trash
- `ready`: those that are Ready today
- `covered`: those with a completed run of a live execution and `outcome_updated_at <= t`
- `fresh`: Ready ones with such a run in `(t − 14 days, t]`
- `completed_ever`: any completed run with `outcome_updated_at <= t`
- `recent` and `recent_pass`: completed runs, and passes, in `(t − 30 days, t]`
- `open_critical`, `open_high`, `open_medium`: live bugs with `created_at <= t` and (`resolved_at IS NULL OR resolved_at > t`)

`healthFromCounts` turns a row into `{ passRate, coverage, health }` with the moved formulas.
- **Live:** Slice 2's live Overview switches its counts to this query with `NULL`. Top Failing Tests and Urgent Bugs keep their own queries.
- **Equivalence:** at `t = now`, the definitions match Slice 2's. `resolved_at IS NULL` matches an open status by migration `0016`'s check. Slice 2's e2e suite guards this.
- **Exclusions:** trashed items and runs of trashed executions are excluded by their current Trash state (PRD §2.11: hidden from all dashboards). That holds for past days too.

### 4. Snapshot table and job
- **Migration `0017_health_snapshot`:**
  - `health_snapshot (workspace_id, project_id, day date, score int NULL, band text NULL, pass_rate int, coverage int, bug_pressure int, freshness int, recorded_at timestamptz DEFAULT now(), PRIMARY KEY (project_id, day))`, with a composite FK to `project ON DELETE CASCADE` (so a project purge removes its rows), forced RLS and a `tenant_isolation` policy
  - `GRANT SELECT ON health_snapshot TO railgun_app`
  - `GRANT SELECT, INSERT ON health_snapshot TO railgun_worker`
  - `GRANT SELECT ON test_run TO railgun_worker`
- **Task `health_snapshot` (crontab `15 0 * * * health_snapshot ?fill=1d`):**
  - It computes the day as the UTC date before the scheduled run time (`payload._cron.ts` when present, else now), so a late run, caught up by `fill`, still labels the right day.
  - For each workspace and each live project, it runs the as-of query with `NULL` (state now, ADR 0024 decision 1) and inserts with `ON CONFLICT (project_id, day) DO NOTHING`.
  - Each project gets its own transaction. Failures are collected, and the task throws at the end so Graphile retries. Because of the conflict rule, a retry only fills what's missing.

### 5. The trends read
`GET /projects/:projectId/overview/trends?tz=<zone>` (Viewer):
- **Validation:** the zone is checked against `pg_timezone_names`, the same zone list `AT TIME ZONE` uses; otherwise 400.
- **Local series:** `generate_series` over the 90 local dates ending `(now() AT TIME ZONE tz)::date`, left-joined to:
  - completed runs grouped by `(outcome_updated_at AT TIME ZONE tz)::date`, giving `completed` and `passed`
  - bugs grouped by `created_at`, and by `resolved_at`, in the zone
- **Health:** the 90 UTC dates ending today (UTC).
  - The snapshots for those days are read.
  - The missing past days go through the as-of query in one call, with instants `(day + 1) AT TIME ZONE 'UTC'`.
  - Today is the live score (`NULL`).
  - Each point is `{ day, score, band, source: 'snapshot' | 'recomputed' | 'live' }`.
- **Split:** the 30-day `{ pass, fail, needsReview }`.
- **Response:** `{ days: [{ date, completed, passed, reported, resolved }], health: [...], outcomes30d }`, oldest first. The client slices each chart's range from these 90 days, so changing a range never triggers a request.

### 6. Web charts
- **`components/charts/line-chart.tsx`:**
  - It measures its width with a `ResizeObserver`, with 640 as the fallback and test width, and asks the package for geometry.
  - It renders paths, axes and a hover rule as React SVG.
  - The `<svg>` is focusable: ←/→ move the active day and Home/End jump.
  - Pointer movement picks the nearest day.
  - A tooltip shows the date and the visible series' values.
  - Legend buttons (`aria-pressed`) toggle series.
  - It is wrapped in `<figure aria-label=…>` with a visually hidden summary.
- **`components/charts/donut-chart.tsx`:** arcs, the centre total, legend rows "Label n (p%)", and the empty line.
- **`components/charts/range-select.tsx`:** a button row for 7/15/30/90 (`role="radiogroup"`), the same pattern as the Activity pills.
- **Colours:** `var(--color-pass)` and the other theme tokens are passed in as strings, so dark mode works without re-rendering logic. The Health line uses `var(--color-primary)`.
- **The Overview:**
  - It adds `useQuery(overviewKeys.trends(projectId, tz))`, with `tz` from `Intl.DateTimeFormat().resolvedOptions().timeZone`.
  - It lays out PRD §6.1 rows 2 to 4, each trend holding its own range state (default 30).
  - The donut and the two panels share row 4.

## Risks / Trade-offs

- [`postinstall` adds a build step to every install, and a stale `dist` can mask source edits.] → The dev watcher covers development, and CI always installs fresh. The package's own typecheck runs on `src`.
- [Gap-day recompute runs one as-of query over up to 89 instants.] → Each instant is a handful of indexed counts over one project. If it grows slow, ADR 0024's revisit trigger applies.
- [Health days are UTC while the other series use the viewer's zone, so the same calendar label can cover different hours.] → ADR 0024 decision 4 records this, and so does PRD §6.12.2. The two kinds never share a chart.
- [Switching Slice 2's live counts to the shared query could shift a number.] → The definitions are equivalent at `t = now`. Slice 2's 15 e2e tests must pass unchanged.
- [Charts drawn from geometry need careful tests.] → The geometry and serializer have unit tests in the package. The components have Vitest tests for range, hover by keyboard, legend, empty states and summaries.

## Migration Plan

Apply `0017_health_snapshot` as `railgun_migrator`. Run `npm install`, which builds the package. Deploy the worker with its new task. The first snapshot appears after the next 00:15 UTC, and until then every past day is recomputed.

To roll back: apply the down migration, which drops the table and revokes the grants, remove the task, and revert the code.
