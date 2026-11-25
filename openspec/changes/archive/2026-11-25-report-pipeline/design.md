# Design

## Context

See proposal.md, Why. The relevant code and constraints:

- **Queue (ADR 0005, ADR 0018):**
  - `enqueue_job(task, payload, run_at)` (migration 0014) is `SECURITY DEFINER`, with an allow-list holding only `trash_purge`. It calls `graphile_worker.add_job` with Graphile's default of 25 attempts.
  - Tasks live in `apps/worker/src/tasks/index.ts`, and each takes the `pg` pool.
  - `withTenantContext(pool, workspaceId, fn)` runs one transaction with `app.workspace_id` set.
- **Worker grants:**
  - it can SELECT and DELETE `project`, `folder`, `test_case`, `test_execution` and `bug`, SELECT `test_run`, and INSERT into `activity_entries`
  - it can't read `tag` or `bug_tag`
- **Live events:**
  - `emitLiveEvent(tx, event)` is `pg_notify('railgun_live', json)` on the caller's transaction, so the worker can do the same with `pg`.
  - `parseLiveEvent` accepts only `execution.changed` and `run.bugs.changed`, and requires `executionId`.
  - The stream writes `event: <type>` and an id-only payload.
  - The web provider (`lib/live-updates.tsx`) listens per type.
- **Rendering:**
  - pdfmake's `getBuffer()` is synchronous CPU work: no timer fires inside it.
  - ADR 0026 measured a cold 500-run execution at 1.2 s and 350 MB, and set a 30 s timeout.
- **Bugs dashboard data:**
  - `packages/reporting/src/bug-dashboard.ts` has the SQL (`BUG_DASHBOARD_*_SQL`, with `$1` project and `$2` zone) and every figure function.
  - The writers in `charts/svg.ts` produce print SVG with `PRINT_PALETTE` and short day labels (`chart-writer-fixes`).
- **Web:**
  - `ApiClient.request` parses JSON only.
  - The dashboard keeps `range` in its state, and its Download report button is disabled.
- **Decision workflow:** E3 is open, and the user chose Postgres storage behind a swappable store, which ADR 0027 records. The user also chose a font fetch script and requester-only access.

## Goals / Non-Goals

**Goals:**
- **One pipeline every later report reuses:** request, queue, generation, storage, status, delivery and logging.
- **The tenant context on every step,** in the API and in the worker.
- **A file the screen agrees with:** the same SQL and figure functions, fed the same zone and range.

**Non-Goals:**
- Object storage and signed links (E3), a reports list, manual deletion, and images (D2).

## Decisions

### 1. Two tables: `report` and `report_file` (migration `0019_report`)

```sql
report (
  id uuid PK, workspace_id uuid, project_id uuid,      -- FK (project_id, workspace_id) ON DELETE CASCADE
  requested_by uuid NOT NULL REFERENCES "user"(id),
  kind text CHECK (kind IN ('bugs_dashboard')),
  options jsonb NOT NULL,                              -- { tz, range }
  status text CHECK (status IN ('Queued','Generating','Ready','Failed')) DEFAULT 'Queued',
  error text, file_name text, byte_size integer,
  created_at timestamptz DEFAULT now(), completed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  CHECK ((status = 'Ready') = (file_name IS NOT NULL)),
  UNIQUE (id, workspace_id)
)
report_file (
  report_id uuid PK, workspace_id uuid, content bytea NOT NULL,
  FK (report_id, workspace_id) REFERENCES report(id, workspace_id) ON DELETE CASCADE
)
```

- **RLS:** both tables have forced RLS with the standard `tenant_isolation` policy.
- **Grants:**
  - `railgun_app`: SELECT and INSERT on `report`, SELECT on `report_file`
  - `railgun_worker`: SELECT, UPDATE and DELETE on `report`, INSERT on `report_file`, SELECT on `tag` and `bug_tag`
- **Index:** `(expires_at)` for the purge.

**Why a separate file table:** status reads never touch the bytes, and swapping storage later removes one table without touching `report`.

**`enqueue_job` gains a new body:**
- the allow-list becomes `['trash_purge', 'report_generate']`
- `report_generate` is added with `max_attempts => 3` and the job key `report:<id>`, so a repeated enqueue doesn't duplicate the job
- every other task keeps Graphile's defaults

The down migration restores 0014's body.

### 2. `ReportStore`: the swap point (ADR 0027)
`ReportStore` has `put(client, workspaceId, reportId, bytes)` on the worker side and `read(tx, reportId)` on the API side. The Postgres adapters write and read `report_file`.
- A future S3 or R2 adapter keeps the same two operations, plus a signed-link read.
- The API route then redirects instead of streaming.
- Nothing outside the adapters touches `report_file`.

### 3. API: `src/reports/`
- **`POST /projects/:projectId/reports`** (Viewer+):
  - Input is `{ kind: 'bugs-dashboard', tz, range }`. The kind is mapped to `bugs_dashboard`, the zone is checked with `parseTimeZone`, and the range must be in {7, 15, 30, 90}. Anything else answers 400.
  - In one `withTenantContext` transaction: insert the `report`, then `SELECT enqueue_job('report_generate', {"reportId": id, "workspaceId": …})`.
  - Answers 201 with `ReportResponse`.
- **`GET …/reports/:reportId`** returns `{ id, kind, status, error, fileName, byteSize, createdAt, completedAt, expiresAt }`. The read matches `id`, `project_id`, `requested_by = caller` and `expires_at > now()`, and answers 404 when nothing matches. That one predicate gives "requester only" and "expired = gone" together.
- **`GET …/reports/:reportId/file`:**
  - runs the same lookup, answering 409 unless the report is Ready
  - reads the bytes through the store
  - logs `report.downloaded` (entity type `report`, name "Bugs dashboard report", category `Bugs`, details `{ kind, range }`) in the same transaction
  - returns the body with `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="…"` and `Content-Length`

  It streams a `Buffer` through Nest's `StreamableFile`.
- **Module:** `ReportsModule`, registered in `app.module.ts`.

### 4. Worker: `report_generate`
The payload is `{ reportId, workspaceId }`. The task:
1. **Claims the report:** in one tenant-context transaction, `UPDATE report SET status='Generating' WHERE id=$1 AND status IN ('Queued','Generating') RETURNING kind, options, project_id`, then emits `report.changed`. No row means the report expired or was already finished, and the task returns.
2. **Reads:** in a second transaction, the clock, bugs and tags queries with `options.tz`, plus `project.name`. It then calls `bugDashboardFromRows`.
3. **Assembles** with `bugReportData(dashboard, { range, projectName })` from the package (decision 6).
4. **Renders** in a worker thread (decision 5) with a 30 s timeout.
5. **Stores and finishes:** in one transaction, `store.put` the bytes, then `UPDATE report SET status='Ready', file_name, byte_size, completed_at`, then emit `report.changed`.
6. **On failure:** if `helpers.job.attempts < helpers.job.max_attempts`, rethrow so Graphile retries with its backoff. On the last attempt, set `status='Failed', error=<short reason>, completed_at`, emit `report.changed`, and return without throwing.

**File name:** `bugs-dashboard-<today in options.tz>.pdf`.

### 5. Rendering in a worker thread
`render-pdf.ts` starts a `worker_threads` Worker running `pdf-thread.js`. The thread:
- registers the fonts
- calls `setUrlAccessPolicy(() => false)`, and limits `setLocalAccessPolicy` to the fonts directory
- builds the document with `createPdf(definition).getBuffer()`
- posts the bytes back

The parent races the thread against a 30 s timer and calls `worker.terminate()` on timeout, which then counts as a failed attempt.

**Why a thread:** pdfmake's render is synchronous, so a timer in the same thread can't fire until it's finished. A thread also keeps Graphile's event loop free for other jobs and for its lock heartbeat.

**Alternative rejected:** `Promise.race` in the same thread. It can't interrupt a synchronous render.

### 6. Report data in `packages/reporting/src/bug-report.ts`
`bugReportData(data, { range, projectName })` returns a plain object, with no pdfmake types:
- **title, date and range:** `{ projectName, generatedOn: data.today, range }`
- **`tiles`:** from `bugTiles`
- **`charts`:** both Reported vs Resolved SVG strings, built with `lineChart` and `lineChartSvg` over the last `range` days of `bugDailySeries`, Reported `#dc2626` and Resolved `#16a34a`
- **`donuts`:** four of `{ title, svg, legend: { label, count, pct, color }[] }`, from the split functions with `PRINT_SEVERITY_COLORS`, `PRINT_BUG_STATUS_COLORS` and `PRINT_BACKLOG_AGE_COLORS`, all hex values that mirror the screen's theme
- **`resolution`:** from `avgResolutionTime`
- **`tags`:** from `bugTagCounts`, sorted by count and then name
- **`needsAttention`:** `{ title, severity, status, idle, unattended }[]`

It holds only allow-listed fields: no ids beyond what's needed, and no secrets. Vitest checks it against the same fixtures as `bug-dashboard.test.ts`. The worker's `bugs-dashboard-document.ts` turns it into a pdfmake definition:
- tiles as a 4-column table
- each SVG as `{ svg, width, font: 'NotoSansJP' }`
- legends as small tables
- tags as a two-column table
- Needs Attention as a table with `headerRows: 1`, or "No bugs need attention."

### 7. Fonts: a checksummed fetch script
`apps/worker/scripts/fetch-fonts.js` lists the three files, each with its URL from ADR 0026's sources and its SHA-256:
- `NotoSansJP-Regular.otf`
- `NotoSansJP-Bold.otf`
- `NotoSansMonoCJKjp-Regular.otf`

It downloads any that are missing into `apps/worker/fonts/` (gitignored), verifies each hash, and exits non-zero on a mismatch. The script is `npm run fonts -w apps/worker`. `REPORT_FONTS_DIR` overrides the folder.
- **At start-up,** `main.ts` logs an error if the fonts are missing.
- **Without fonts,** `report_generate` fails each attempt with "Report fonts are not installed", so the report ends Failed rather than rendering blank glyphs.
- **CI** runs the script, with `actions/cache` keyed on the script's hash, before the worker tests.

### 8. Live event `report.changed`
`LiveEvent` gains `{ type: 'report.changed', workspaceId, projectId, reportId }`. `parseLiveEvent` accepts it; its required ids are now per type. The worker emits it with `SELECT pg_notify('railgun_live', $1)` in its own transactions, using the same channel name, which goes in `apps/worker/src/live-event.ts` with a comment linking the API's constant. The stream forwards `{ projectId, reportId }`.

**Reaching the requester only:** events reach every stream on the project. That's acceptable because the event holds only ids, and a non-requester's client has no query for that report, so it ignores the event.

### 9. Web
- **`lib/reports-api.ts`:**
  - `requestReport`, `getReport`, `downloadReportFile`
  - keys under `['projects', id, 'reports', reportId]`
  - `ApiClient` gains `requestBlob(path)`, which uses the same bearer token and 401 handling and returns `{ blob, fileName }` from `Content-Disposition`
- **`useReportDownload(projectId, kind)`:**
  - a mutation that posts the request and keeps the report id
  - a `useQuery` on that report with `refetchInterval: 3000` while it's Queued or Generating
  - on Ready, it downloads the blob once through an object URL and a temporary `<a download>`, then resets
  - on Failed, or if the request fails, it exposes `error`

  It returns `{ start, state: 'idle' | 'generating' | 'failed' }`.
- **Live provider:** it adds a `report.changed` listener that invalidates that report's key.
- **Bugs dashboard header:** Download report calls `start({ tz: viewerTimeZone(), range })`. It shows "Generating…" while generating, and the failure line with Try again. The "PDF export is not available yet." note goes.
- **Activity:** `report.downloaded` reads "downloaded the Bugs dashboard report".

### 10. Expiry in the daily purge
`trash_purge` gains one more step per workspace: `DELETE FROM report WHERE expires_at < now()`, with the file going by cascade. It's counted in the job's summary. No activity entry is written: expiry isn't a user action, and the download entries stay.

## Risks / Trade-offs

- **[PDF bytes in Postgres]** → a report is tens to hundreds of KB, it lasts 7 days, and it is per request, so table growth is bounded. ADR 0027 records the revisit trigger (database size, or E3 decided). The store interface keeps the move to one adapter.
- **[No signed link]** → downloads go through the API with the bearer token, which is already how every request authenticates (ADR 0009). A link can't be shared, which matches requester-only access.
- **[Retries re-render the whole report]** → reports are idempotent: the same rows at the same moment give the same output, and the job key prevents duplicates.
- **[A worker thread per report]** → the thread costs a startup of about 250 ms (ADR 0026's load time), which is small beside the render.
- **[Fonts missing on a host]** → reports fail visibly, with a reason on the report and a start-up error. They never render blank glyphs silently.
- **[A non-requester's stream sees a report id]** → ids only, by design (ADR 0005). The file is still behind the requester check.

## Migration Plan

1. Run `npm run fonts -w apps/worker` on each environment that runs the worker.
2. Apply migration 0019 as `railgun_migrator`.
3. Deploy the worker, then the API, then the web.

**Rollback:** redeploy the previous builds and run 0019's down migration, which drops both tables and restores `enqueue_job`. Queued `report_generate` jobs left in the queue fail harmlessly as unknown tasks, and can be deleted.
