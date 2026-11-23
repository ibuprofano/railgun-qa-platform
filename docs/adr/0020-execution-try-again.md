# ADR 0020: Try Again — Restart, Duplicate and Attempt History

**Status:** Accepted
**Date:** 2026-11-23
**Amends:** [ADR 0012](0012-execution-completion-and-sign-off.md) (adds edges out of Completed, Done and Canceled), [ADR 0013](0013-bug-lifecycle-and-auto-creation.md) (decision 2: at most one auto-created bug per run *per attempt*)
**Resolves:** open question G7

## Context

[PRD.md](../../PRD.md) §6.3.4 says **Try Again** offers two choices: duplicate the execution with a custom subset of test cases, or restart it ("all results are reset and the execution is re-run from scratch"). Several things were left open:

- **Where it's available.** The action table offers Try Again on Completed, Done and Canceled, but the text below says "from Done or Canceled".
- **G7.** What happens to test cases in the subset that were deleted, and whether Restart keeps attempt history. PRD §6.3.3's run panel lists "Attempt history (list of all re-runs of this run)", but no attempts table exists.
- **Bugs.** Bugs link to runs, and a unique index allows one auto-created bug per run, ever (ADR 0013 decision 2), so a run that fails again after a Restart would get no new bug.
- **Roles, and the shape of a duplicate.**

## Decision

1. **Try Again is offered on Completed, Done and Canceled**, following the action table. PRD §6.3.4's text is amended to match. Retrying the failures before sign-off is a common need, and Needs Review runs block Sign Off (ADR 0012 decision 3).
2. **Roles.** Contributors and Admins may Duplicate, and may Restart a Completed or Canceled execution. **Restarting a Done execution needs an Admin**, the same role that signed it off, because it undoes that sign-off.
3. **Restart returns the execution to Ready, with the timer reset.**
   - Every remaining run goes back to `Pending`.
   - `elapsed_ms_accumulated` goes to 0, and `last_resumed_at`, `started_at`, `completed_at` and the sign-off fields are cleared.
   - The run snapshots are cleared, so the next **Run All** takes new snapshots of the current test cases and offers the usual mode choice.
   - The previous status and elapsed time go into the Restart's activity entry.
4. **Restart keeps attempt history in a new `test_run_attempt` table.** The execution carries an attempt counter, starting at 1. Restart first copies every run into an attempt row:
   - attempt number, `test_case_id`, position
   - the outcome, who set it and when
   - the name and script snapshots

   Then it resets the runs and increments the counter. Attempt rows belong to the execution, and their link to the run is set to null rather than cascade-deleted, so they survive the run being removed (decision 5). The run panel lists a run's earlier attempts.
5. **Runs whose test case has since been deleted (in the trash or purged) are dropped by Restart.**
   - Their results stay in the attempt history and the activity log.
   - The remaining runs keep their order, and positions close up.
   - The confirmation dialog says how many runs will be dropped.
   - Restart is refused if no runs would be left.

   Runs whose test case is no longer Ready are kept: the test case was eligible when the execution was made ready, and ADR 0012 decision 5 already says later status changes don't affect a Ready execution.
6. **Bugs record the attempt they were filed in.**
   - `bug` gains an attempt number, set from the execution's current attempt whenever a bug is filed from, auto-created for, or linked to a run.
   - Bugs stay linked to their run across Restarts.
   - The auto-create limit becomes **one per run per attempt** (the partial unique index moves to `(test_run_id, attempt)`), so a run that fails again after a Restart gets a fresh bug.
   - A bug linked to a dropped run loses the link (the existing `ON DELETE SET NULL`) but keeps its snapshot and attempt number.
   - The run panel groups bugs by attempt.
7. **Duplicate creates a new Draft execution.**
   - It is named "<name> (retry)" and copies the source's settings: environment, browser, viewport, locale, timezone and auto-create.
   - Its picker starts with **every eligible test case selected**, and the user unticks what they don't want.
   - Test cases that were deleted or are no longer Ready are shown disabled, with the reason, because a Draft only accepts Ready test cases (ADR 0012 decision 5).
   - The source execution is not changed, and the new one starts at attempt 1.

## Alternatives Considered

- **Try Again only from Done and Canceled** (the PRD text). Rejected: it forces a sign-off before retrying, which Needs Review runs can block.
- **Restart straight into In Progress.** Saves a click but skips Run All's mode choice. **Restart into Draft** overlaps with Duplicate.
- **Discarding previous results** and relying on the activity log. Rejected: the PRD's attempt history couldn't be shown in any structured way.
- **Refusing Restart when a test case was deleted.** Rejected: one deleted test case out of fifty would force a Duplicate. **Re-running deleted test cases from their old snapshot** contradicts ADR 0012's Mark as Ready check.
- **Keeping one auto-created bug per run forever.** Rejected: the old bug's snapshot may be out of date, and the tester would have to reopen it by hand. **Unlinking bugs on Restart** loses the link from a run to the bugs it found.
- **Duplicate with only failures pre-selected.** It fits "re-run what failed", but the user preferred starting from the full set and unticking.

## Consequences

- One migration adds the attempt counter to `test_execution`, adds `test_run_attempt` (forced RLS, `workspace_id`, composite FKs), adds the attempt number to `bug`, and replaces `bug_one_auto_per_run_idx`. Existing executions and bugs are backfilled to attempt 1.
- The `trash_purge` job and the cross-tenant tests must cover the new table.
- The attempt history is also the data source for the traceability graph and for reports (Phases 7 and 10).

## Revisit Triggers

- Teams want a Restart limited to the failed runs. That's a third Try Again option, but Duplicate already covers it.
- Attempt history grows large enough that the run panel needs pagination.
