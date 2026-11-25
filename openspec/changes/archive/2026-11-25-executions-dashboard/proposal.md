# Proposal

## Why

Phase 9 Slice 5 ([roadmap-full.md](../../../docs/roadmap-full.md)) builds the Executions dashboard view (PRD §6.3.6). Today the Executions screen's right panel says "Select an execution to see its runs." when nothing is selected, and there is no view across executions.

Slice 3's line and donut charts and Slice 4's dashboard building blocks (stat tile, section card, History panel) are done. This slice adds the one chart type it is the first to use, stacked daily bars, and makes donuts clickable, since its charts filter the runs table.

## What Changes

- **Dashboard read** (`GET /projects/:projectId/executions/dashboard?tz=`, Viewer+), declared before `:executionId`, in one transaction. It returns one row per live execution and one row per current run of a live execution:
  - **execution rows:** id, name, status, environment name, browser, tag ids (the list filter's fields) and the day it completed in the caller's time zone
  - **run rows:** execution, position, test case name, current outcome and the day it was recorded, attempts, live linked bugs, the failed step from a bug filed in the current attempt, created and last-updated times
  - **today's date** in the caller's zone, so the 90-day series end on the server's day
- **Shared scope and aggregation in `packages/reporting`:**
  - the execution list filter moves here from the web, so the list, the dashboard and Phase 10's PDF scope executions the same way
  - pure functions that build the tiles, the two daily series, the two donuts, and filter and sort the runs table
  - the two queries' SQL, as `TEST_CASE_FACTS_SQL` did in Slice 4
  - stacked-bar geometry and its static SVG writer (ADR 0023)
- **Charts (web):**
  - a `StackedBarChart`: its own range, hover and keyboard readout, legend toggles, clickable segments, a screen-reader summary
  - `DonutChart` gains clickable parts with a selected state, and an option to sort parts by count
  - `LineChart` can take its range from its parent, so the export can use the ranges on screen
- **Executions screen:**
  - the dashboard is the default right panel unless `?execution=` names one, and a Dashboard toggle in the list's header returns to it
  - the list filters move up to the screen, so the dashboard follows them and the Execution Status donut can set the status filter. A notice above the tiles names the active filters.
  - the status filter gains Canceled, which it was missing
  - `?run=<id>` opens that run's panel, so a runs-table row can open its run in a new tab
- **Dashboard view:**
  - the 4 stat tiles
  - Executions Over Time (line), Runs Over Time (stacked bars), Execution Status and Run Outcomes (donuts), with the PRD's click behaviour
  - the runs table:
    - Needs Attention and All Runs tabs
    - the outcome, day-and-outcome and name filters, with an active-filter label and Clear filter
    - seven sortable columns
    - rows loaded progressively with an "N of M" counter
    - a row opens its run in a new tab
  - the export button and dialog: its two switches, the filters notice and the report options it builds. **Download PDF stays disabled** with a note until Phase 10 renders the file.
  - the History panel with Executions and Runs tabs
  - loading placeholders and the "No executions yet" empty state
- **Docs:** the roadmap's Slice 5 entry becomes 🚧 and points at this change.

## Capabilities

### New Capabilities

- `execution-metrics`: the Executions dashboard read: which executions and runs it returns, their fields, how they are dated, scope and access, and the shared rules that turn them into tiles, series and splits.

### Modified Capabilities

- `executions-screen`: the dashboard as the default right panel with its toggle; list filters shared with the dashboard; the Canceled status filter; opening a run from the address; the dashboard view's tiles, charts, runs table, export dialog and History panel.
- `dashboard-charts`: stacked daily bars; clickable donut parts and stacked-bar segments.

## Impact

- **DB:** none. No migration and no grant changes. Every field comes from existing columns: `test_execution.completed_at`, `test_run.outcome_updated_at`, `test_run_attempt`, `bug.test_run_id`, `bug.attempt` and `bug.failed_step_snapshot`.
- **Packages:** `packages/reporting` gains `src/execution-dashboard.ts` (filters, SQL, aggregation) and `src/charts/stacked-bar.ts`, with unit tests, plus a stacked-bar SVG writer in `charts/svg.ts`.
- **API:**
  - new `src/executions/execution-dashboard.ts`
  - a `dashboard` route in `executions.controller.ts`, above `:executionId`
  - `parseTimeZone` reused from `overview/overview-trends.ts`
- **Web:**
  - `lib/execution-list-view.ts` re-exports the moved filter
  - `lib/executions-api.ts` gains the dashboard read and key
  - `components/charts/` gains `stacked-bar-chart.tsx`, and the donut and line charts are extended
  - new `components/executions/execution-dashboard.tsx` with its runs table, export dialog and History panel
  - `executions-screen.tsx`, `execution-list.tsx` and `execution-detail.tsx` change
  - `DashboardHistory` gains tabs
- **Out of scope:**
  - the PDF itself, its activity entry and enabling Download PDF (Phase 10)
  - run duration and AI confidence: Avg Duration shows "—" until automated runs exist (PRD §6.12.1)
  - live updates for the dashboard (PRD §6.12.4)
  - keeping the list filters in the address
  - the traceability graph (PRD §6.3.5)
