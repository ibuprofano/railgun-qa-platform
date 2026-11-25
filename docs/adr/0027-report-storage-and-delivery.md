# ADR 0027: Report Storage and Delivery

**Status:** Accepted
**Date:** 2026-11-25
**Amends:** [ADR 0006](0006-report-generation.md) (decision 6: where finished files live and how they are delivered; settles open question D3)

## Context

[ADR 0006](0006-report-generation.md) decision 6 has the worker store each finished report in object storage, and deliver it through a short-lived signed link announced over the live stream. The provider (E3: S3 or R2) waits on the hosting and region decisions (E1, E2, E4), and none of them is needed for local development. Phase 10 Slice 2 builds the first report end to end, and needs somewhere to put the file now.

Facts that shape the choice:

- **Small files:** a report is tens to a few hundred kilobytes. [ADR 0026](0026-report-rendering-library-and-fonts.md) measured 476 KB for a 500-run execution, with no images until D2 and attachments exist.
- **Bearer auth:** every API request authenticates with a bearer token ([ADR 0009](0009-api-authentication-transport.md)), so an authenticated download is no harder for the web than any other request.
- **Short life:** reports are per request. Nobody needs last month's PDF, because it can be regenerated.
- **Swap point precedent:** [ADR 0004](0004-secrets-storage.md) already isolates a provider choice behind an interface (`KeyProvider`), so it can change with hosting.

## Decision

**Report files are stored in Postgres behind a `ReportStore` interface, downloaded through an authenticated API route by their requester only, and kept for 7 days.**

1. **Storage:**
   - The bytes go in a `report_file` table (`report_id`, `workspace_id`, `content bytea`). It sits beside `report`, which holds the request, its status and its metadata.
   - Both tables have forced RLS and the standard tenant policy (ADR 0003).
   - Only the `ReportStore` adapters touch `report_file`: the worker writes through `put`, the API reads through `read`.
2. **Delivery:**
   - `GET /projects/:projectId/reports/:reportId/file` streams the PDF to the member who requested it. Anyone else, and anything expired, gets 404, as if the report didn't exist.
   - The live stream's `report.changed` event (ids only, ADR 0005) tells the browser to refetch the status, and polling covers a dropped stream.
   - The route stands in for the signed link.
3. **Retention (D3):**
   - A report expires 7 days after it is requested. From then on it is unreadable.
   - The daily `trash_purge` job deletes expired reports, and their files go with them by cascade.
   - Activity entries about a report (`report.downloaded`) are kept, as every activity entry is (ADR 0007).
4. **Fonts:** the worker gets ADR 0026's Noto files through a checksummed fetch script, `npm run fonts -w apps/worker`, into a gitignored folder. The repository never holds the 25 MB of binaries. A worker without the fonts fails report jobs visibly instead of rendering blank glyphs.

## Alternatives Considered

- **Decide E3 now** (S3 or R2, with signed links). This is the target design, but it forces the region and hosting choices before they are needed, and local development would need a storage emulator.
- **Local disk in the worker.** The API and the worker may run on different hosts (E2), so the API couldn't read the file.
- **Streaming the PDF from the request** (no job, no storage). This breaks ADR 0005's rule that reports are background jobs. A large execution would hold an HTTP request open, and retries and the 30 s budget couldn't apply.
- **Committing the fonts to the repository.** It works offline, but adds about 25 MB to the repository for good.

## Consequences

- Database size grows with report traffic, bounded by the 7-day expiry. At 500 KB per report, 1,000 reports a week is about 0.5 GB at its peak.
- Moving to object storage later means writing an S3 or R2 adapter for `ReportStore` (`put`, plus a signed-link read), switching the file route to a redirect, and dropping `report_file`. Nothing else changes.
- Each deployment that runs the worker runs the font script, and CI caches its output.
- A report link can't be shared. That is intended, since reports belong to their requester.

## Revisit Triggers

- E3 is decided. Move to object storage with signed links, as ADR 0006 intended.
- `report_file` becomes a noticeable share of database size or backup time.
- Images in reports (D2) push file sizes into the megabytes.
