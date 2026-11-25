# ADR 0024: Health Score History

**Status:** Accepted
**Date:** 2026-11-25
**Amends:** [ADR 0005](0005-realtime-and-background-jobs-v1.md) (specifies the "daily Health Score snapshot" job it lists); resolves open question B3

## Context

The Overview's Health Score trend shows "the score as it stood on each day" of a 7-, 15-, 30- or 90-day range (PRD §6.1). The score combines the 30-day pass rate, coverage, bug pressure and freshness (PRD §6.1, specs/project-metrics). Today it is only computed live, for the current moment (Phase 9 Slice 2).

Open question B3 asked how history is backfilled for a project that already has runs but no snapshots. ADR 0005 lists a "daily Health Score snapshot" job without specifying it.

Most inputs can be read back as of a past day. Runs have the time their current outcome was recorded, bugs have creation and resolution dates (PRD §2.9), and test cases have creation and deletion times. Two cannot:
- **A test case's status on a past day.** Only its current status is stored. Earlier statuses exist only as `test_case.updated` activity entries.
- **Outcomes replaced by a Restart.** These move to attempt history (ADR 0020), so a recomputed past day sees only the current outcome.

## Decision

1. **A daily worker job records every live project's score.** The task `health_snapshot` runs on the worker's crontab shortly after midnight UTC. For each live project it stores the score, band and four components as they stand at that moment, labelled with the UTC day that just ended. A project in the Trash is skipped.
   - The job is idempotent: a day already recorded is never overwritten. A project that fails is retried without blocking the others, as the trash purge does.
   - A snapshot is history, so later edits, deletions and restores never change it.
2. **Days with no snapshot are recomputed from the record on request.** This covers days before the job existed, a project's first days, and days the job missed. Each such day is computed as of the end of that UTC day:
   - runs counted by when their current outcome was recorded
   - test cases that existed and weren't deleted by then
   - bugs that were reported by then and not yet resolved by their resolution date

   A test case's Ready status is taken as it is today. These approximated days are **not stored**, so an approximation never becomes permanent history.
3. **Today's point is the live score** from the Overview read (Slice 2), so the chart ends on the same number as the Health Score tile.
4. **History days are UTC days.** Each day's score is recorded once for everyone, so it can't follow each viewer's time zone. This is the one exception to PRD §6.12.2's rule that ranges use the viewer's calendar days. The chart labels each point with its date.
5. **Days before a project's first completed run have no score** and are left off the line, as PRD §6.1 already says.

## Alternatives Considered

- **Recompute only, with no job.** Simplest, but every request rebuilds up to 90 days of history, and the Ready-status and Restart approximations never go away. Rejected as the long-term answer; kept as the gap filler.
- **Snapshots only.** Exact, but a project created before the job, or the day the feature ships, starts with an empty chart. Rejected.
- **Replay status changes from the activity log** to make recomputed days exact. Possible, but it depends on every past status change having been logged with its old value. Left as a later refinement (see triggers).
- **Storing recomputed days.** It would make the chart cheaper to load, but it would freeze approximations as if they were recorded history. Rejected.

## Consequences

- **A new tenant table** holds one row per project per UTC day, with forced RLS like every other tenant table. The worker role needs to insert into it and read what the score needs, including `test_run`, which it can't read today (migration `0014` grants it only what the purge needs).
- **The formulas move into `packages/reporting`.** The worker must compute the same score as the API, so the pure functions from Slice 2 (`overview-metrics.ts`) move there, as ADR 0023 also requires for charts. The counting queries need one as-of form that both the API's recompute and the worker's snapshot use.
- **Recomputed days may differ slightly from what the screen showed that day,** for the two approximated inputs. Snapshot days are exact.
- **The chart's points come from three sources:** snapshots, recomputed gap days and the live score. They must agree on rounding and bands, which the shared formulas guarantee.

## Revisit Triggers

- Recomputed gap days visibly disagree with snapshots on real projects, which would mean replaying test case status changes from the activity log.
- Teams in very different time zones find UTC days confusing, which would mean per-project time zones.
- Loading 90 days becomes slow, which would mean storing recomputed days in a separate table marked as approximate.
