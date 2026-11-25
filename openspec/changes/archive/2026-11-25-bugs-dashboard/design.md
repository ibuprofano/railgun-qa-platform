# Design

## Context

See proposal.md, Why. The current code constrains the approach:

- **The bug list reads everything already.** `GET …/bugs` returns every live bug with `severity`, `status`, `tagIds`, `createdAt`, `updatedAt` and `resolvedAt`. `BugList` keeps its filters and sort in local state. PRD §6.4.4 scopes the dashboard to the whole project, not to the list's filters, so the list's state stays where it is.
- **Schema:**
  - `bug.resolved_at` is set when a bug enters Resolved, Closed or Won't Fix, kept while it moves between them, and cleared when it leaves (Slice 2). A check keeps it consistent with the status.
  - `bug.updated_at` is bumped by every `PATCH`, including a tags-only edit, and by `link-run`. That is "an update" for the Idle rule.
  - `tag.color` is `NOT NULL`, from ADR 0016's palette. Every tag has a colour, so the PRD's fallback colour only matters to callers that pass none.
- **Screen:** `BugsScreen` keeps the selection in `?bug=` and shows "Select a bug to see its details." when none is selected.
- **Charts:**
  - `LineChart` takes an optional controlled `range` (Slice 5), so two charts can share one.
  - `DonutChart` has no info tooltip next to its title, and Backlog Age needs one.
  - There is no word-cloud geometry. ADR 0023 lists "word positions" among the module's outputs, and its SVG subset includes `text`.
- **Precedent from Slices 4 and 5:**
  - the dashboard SQL and rules live in `packages/reporting`
  - `parseTimeZone` checks `tz` against `pg_timezone_names` and answers 400
  - the dashboard route is declared above the `:id` route
  - the query key sits outside the list's key, with `refetchOnMount: 'always'`
  - `StatTile` and `SectionCard` are in `components/dashboard/`
- **Seed:** 8 bugs, all reported within 18 days, and no tags anywhere. Tag creation is logged as `tag.created`, and `bug.created` details name the tags a bug was filed with.

## Goals / Non-Goals

**Goals:**
- **One definition per figure,** in `packages/reporting`, used by the screen now and by Phase 10's PDF later.
- **One read per dashboard view.**
- **Days mean the same as on the other dashboards:** calendar days in the viewer's zone, dated in SQL, and rolling ages from the database clock.

**Non-Goals:**
- Live updates while the dashboard is open (PRD §6.12.4).
- Rendering the PDF or logging its download.
- A word-cloud layout that measures real text widths (Risks).

## Decisions

### 1. The API returns rows; the package derives the figures
`GET /projects/:projectId/bugs/dashboard?tz=` returns:

```ts
{
  today: string,              // YYYY-MM-DD in tz
  now: string,                // ISO, database clock
  bugs: {
    id, title, severity, status, tagIds: string[],
    createdAt: string, updatedAt: string, resolvedAt: string | null,
    reportedOn: string,       // YYYY-MM-DD in tz
    resolvedOn: string | null,
  }[],
  tags: { id, name, color }[], // tags carried by at least one live bug
}
```

The browser builds every widget from this with the package's pure functions (decision 2).

**Why rows:** this keeps the Executions dashboard's shape. The read stays small: a project's bugs number in the hundreds, and every widget needs only these fields. The PDF job will run the same SQL and functions.

**Alternatives:**
- **Figures computed in the API:** the PDF job would need the same aggregation in the worker anyway, so the package would hold it either way. Returning figures only moves where the package is called, and makes the API response a second contract to keep in step.
- **Reusing `GET …/bugs`:** it has no zone-dated days, no `now`, and no tags. Adding them would bloat every list read, and the list's key is invalidated on every live event.

**`now`** comes from `now()` in the same transaction. Backlog Age and Idle are rolling ages ("7 days", "30 days"), as Slice 2's rolling KPIs are, so they use the database clock, not the browser's.

### 2. `packages/reporting/src/bug-dashboard.ts`
The module holds:
- **SQL:**
  - `BUG_DASHBOARD_BUGS_SQL` (`$1` project id, `$2` time zone): live bugs, with `array_agg` of `bug_tag.tag_id` ordered by id, `(created_at AT TIME ZONE $2)::date` and `(resolved_at AT TIME ZONE $2)::date`
  - `BUG_DASHBOARD_TAGS_SQL`: tags joined to `bug_tag` of live bugs, distinct
  - `BUG_DASHBOARD_CLOCK_SQL`: `today` in `$1` and `now()`

  They run through `$queryRawUnsafe`, as the other dashboards' SQL does.
- **Rows to data:** `bugDashboardFromRows`, mapping to camelCase strings.
- **Figures:** each is a pure function of `BugDashboardData`:
  - `bugTiles`: `{ total, inProgress, open, resolved, critical }`
  - `bugDailySeries(data, days = 90)`: `{ dates, reported, resolved, criticalReported, criticalResolved }`. It builds the 90 days ending at `today` with UTC date arithmetic on the strings, as Slice 5 does. Charts take the last `range` of them.
  - `bugSeveritySplit`, `bugStatusSplit`, `openSeveritySplit` and `backlogAgeSplit`, as `DonutPart`s with keys. The web adds colours from `chart-format.ts`.
  - `avgResolutionTime`: `{ severity, days, count }[]` in severity order, leaving out severities with no resolved bugs
  - `bugTagCounts`: `{ tagId, name, color, count }[]`
  - `needsAttention`: `{ bug, idle, unattended }[]`, sorted
- **Shared constants:** `IDLE_DAYS = 30`, and the backlog bucket limits `FRESH_DAYS = 7` and `OLD_AFTER_DAYS = 30` (PRD §6.12.3).
- **`BugReportOptions`:** `{ tz, range }`, the contract for Phase 10's PDF job.

**Ages in whole days:** `ageDays = floor((now − t) / 86 400 000)`.
- Backlog Age: Fresh when `ageDays < 7`, Aging when `7 ≤ ageDays ≤ 30`, Old when `ageDays > 30`. So exactly 30 days is Aging, as the PRD's "7–30 days" reads.
- Idle: `ageDays(updatedAt) ≥ 30`.

**Avg Resolution Time** is the mean of `resolvedAt − createdAt` in milliseconds, converted to days and rounded with `roundHalfUp` from `health.ts`. Averaging first, then rounding once, keeps each row honest.

**Needs Attention sort:** Unattended first, then by severity rank (Critical first), then by `updatedAt` ascending (longest idle first), then by id for a stable order.

**Why the package:** the PDF must reproduce these figures (PRD §8), and Slices 4 and 5 put their rules there for the same reason.

### 3. Route
`@Get('dashboard')` goes in `BugsController`, declared above `@Get(':bugId')`, with `@RequireProjectRole('Viewer')`. One `withTenantContext` transaction runs `parseTimeZone`, then the clock, the bugs and the tags queries. The loader is `src/bugs/bug-dashboard.ts`, as `loadExecutionDashboard` is. A test checks that `dashboard` isn't read as an id.

### 4. Word cloud geometry: `packages/reporting/src/charts/word-cloud.ts`
`wordCloud({ words: { key, label, count, color? }[], width, minSize = 12, maxSize = 32, palette })` returns `{ words: { key, label, count, size, color, x, y }[], height }`.
- **Size:** `minSize + (√c − √min) / (√max − √min) × (maxSize − minSize)`. When `max = min`, every word gets the middle size, `(minSize + maxSize) / 2`.
- **Order:** sort by count descending, then label ascending. Then take alternately from the front and the back: largest, smallest, second largest, and so on. The result is deterministic.
- **Colour:** the given colour. Without one, it takes `palette[hash(key) % palette.length]`, with a small string hash (FNV-1a), so the same key always gets the same colour.
- **Layout:**
  - words flow into centred rows across `width`
  - each word's width is estimated as `label.length × size × 0.6`, plus a gap of `size × 0.5`
  - the row height is its tallest word × 1.3, and words share the row's baseline
  - `x` and `y` are the text anchor, `middle` and the baseline
- **`wordCloudSvg`** in `svg.ts` writes `text` elements only, within ADR 0023's subset.
- **Print colours:** `TAG_PRINT_COLORS: Record<TagColor, string>` holds hex values for the PDF. The package keeps its own copy of the palette names, since it can't import the web.

**Why estimated widths:** the package has no DOM (ADR 0023). The PDF needs positions, and the screen should show the same cloud. The 0.6 em average is generous for the sans-serif in both outputs.

**Alternative rejected:** an HTML flex-wrap cloud on the web, with geometry only for the PDF. That draws two different clouds from one chart, which is what ADR 0023 rules out.

### 5. Web `WordCloud` (`components/charts/word-cloud.tsx`)
- **Width:** it measures its container with the same `ResizeObserver` hook and jsdom fallback width as `LineChart`, and renders an `<svg>` whose height comes from the geometry.
- **Words:** each word is a `<text>` with `fill={color}`, where a tag colour maps to `var(--tag-<color>)`, which already follows light and dark. Words are focusable (`tabIndex=0`).
- **Readout:** pointer enter or focus sets the active word, and a readout above the cloud shows "name: count".
- **Accessibility:** the `<figure>` has `aria-label={title}`, and an sr-only caption lists the words, largest first, as "checkout 4, ui 1".
- **Empty:** with no words, it shows `emptyText`.

### 6. Screen and query
- **`BugsScreen`:** shows `selectedId ? <BugDetail …/> : <BugDashboard …/>`.
- **`BugList`** gains `dashboardShown` and `onShowDashboard`. A Dashboard button in the card header carries `aria-pressed={dashboardShown}`, and pressing it calls `select(null)`.
- **`BugDashboard`** takes `projectId` and `onOpenBug={select}`.
- **Query:** key `['projects', id, 'bugs-dashboard', tz]`, deliberately outside `bugKeys.all`. Bug live events invalidate `bugKeys.all`, and the dashboard needn't refetch while it is hidden. It uses `staleTime: 0` and `refetchOnMount: 'always'`, so every return to the dashboard refetches. `tz` comes from `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- **Client:** `getBugDashboard(client, projectId, tz)` in `lib/bugs-api.ts`, with `bugKeys.dashboard`, a key not under `all`.

### 7. Dashboard composition (`components/bugs/bug-dashboard.tsx`)
The component holds one piece of state, `range` (default 30), shared by both line charts. Everything else comes from `useMemo` over the package functions, in the PRD's row order:
1. **Header:** "Dashboard", "Aggregate bug metrics for this project", and a disabled **Download report** whose tooltip and visible note read "PDF export is not available yet."
2. **Tiles:** four `StatTile`s. Critical (all time)'s tooltip says it counts every status, unlike the Overview's Critical Bugs.
3. **Line charts:** two `LineChart`s with `range` and `onRangeChange` both set from the shared state. Reported uses `var(--fail)` and Resolved `var(--pass)`.
4. **Donuts:** four `DonutChart`s. `DonutChart` gains an optional `description` prop, shown as an info tooltip next to its title, as `LineChart`'s is. Backlog Age uses it.
5. **Avg Resolution Time and Bugs by Tag:** an Avg Resolution Time `SectionCard` beside a Bugs by Tag `SectionCard` holding the `WordCloud`.
6. **Needs Attention:** `bug-needs-attention.tsx`, a table shown only with rows.
   - Each row is a `<tr>` with a full-row button in the Bug cell, which calls `onOpenBug(id)`. The other cells are plain.
   - The heading has the count and an info tooltip.
   - Badges reuse `Badge`, amber for Idle and red for Unattended.

**Loading:** a heading skeleton and four `StatTile`s with `value={null}`, which already render placeholders. **Empty:** `bugs.length === 0` shows the `EmptyState` with "No bugs yet" and "Report a bug to start seeing metrics", and nothing else.

**Why the Download button is disabled, not hidden:** this follows Slice 5, and the PRD's layout includes it. Phase 10 then only enables it.

### 8. Colours (`chart-format.ts`)
- **`SEVERITY_CHART_COLORS`:** `var(--sev-critical|high|medium|low)`, the same variables as `SeverityDot`.
- **`BUG_STATUS_COLORS`:** PRD §6.12.4 fixes only Resolved (green) and In Progress (blue). This change picks:
  - **Open** `var(--fail)`: red, the colour of "Reported"
  - **In Progress** `var(--status-in-progress)`
  - **Resolved** `var(--pass)`
  - **Closed** `var(--status-completed)`: dark green, a finished state
  - **Won't Fix** `var(--status-done)`: muted grey

  The five stay distinguishable, and no new CSS variables are needed.
- **`BACKLOG_AGE_COLORS`:** Fresh `var(--pass)`, Aging `var(--review)`, Old `var(--fail)`, as PRD §6.12.4 says.

### 9. Seed
- **Tags:** four tags, created by the owner 46 days ago, a day before the oldest bug carrying one, each with a `tag.created` entry: `checkout` (red), `auth` (blue), `payments` (violet), `mobile` (teal).
- **On the bugs:**
  - checkout: guest-address-lost, three-ds-auto, the new idle bug
  - auth: lockout-not-locking, reset-link-expired, lockout-counter-reset
  - payments: three-ds-auto
  - mobile: mobile-images-slow

  That gives counts of 3, 3, 1 and 1. `bug_tag` rows are inserted with the bug, and the bug's `bug.created` details name its tags.
- **The idle bug:** `order-email-currency`, "Order confirmation email shows the wrong currency symbol". It is Medium and Open, reported 45 days ago by the contributor, with no run and no status change, so `updated_at = created_at`. It lands in Needs Attention as Idle, and in Backlog Age as Old.
- **Tags must predate their earliest bug.** A new `DemoTag` carries `createdDaysAgo`, and the dataset test checks that each tag is older than every bug carrying it.
- **History:** the "three weeks" requirement is amended (specs/demo-seed). The seed already writes in dependency order, so tags go in before bugs.

**Idempotency is unchanged.** The marker folder still decides "already seeded", so a project seeded before this change doesn't gain the new rows on a rerun. That matches the seed's "never changes existing rows" rule. To see them, seed a fresh project.

## Risks / Trade-offs

- **[Estimated word widths can crowd or overlap with wide glyphs]** → the 0.6 em estimate plus a half-em gap is generous for tag names, which are short and lowercase. If it shows in practice, switch to a per-character width table in the package. Only the layout function changes.
- **[The Critical chart uses a bug's current severity]** → a bug downgraded from Critical leaves the past days' Critical counts. The schema keeps no severity history except in the activity log, and the PRD's "Critical bugs only" reads as current severity. Recorded so nobody rebuilds it from the log silently.
- **[Resolved per day follows the current `resolved_at`]** → a reopened bug leaves its old resolution day, and re-resolving it moves the day. This follows the PRD's "by resolution date" definition (§6.12.1).
- **[Bug status colours are this change's choice]** → decision 8. One map changes if the PRD owner disagrees.
- **[Older demo databases don't get the new seed rows]** → noted in decision 9. The seed e2e test runs on a fresh project.
- **[The dashboard doesn't refresh while open]** → PRD §6.12.4 accepts this, and returning to the view always refetches.

## Migration Plan

No migration. Deploy the API, then the web. The new route is additive, and the old web never calls it. Rollback is a redeploy of the previous builds.
