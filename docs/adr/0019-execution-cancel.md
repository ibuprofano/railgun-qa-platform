# ADR 0019: Canceling an Execution

**Status:** Accepted
**Date:** 2026-11-23
**Amends:** [ADR 0012](0012-execution-completion-and-sign-off.md) (its consequence that no transition reaches `Canceled` yet)

## Context

[PRD.md](../../PRD.md) §6.3.4 offers **Cancel** on In Progress and Paused executions and lists **Canceled** as a final status next to Done, but says nothing about who may cancel or what happens to the runs. The `Canceled` status has existed in the schema since `execution-lifecycle` (migration `0008`), but no transition reaches it. Phase 7's remainder (roadmap-full.md) builds Cancel together with Try Again ([ADR 0020](0020-execution-try-again.md)), so both had to be settled first.

## Decision

1. **Contributors and Admins may cancel**, the same roles that may Pause and Resume. Viewers don't see the action. Cancel ends the work but destroys nothing, and Try Again can always bring the execution back, so it doesn't need an Admin.
2. **In Progress → Canceled and Paused → Canceled**, from no other status. The timer stops in the same transaction (from In Progress, the time since `last_resumed_at` is added to `elapsed_ms_accumulated`). The change is activity-logged and emits `execution.changed`, like every other lifecycle transition.
3. **Pending runs stay Pending.** No new outcome is added: on a Canceled execution, Pending means "never run", and reports count it that way.
4. **Every outcome is read-only once canceled.** Canceled is not added to the statuses where outcomes are editable (ADR 0012 decision 2). Bugs can still be filed from, or linked to, a run that has an outcome, since a canceled execution was started and its runs carry snapshots (ADR 0013 decision 3).

## Alternatives Considered

- **Admins only.** Treats Cancel like Sign Off. Rejected: a tester who started the wrong execution would have to find an Admin to stop it, and nothing is lost by canceling.
- **A new `Skipped` outcome for unrun tests.** It's more explicit in reports, but it widens the outcome check and every outcome filter, chart and report has to handle it. Pending already says the same thing on a final execution.
- **Outcomes still editable after Cancel**, as they are in Completed. Rejected: a canceled execution would never settle. Correcting results is what Completed is for, and Restart ([ADR 0020](0020-execution-try-again.md)) covers re-running.

## Consequences

- No schema change: `Canceled` is already allowed by the status check.
- Dashboards and reports (Phases 9–10) must label Pending runs on Canceled executions as "not run", not "pending".

## Revisit Triggers

- Teams need to distinguish "deliberately skipped" from "not reached" in reports, which would bring back a `Skipped` outcome.
- Teams want to finish recording results after canceling, which would mean making Canceled an outcome-editable status.
