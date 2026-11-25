# Tasks

## 1. Docs

- [x] 1.1 In `docs/roadmap-full.md`, turn Phase 9 Slice 6 into a 🚧 entry pointing at the OpenSpec change `bugs-dashboard`, with the scope and out-of-scope list from proposal.md, and the bug status colours chosen in design.md decision 8 as an assumption. Verify that it reads correctly and that every link resolves.

## 2. Bug figures in `packages/reporting`

- [x] 2.1 Add `src/bug-dashboard.ts` with the `BugDashboardData` types, `bugDashboardFromRows`, the constants (`IDLE_DAYS`, `FRESH_DAYS`, `OLD_AFTER_DAYS`) and `BugReportOptions` (design.md decision 2), exported from `src/index.ts`. Verify that the package builds.
- [x] 2.2 Add the pure figure functions (design.md decision 2):
  - `bugTiles` and `bugDailySeries`
  - `bugSeveritySplit`, `bugStatusSplit`, `openSeveritySplit` and `backlogAgeSplit`
  - `avgResolutionTime` and `bugTagCounts`
  - `needsAttention`

  Add `bug-dashboard.test.ts` covering specs/bug-metrics' figure scenarios:
  - a mixed backlog's tiles
  - one day's series, and a reopened bug
  - the backlog age buckets, and exactly 30 days
  - two resolved High bugs
  - counting a tag
  - an idle bug, an unattended bug, and bugs not listed
  - the Needs Attention order

  Also cover a 90-day series ending at `today` across a month boundary. Verify `npm test -w packages/reporting` passes.
- [x] 2.3 Add `BUG_DASHBOARD_CLOCK_SQL`, `BUG_DASHBOARD_BUGS_SQL` and `BUG_DASHBOARD_TAGS_SQL` (design.md decision 2). Verify that the package builds, and that all three run in group 3's e2e tests.

## 3. Dashboard read (API)

- [x] 3.1 Add `src/bugs/bug-dashboard.ts`, which runs `parseTimeZone` and the three queries in the caller's transaction and returns the response of design.md decision 1. Add `@Get('dashboard')` (Viewer+) above `@Get(':bugId')` in `bugs.controller.ts`. Verify that the API builds.
- [x] 3.2 Add `test/bug-dashboard.e2e-spec.ts` covering specs/bug-metrics:
  - a Viewer reads it
  - another workspace's member gets 403
  - `dashboard` isn't read as an id
  - an unknown `tz` is refused with 400
  - a trashed bug is absent, and so is another project's bug
  - a 23:30 UTC creation dates to the next day in `Europe/Madrid`
  - an unresolved bug has no resolution time or day, and a resolved one has both
  - a tag carried only by test cases, or only by a trashed bug, is absent
  - `tagIds` lists a bug's tags

  Verify `npm test -w apps/api` passes (with `SECRETS_MASTER_KEY` in the shell).

## 4. Word cloud chart

- [x] 4.1 Add `src/charts/word-cloud.ts` (sizes, interleaved order, hashed fallback colour, row layout), `wordCloudSvg` in `charts/svg.ts`, and `TAG_PRINT_COLORS` (design.md decision 4). Add package tests for specs/dashboard-charts:
  - square-root sizing (1, 4, 9 → 12, 22, 32) and equal counts
  - the five-word order a, e, b, d, c, and ties ordered by name
  - the same key getting the same fallback colour
  - rows that never exceed the width
  - the SVG using only `text`

  Verify `npm test -w packages/reporting` passes.
- [x] 4.2 Add `components/charts/word-cloud.tsx` (design.md decision 5): it measures its width, draws words in `var(--tag-<color>)`, makes words focusable, shows the "name: count" readout on hover and focus, and has a summary for screen readers and an empty line. Extend `charts.test.tsx` with reading a word by hover and by focus, the summary ("checkout 4, ui 1"), and the empty state. Verify the web tests pass.
- [x] 4.3 Give `DonutChart` an optional `description` shown as an info tooltip next to its title, as `LineChart` has. Add `SEVERITY_CHART_COLORS`, `BUG_STATUS_COLORS` and `BACKLOG_AGE_COLORS` to `chart-format.ts` (design.md decision 8). Extend `charts.test.tsx` with the tooltip. Verify that the existing donut tests pass unchanged.

## 5. Bugs screen

- [x] 5.1 Add `getBugDashboard` and `bugKeys.dashboard` (`['projects', id, 'bugs-dashboard', tz]`, outside `bugKeys.all`) to `lib/bugs-api.ts`, and a dashboard fixture to `test/bug-fixtures.ts`. Verify that the web typecheck passes.
- [x] 5.2 Show the dashboard as the default right panel in `BugsScreen`, and add the Dashboard toggle (`aria-pressed`) to `BugList`'s header, calling `select(null)`. Update `bugs-screen.test.tsx`, replacing the "Select a bug to see its details." assertion, and verify specs/bugs-screen's three default-panel scenarios.

## 6. Dashboard view

- [x] 6.1 Add `components/bugs/bug-dashboard.tsx` (design.md decision 7) with:
  - the header and disabled Download report with its note
  - the four tiles, with Critical's tooltip
  - both line charts on one shared range
  - the four donuts, with Backlog Age's tooltip
  - Avg Resolution Time and the Bugs by Tag cloud
  - the loading placeholders and the "No bugs yet" empty state

  The query uses `staleTime: 0` and `refetchOnMount: 'always'`, with the browser's time zone. Add `bug-dashboard.test.tsx` and verify the scenarios in specs/bugs-screen:
  - switching back refreshes, loading, and empty project
  - before report generation
  - reading the tiles
  - changing the shared range, and hiding a series in one chart only
  - severity colours, and no open bugs
  - an Avg Resolution Time row, and nothing resolved
  - tags in use, and no tags
- [x] 6.2 Add `components/bugs/bug-needs-attention.tsx`: the heading with the count and an info tooltip, the four columns, amber Idle and red Unattended badges, the package's order, and hidden when empty. Each row's button calls `onOpenBug`. Add tests for reading the table, nothing needs attention, and opening a bug, which checks that the screen shows the detail and the address holds `?bug=<id>`. Verify the web tests pass.

## 7. Demo seed

- [x] 7.1 In `src/seed/demo-dataset.ts`, add `DemoTag`, the four tags with their colours and `createdDaysAgo`, the bugs' tag keys, and the idle bug `order-email-currency` (design.md decision 9). Extend `demo-dataset.spec.ts`:
  - each tag predates every bug carrying it
  - one tag is carried by 3 or more bugs and one by exactly 1
  - the idle bug is Open, Medium, about 45 days old, with no run and no status change

  Verify `npm test -w apps/api -- demo-dataset` passes.
- [x] 7.2 In `src/seed/demo-seed.ts`, insert the tags with their `tag.created` entries before the bugs, insert `bug_tag` rows with each bug, and name the tags in each `bug.created` entry's details, as the app writes them. Extend `demo-seed.e2e-spec.ts`:
  - the seeded Bugs dashboard read lists the idle bug in Needs Attention as Idle, and Backlog Age has Old 1
  - the tags appear with uneven counts
  - filtering `GET …/bugs` rows by a seeded tag returns exactly the bugs carrying it
  - the history-span assertion allows the older bug and its tags

  Verify `npm test -w apps/api` passes.

## 8. Integration check

- [x] 8.1 From the repository root, run `npm run lint`, `npm run typecheck`, `npm test -w apps/api` (with `SECRETS_MASTER_KEY` in the shell), `npm test -w apps/worker`, `npm run test -w apps/web` and `npm test -w packages/reporting`, and verify that all pass. The known flaky worker test `trash-purge.spec.ts` › "runs as the trash_purge job" is recorded in the roadmap; report it if it fails. Also verify that `npm run build -w apps/api` succeeds.
- [x] 8.2 Manual run against a freshly seeded project (`npm run dev`, signed in as the seeded user):
  1. Check that Bugs opens on the dashboard with the toggle pressed.
  2. Check that the tiles agree with the list's counts.
  3. Change the range, and check that both Reported vs Resolved charts follow.
  4. Check the donuts' colours and the Backlog Age tooltip.
  5. Check Avg Resolution Time against the resolved bugs.
  6. Hover a word in the tag cloud.
  7. Open a Needs Attention row, then press Dashboard to return.
  8. Check both themes, light and dark.

  Record the outcome in the roadmap entry.

## Workflow follow-up

- Archive the change after review. Update the roadmap's Slice 6 entry to ✅, with what was built, key decisions and anything deferred.
