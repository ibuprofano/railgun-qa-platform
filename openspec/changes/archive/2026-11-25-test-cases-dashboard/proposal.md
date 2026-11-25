# Proposal

## Why

Phase 9 Slice 4 ([roadmap-full.md](../../../docs/roadmap-full.md)) builds the Test Cases dashboard view (PRD §6.2.4). Today the Test Cases screen's right panel says "Select a test case to see its details." when nothing is selected, and the test case health banners of PRD §6.2.3 were deferred in the MVP.

[ADR 0025](../../../docs/adr/0025-test-case-health-and-edit-times.md) settled the groundwork:
- test cases record two edit times, `updated_at` and `script_updated_at`
- the health rules are written once in `packages/reporting`, and both the dashboard and the banners use them
- the dashboard is the default right panel

Slice 3's charts are done, so nothing else blocks this slice.

## What Changes

- **Edit times:**
  - Migration `0018_test_case_edit_times` adds `test_case.updated_at` (required) and `script_updated_at` (nullable).
  - Existing rows are backfilled from their `test_case.updated` and `test_case.moved` activity entries, as migration `0016` did for bugs.
  - Create, update (when something changed) and move maintain them. Test case reads report `createdAt`, `updatedAt` and `scriptUpdatedAt`.
- **Health rules in `packages/reporting`:**
  - the thresholds (14 days, 5-run windows, 20 points, 10 runs)
  - one SQL query that reads each test case's run facts
  - a pure `testCaseHealth(facts)` that returns its flags: No Script, Orphan, Never Run, Dormant, Degrading, Improving, Trend Reset
- **Test case detail health:** the detail response gains `health`, with its flags and, when there are enough runs, the two 5-run pass rates.
- **Test Cases dashboard read** (`GET /projects/:projectId/test-cases/dashboard?tz=`, Viewer+), in one transaction:
  - the four tiles' figures
  - 90 days of created, added, completed and passed counts in the caller's time zone
  - the Last Run Outcome and Source Type splits
  - the Needs Attention rows
  - the four rankings (top 10 each)
  - the Folder Health rows
- **Web:**
  - **Health banners** on the test case detail (PRD §6.2.3).
  - **The dashboard view:**
    - It's the default right panel, and a Dashboard toggle in the tree's toolbar returns to it.
    - The 4 stat tiles, then Test Cases Over Time and Pass Rate Trend, which is hidden until the project has a completed run.
    - The Last Run Outcome and Source Type donuts.
    - The Needs Attention table, with a name filter, sortable columns and "Show N more".
    - The 2 × 2 rankings and the Folder Health table.
    - The collapsible History panel, showing the latest 5 test case entries and "See full history".
    - Loading placeholders and the "No test cases yet" empty state.
- **Seed:**
  - Seeded test cases carry edit times.
  - Two of them get a logged script edit 6 days ago, after a completed run, so the demo shows the Trend Reset banner.
  - Their earlier runs, and the bug filed from one of them, keep the script from before the edit.
  - Two signed-off regressions give the sign-in and search test cases a third completed run, so Top Failing and Most Run fill on the demo.
- **Unranked failing test cases:** the dashboard and the Overview report how many failing test cases have fewer than 3 completed runs. Both Top Failing panels say so instead of "No failing tests — nice!".
- **Docs:** the roadmap's Slice 4 entry becomes 🚧 and points at this change.

## Capabilities

### New Capabilities

- `test-case-health`: the health rules for one test case (No Script, Orphan, Never Run, Dormant, Degrading, Improving, Trend Reset), which runs they count, and the detail reporting them.
- `test-case-metrics`: the Test Cases dashboard read: tiles, daily series, splits, Needs Attention, rankings, Folder Health, scope and access.

### Modified Capabilities

- `test-case-authoring`: test cases record and report when they were created, last changed and last had their script edited.
- `test-cases-screen`: the dashboard as the default right panel with its toggle, the dashboard view's widgets, and the health banners on the detail.
- `demo-seed`: seeded test cases carry edit times, two have a logged script edit after a completed run, and seeded runs fill Top Failing.
- `project-metrics`: the Overview reports failing test cases below Top Failing's minimum.
- `overview-screen`: Top Failing Tests says when failing test cases are too new to rank.

## Impact

- **DB:** migration `0018_test_case_edit_times` (up and down): two columns, a backfill that lifts FORCE RLS on `test_case` and `activity_entries` within its transaction, then `NOT NULL` and a default on `updated_at`. No grant changes.
- **Packages:** `packages/reporting` gains `src/test-case-health.ts` (thresholds, facts SQL, rules) with unit tests.
- **API:**
  - `src/test-cases/test-cases.controller.ts`: edit times in create, update and move; new response fields; `health` on the detail; the dashboard route declared before `:testCaseId`
  - new `src/test-cases/test-case-dashboard.ts` for the dashboard queries
  - `parseTimeZone` is reused from `src/overview/overview-trends.ts`
- **Seed:** `src/seed/demo-dataset.ts` gains script edits on two test cases. `src/seed/demo-seed.ts` writes both edit times, the edits' activity entries and the per-run script snapshots.
- **Web:**
  - `lib/test-cases-api.ts` gains the new fields, `health` and the dashboard read
  - new `components/test-cases/test-case-dashboard.tsx` (with its widgets) and `health-banners.tsx`
  - `test-cases-screen.tsx` gains the default panel and the toggle
  - `test-case-tree.tsx` gains the toggle button
- **Out of scope:**
  - the dashboard PDF and its download button (Phase 10)
  - the run history table on the test case detail (PRD §6.2.3)
  - per-project thresholds (PRD §6.12.3)
  - AI confidence: Avg Confidence shows "—" until automated runs exist (PRD §6.12.1)
  - live updates for the dashboard
  - seeding enough runs to show Degrading on the demo project
