# Proposal

## Why

PRD §6.1 now specifies the Overview dashboard in detail, and §6.12 gives the metric definitions every dashboard shares. Phase 9 Slice 2 ([roadmap-full.md](../../../docs/roadmap-full.md)) builds the parts that need no open decision:

- the shared metric definitions
- the bug resolution date the bug metrics depend on
- the Overview's KPI tiles, Top Failing Tests, Urgent Bugs and Recent History

The charts wait for Slice 3, which needs the chart-library decision (F6) and the Health Score history (B3).

Two decisions were made for this change: the Overview becomes the landing page after sign-in, and a Health Score component with no data in its window scores 0 (as already written in PRD §6.1).

## What Changes

- **Bug resolution date** (PRD §2.9):
  - A migration adds the date to bugs. It is set when a bug enters Resolved, Closed or Won't Fix, kept while it moves between those statuses, and cleared when it goes back to Open or In Progress.
  - Existing bugs are backfilled from their status-change activity entries, falling back to their last update.
  - Bug responses report it as `resolvedAt`, and the demo seed writes it.
- **Overview stats** (`GET /projects/:projectId/overview`, Viewer+): one response with every figure, computed with the PRD §6.12.1 definitions:
  - the seven KPI values, with Total Test Cases' Ready share
  - the Health Score with its band and its four components, or "no data" for a project with no completed runs
  - the 6 Top Failing Tests
  - the 6 Urgent Bugs

  Trashed items, runs of deleted executions and outcomes from earlier attempts are never counted.
- **Web: the Overview screen** (`/overview`):
  - a header with the project name
  - the seven KPI tiles, with info tooltips and the Health Score's band colour
  - the Top Failing Tests and Urgent Bugs panels, linking to the test case or bug in a new tab
  - Recent History (the 10 latest entries) with a Full History dialog that reuses the Activity feed
  - loading, empty and error states
- **Navigation and landing:**
  - Overview is the first sidebar link for every member.
  - Signing in, and opening the app's root, lands on the Overview.
  - Every signed-in screen is now protected by the session check, not just Test Cases. This closes a gap that a new landing page would otherwise inherit.

## Capabilities

### New Capabilities

- `project-metrics`: the Overview stats read, with the shared metric definitions, Health Score, rankings, access and exclusions.
- `overview-screen`: the web Overview screen, with its tiles, panels, history and states.

### Modified Capabilities

- `bug-tracking`: bugs record and report their resolution date.
- `web-app-shell`: landing on the Overview, Overview in the navigation, and the session check on every signed-in screen.
- `demo-seed`: seeded resolved bugs carry a resolution date consistent with their history.

## Impact

- **DB:** migration `0016_bug_resolved_at` (column, backfill, consistency check). No RLS change, since the table keeps its policy.
- **API:**
  - new `src/overview/` (controller and metric queries), registered in `AppModule`
  - `bugs.controller.ts` and `bug-queries.ts` (set or clear the date, `resolvedAt` in responses)
  - `src/seed/demo-seed.ts`
- **Web:**
  - new route `app/(app)/overview` and `components/overview/`
  - new `lib/overview-api.ts`
  - `lib/landing.ts` and `lib/route-protection.ts`
  - `components/shell.tsx`
  - the activity feed component is exported for reuse in the dialog
  - `lib/bugs-api.ts` gains the new field
- **Docs:**
  - roadmap-full.md Phase 9 Slice 2 entry
  - the roadmap says the metrics live in the API for now, not `packages/reporting` (design.md decision 1)
- **Out of scope:**
  - the four charts and the Health Score history (Slice 3)
  - the per-screen dashboard views (Slices 4–6)
  - the Overview PDF (Phase 10)
  - live updates for the Overview
  - showing the resolution date on the Bugs screen
