# Tasks

## 1. Docs

- [x] 1.1 In `docs/roadmap-full.md`, turn Phase 9 "Slice 2" into a 🚧 entry pointing at the OpenSpec change `overview-dashboard`, with the scope and out-of-scope list from proposal.md. Change its "Built in `packages/reporting`" line to say the metrics live in `apps/api/src/overview/` for now, with the pure functions to move into `packages/reporting` when Phase 10's worker needs them (design.md decision 1). Note there that Overview is now the landing page. Verify it reads like Slice 1's entry.

## 2. Bug resolution date

- [x] 2.1 Add `db/migrations/0016_bug_resolved_at.up.sql` and `.down.sql` (design.md decision 6): the column; the backfill with FORCE RLS lifted and restored on `bug` and `activity_entries`; the consistency check. Apply it to the dev database as `railgun_migrator`, add it to the migration test if one lists files, and run `npm run db:check-rls`. Verify with an e2e test that inserts, before the migration logic runs, one bug changed Open → Resolved → Closed through logged entries, one Resolved bug with no entry and one Open bug, then runs the backfill statement: the dates are the Resolved time, `updated_at` and NULL. Since migrations are plain SQL, run the backfill SQL against fixture rows inside the test.
- [x] 2.2 In `bugs.controller.ts`, set or clear `resolved_at` in the `PATCH` update, and add `resolvedAt` to `BugResponse` / `bug-queries.ts`. Extend `bugs.e2e-spec.ts` and verify:
  - Open → Resolved sets it
  - Resolved → Closed keeps the same value
  - Closed → Open clears it
  - renaming a Won't Fix bug keeps it
  - filed and auto-created bugs report `resolvedAt: null`
- [x] 2.3 In `src/seed/demo-seed.ts`, write `resolved_at` for seeded bugs in resolved statuses, as their status-change time. Extend `demo-seed.e2e-spec.ts`: every seeded Resolved, Closed or Won't Fix bug has `resolved_at` equal to its `bug.updated` entry's time, and Open and In Progress ones have none. Verify that a rerun still writes nothing.

## 3. API: Overview stats

- [x] 3.1 Add `src/overview/overview-metrics.ts`, holding `roundHalfUp`, `pct`, `bugPressure`, `healthScore` (from rounded components) and `band`, plus `overview-metrics.spec.ts`. Verify:
  - the spec's healthy example (90, 80, 97, 75 → 88)
  - 87.5 rounds to 88 and 87.4 to 87
  - bug pressure is floored at 0
  - the band edges (80, 79, 60, 59)
  - pct with a zero denominator is 0
  - no completed run gives a null score and band
- [x] 3.2 Add `src/overview/overview-queries.ts` (design.md decisions 2, 3 and 5) and `overview.controller.ts` with `GET /projects/:projectId/overview` (Viewer), returning the decision 4 shape. Register it in `AppModule`. Add `test/overview.e2e-spec.ts`, inserting runs with backdated `outcome_updated_at`, and verify every project-metrics scenario:
  - the pass rate of 60, counting Needs Review and ignoring the 40-day-old run
  - none (null) with only old runs
  - Total 4, Ready 25, Coverage 75
  - Open Bugs 2, Critical 1, Active Runs 1
  - the healthy example end to end
  - a pass-rate component of 0 with only old runs
  - a null score with no runs
  - Top Failing: A then C, at most 6, and a trashed test case dropped
  - Urgent Bugs in order
  - a deleted execution's runs excluded, then counted again once it is restored
  - a restarted execution counting only the new outcome
  - a trashed bug excluded
  - no access, including another workspace's member → 403

## 4. Web: Overview screen

- [x] 4.1 Add `lib/overview-api.ts` (types, `getOverview`, `overviewKeys`). Add `resolvedAt` to the bug type in `lib/bugs-api.ts` and to `test/bug-fixtures.ts`. Verify `npm run typecheck -w apps/web` passes.
- [x] 4.2 Export `ActivityFeed` and `ActivityRow` from `components/activity/activity-screen.tsx`, unchanged in behaviour. Build `components/overview/overview-screen.tsx` and `app/(app)/overview/page.tsx` (design.md decision 7):
  - the header with the project name
  - the seven `KpiTile`s with info tooltips, the Health Score's band colour and "No data"
  - Top Failing Tests: rate colours and links to `/test-cases?testCase=<id>` in a new tab
  - Urgent Bugs: badge, "<status> · opened <relative>", links to `/bugs?bug=<id>` in a new tab
  - Recent History: the first 10 entries of the feed, and Full History in a `Dialog` holding `ActivityFeed`
  - placeholders, the error state with Retry, and each panel's empty line

  Add `overview-screen.test.tsx` and verify every overview-screen scenario: the sub-labels, "—" for pass rate, "72" with "At Risk" in amber, the tooltip's four weights, the failing row "75%" in red with "3 of 4 runs failed" and its link, the urgent row text and link, both empty lines, 10 of 25 history entries, Full History with Load more, an empty project, and Retry. Confirm the existing `activity-screen.test.tsx` still passes.

## 5. Web: landing, protection and navigation

- [x] 5.1 Change `decideLanding` to `/overview`, and `decideRouteProtection` to require a session on every path except `/` and the sign-in and sign-up routes. Update `landing.test.ts` and `route-protection.test.ts` and verify:
  - signed in → `/overview`
  - `/overview`, `/executions`, `/bugs`, `/activity`, `/trash`, `/settings`, `/workspace-settings` and `/test-cases/x` require auth when signed out
  - `/` and the auth routes don't
  - the auth routes still redirect a signed-in user to `/`
- [x] 5.2 Put Overview (`LayoutDashboard` icon) first in the shell's `NAV_LINKS`. Extend `shell.test.tsx` to verify that the links are in the order Overview, Test Cases, Executions, Bugs, Activity, and that Overview is marked current on `/overview`.

## 6. Integration check

- [x] 6.1 Run `npm run lint`, `npm run typecheck`, `npm test -w apps/api` (with `SECRETS_MASTER_KEY` in the shell), `npm test -w apps/worker` and `npm run test -w apps/web` from the repository root. Verify they all pass.
- [x] 6.2 Manual run against the seeded database (`npm run dev`), signed in as the test user:
  1. Sign in and check that the app lands on the Overview.
  2. Check that all seven tiles show values that match the seeded data. A spot-check: Open and Critical Bugs against the Bugs screen, and Active Runs against Executions.
  3. Check that a Top Failing row and an Urgent Bugs row each open the right item in a new tab.
  4. Check that Full History pages through the feed.
  5. Sign out, open `/executions`, and check that it redirects to sign-in.

  Record the result in the roadmap entry.

## Workflow follow-up

- Update the roadmap-full.md slice entry to ✅, with Built / Key decisions / Deferred.
- Archive with `/opsx:archive` once review is done.
