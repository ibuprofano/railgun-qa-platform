# ADR 0025: Test Case Health Rules and Edit Times

**Status:** Accepted
**Date:** 2026-11-25
**Amends:** [ADR 0015](0015-test-case-status-changes.md) (test cases now record when they were last changed and when their script was last edited), [ADR 0023](0023-chart-rendering.md) (`packages/reporting` also holds the test case health rules)

## Context

Phase 9 Slice 4 builds the Test Cases dashboard view (PRD §6.2.4). Three of its parts rest on things the product doesn't have yet:

- **Its Needs Attention table has a Last Updated column.** `test_case` stores `created_at`, but no time of its last change.
- **Its Degrading flag is "as defined for the Degrading health banner"** (PRD §6.2.3). That banner sits beside a **Trend Reset** rule: after a script edit, older runs are left out of the comparison. Applying it needs the time of the last script edit, which isn't stored either.
- **The health rules exist only as PRD text.** The test case health banners (Orphan, Never Run, Dormant, Degrading, Improving, Trend Reset) were deferred in the MVP (roadmap-mvp.md Phase 9). The dashboard would be their first implementation.

The screen also needs a rule for where the dashboard appears. The Test Cases right panel today shows either a selected folder's summary or a selected test case (PRD §6.2.1).

Every test case edit is already logged. `test_case.updated` entries name the changed fields in `details.changes`: `name`, `status`, `tags`, and `gherkinScript: true` for a script edit. `test_case.moved` records moves.

## Decision

1. **Test cases record two edit times:**
   - `updated_at`: the last change to the test case's name, script, status or tags, or a move. It starts at creation.
   - `script_updated_at`: the last edit of its Gherkin script. It is null when the script was never edited after creation.

   Both are set in the same statement as the change. Existing rows are backfilled from their activity entries, falling back to `created_at` for `updated_at`. This follows the bug resolution date's pattern (migration `0016`).
2. **The health rules are written once, in `packages/reporting`, and both the dashboard and the banners use them.** For one test case, from its live runs (completed runs of executions not in the Trash, current outcomes only, PRD §6.12.1):
   - **No Script:** it has no Gherkin script.
   - **Orphan:** it was never added to an execution.
   - **Never Run:** it has runs, but none completed.
   - **Dormant:** its last completed run was more than 14 days ago.
   - **Degrading** and **Improving:** the pass rate of its last 5 completed runs is at least 20 points below (or above) that of the 5 before them. This needs 10 completed runs, counting only runs completed after the last script edit.
   - **Trend Reset:** its script was edited, it had completed runs before the edit, and fewer than 10 runs have completed since. In this state Degrading and Improving are not evaluated.
3. **Slice 4 also shows the health banners** on the test case detail (PRD §6.2.3), from the same rules. The dashboard and the detail therefore can't disagree about a test case.
4. **The dashboard is the Test Cases screen's default right panel.** It shows when nothing is selected. Selecting a folder still shows that folder's summary, and selecting a test case, or linking to one, shows its detail. The Dashboard toggle returns to it from either.

## Alternatives Considered

- **Reading both edit times from the activity log on every request.** No migration, but every dashboard load would scan the log per test case, and the log has no `entity_id` index (ADR 0022's Risks). Rejected, as for the bug resolution date.
- **Building the dashboard only, and leaving the banners for later.** That's a smaller slice, but the rules would exist in code with only one user, and the banners would risk being written differently later. Rejected.
- **Replacing the folder summary with the dashboard.** That's simpler, but it loses the per-folder counts PRD §6.2.1 asks for. Rejected.

## Consequences

- **Two columns on `test_case`.** Every writer has to maintain them: test case create, update and move, and the demo seed.
- **"Recently edited" is defined by run count, not by time.** Trend Reset lasts until 10 runs have completed after the edit. This is how PRD §6.2.3's "until enough new runs accumulate" is read here.
- **The health rules' thresholds** (14 days, 5-run windows, 20 points, 10 runs) are the PRD §6.12.3 constants. Dormant and Degrading stay marked as future per-project settings.

## Revisit Triggers

- Teams want Trend Reset to end after a time, not a run count.
- Per-project thresholds are built (PRD §6.12.3), which would move these constants into project settings.
