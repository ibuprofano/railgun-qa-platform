# Proposal

## Why

Phase 9 Slice 6 ([roadmap-full.md](../../../docs/roadmap-full.md)) builds the Bugs dashboard view (PRD §6.4.4), the last of the four dashboards. Today the Bugs screen's right panel says "Select a bug to see its details." when nothing is selected, and nothing shows the bug backlog as a whole.

The prerequisites are done. Slice 2 added the resolution date (`bug.resolved_at`). Slice 3 added the line and donut charts. Slices 4 and 5 added the dashboard building blocks and a controlled chart range. This slice adds the one chart type it is the first to use: the tag word cloud.

## What Changes

- **Dashboard read** (`GET /projects/:projectId/bugs/dashboard?tz=`, Viewer+), declared before `:bugId`, in one transaction. It returns:
  - **bug rows:** one per live bug, with its id, title, severity, status and tag ids, its created, updated and resolved times, and the days it was reported and resolved in the caller's time zone
  - **the tags** those bugs carry: id, name and colour
  - **`today`** in the caller's zone and **`now`** from the database clock, so day series and rolling ages don't depend on the browser's clock
- **Shared rules in `packages/reporting/src/bug-dashboard.ts`:**
  - the row query's SQL
  - pure functions for the 4 tiles, the two Reported vs Resolved series, the four splits, Avg Resolution Time, the tag counts and the Needs Attention rows (Idle, Unattended)
  - `BugReportOptions` for Phase 10's PDF

  These are shared because the PDF must show the same figures.
- **Word cloud chart:**
  - geometry in `packages/reporting/src/charts/word-cloud.ts`: square-root sizing between a minimum and a maximum, equal sizes when all counts are equal, large and small words interleaved, a fixed fallback colour per tag, and row layout
  - a static SVG writer within ADR 0023's subset
  - a web `WordCloud` component with a "name: count" readout on hover and focus, and a summary for screen readers
- **Bugs screen:**
  - the dashboard is the default right panel unless `?bug=` names a bug
  - a Dashboard toggle in the list's header clears the selection
  - a Needs Attention row opens that bug's detail
- **Dashboard view:**
  - the header with **Download report**, which stays disabled with a note until Phase 10, as on the Executions dashboard
  - the 4 stat tiles, with Critical labelled "all time"
  - Reported vs Resolved and its Critical-only twin, sharing one range selector
  - four donuts: All Bugs by Severity, All Bugs by Status, Open by Severity, and Backlog Age with a tooltip explaining the buckets
  - Avg Resolution Time, next to the Bugs by Tag cloud
  - the Needs Attention table, with a count and an info tooltip
  - the loading placeholders (a title and four tiles), and the "No bugs yet" empty state with no download button
- **Bug status colours** for the donut, as theme variables. Resolved is green and In Progress blue (PRD §6.12.4). The PRD doesn't name colours for Open, Closed and Won't Fix, so this change picks them (design.md).
- **Demo seed:**
  - one Open bug reported about six weeks ago and never updated, so Needs Attention shows an Idle row and Backlog Age has an Old part
  - project tags carried by the seeded bugs in uneven numbers, so the tag cloud has words of different sizes
- **Docs:** the roadmap's Slice 6 entry becomes 🚧 and points at this change.

## Capabilities

### New Capabilities

- `bug-metrics`: the Bugs dashboard read and its rules: which bugs and tags it returns, how they are dated, scope and access, and the definitions of the tiles, series, splits, Avg Resolution Time, tag counts and Needs Attention.

### Modified Capabilities

- `bugs-screen`: the dashboard as the default right panel with its toggle, and the dashboard view's layout, widgets, loading and empty states.
- `dashboard-charts`: the tag word cloud.
- `demo-seed`: an idle, six-week-old open bug, which extends the "three weeks of history" rule, and tags on seeded bugs.

## Impact

- **DB:** none. No migration and no grant changes. Every field comes from `bug` (`created_at`, `updated_at`, `resolved_at`), `bug_tag` and `tag`.
- **Packages:** `packages/reporting` gains `src/bug-dashboard.ts`, `src/charts/word-cloud.ts` and a word-cloud SVG writer in `charts/svg.ts`, with unit tests.
- **API:**
  - new `src/bugs/bug-dashboard.ts`
  - a `dashboard` route in `bugs.controller.ts`, above `:bugId`
  - `parseTimeZone` reused
  - `src/seed/demo-dataset.ts` and `demo-seed.ts` changed for the seed
- **Web:**
  - `lib/bugs-api.ts` gains the dashboard read and key
  - `components/charts/` gains `word-cloud.tsx`, and `chart-format.ts` gains the bug status, backlog age and tag colours
  - new `components/bugs/bug-dashboard.tsx` and its Needs Attention table
  - `bugs-screen.tsx` and `bug-list.tsx` change
  - no new CSS variables: the colours reuse the existing theme variables
- **Out of scope:**
  - the PDF, enabling Download report, and its activity entry (Phase 10)
  - live updates for the dashboard (PRD §6.12.4)
  - scoping the dashboard by the list's filters: PRD §6.4.4 covers the whole project
  - showing the resolution date on the bug detail
  - tags on seeded test cases
