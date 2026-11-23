# ADR 0021: Execution History Panel and Draft Run Changes

**Status:** Accepted
**Date:** 2026-11-23
**Amends:** [ADR 0007](0007-activity-log-and-trash-purge.md) (adds the first per-item reads of the activity log), [ADR 0012](0012-execution-completion-and-sign-off.md) (decision 5: how test cases enter and leave a Draft)

## Context

Phase 7's second slice (roadmap-full.md) builds three remaining parts of [PRD.md](../../PRD.md):

- §6.3.3's **activity history panel** ("a list of changes made to this specific execution over its lifetime"), together with §6.4's bug activity panel, which shares the component;
- §6.3.4's **remove individual runs**, offered on Draft executions;
- §6.2.3's **Run → add it to an existing execution**.

The PRD doesn't say what "changes to this execution" includes, whether a Draft may be emptied, or which executions can receive a test case. Activity entries carry an entity type and id plus free-form details. Run outcome entries (`test_run.outcome_set`) already record their execution's id in those details, and bug creation and linking entries record the run's id.

## Decision

1. **The execution panel lists the execution's own entries, its runs' outcome changes, and the entries of the bugs linked to its runs.** That is:
   - entries whose entity is the execution
   - run entries whose details name the execution
   - every entry for a bug currently linked to one of its runs

   The bug entries include later edits made on the Bugs screen. A bug unlinked by a Restart dropping its run (ADR 0020 decision 5) is no longer linked, so its entries leave this panel. They stay on the bug's own panel.
2. **The bug panel lists the bug's own entries.** Both panels:
   - are readable by every project member (Viewer and above)
   - list newest first, 20 entries at a time, with "Load more"
   - render entries as sentences through one shared formatter, which the Activity screen (Phase 9) will reuse
3. **A Draft keeps at least one run.** Contributors and Admins may remove a run from a Draft execution, and the remaining positions close up. Removing the only run is refused, matching create and the Edit form, which both require one or more test cases. To start over, a user edits the Draft or deletes it.
4. **"Add to existing execution" targets Draft executions only.** The test case is appended as the last run. Executions that already hold the test case are shown but can't be chosen. The test case must be Ready (ADR 0012 decision 5). Only a Draft's runs change, so Mark as Ready's re-check still applies.

## Alternatives Considered

- **Only the execution's own entries.** Rejected: outcomes, most of a run's story, would be missing. **Entries plus outcomes without bugs** was the recommended middle option. The user chose to include bugs, so the panel shows the whole defect trail found by the execution.
- **Allowing an empty Draft.** Run All already refuses an empty execution, but Mark as Ready, the form and the runs table would all need an empty state for something with no use.
- **Adding to Draft or Ready executions.** Saves a Back to Draft, but loosens the rule that runs change only in Draft, and adds a second place where Ready-ness must be checked.

## Consequences

- The execution panel's query joins activity entries to the execution's runs and their linked bugs. Run and bug entries are matched through `details`, so an index on `details->>'executionId'` may be needed once logs grow (not in v1).
- A bug linked after the fact (ADR 0013 decision 5) brings its whole history into the execution's panel, including entries from before the link.
- Environment and credential create, edit and delete get activity entries in the same slice. This isn't a new decision; it closes a gap against ADR 0007's every-mutation rule, and entries never include passwords.

## Revisit Triggers

- Testers find the bug entries noisy on long-running executions, which would mean narrowing decision 1 to bug creation and linking.
- Teams want to build a Ready execution up from the Test Cases screen, which would mean widening decision 4.
