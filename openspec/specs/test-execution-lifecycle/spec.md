# test-execution-lifecycle Specification

## Purpose

Defines how an execution moves from Draft through Ready, In Progress, Paused, and Completed to Done, how its runs record their test case at start and receive outcomes, and how elapsed time is measured.

## Requirements

### Requirement: Lifecycle transitions follow a fixed state machine
The system SHALL allow only these transitions: `Draft → Ready` (Mark as Ready), `Ready → Draft` (Back to Draft), `Ready → InProgress` (Run All), `InProgress → Paused` (Pause), `Paused → InProgress` (Resume), `InProgress → Completed` (automatic), `Completed → Done` (Sign Off), `InProgress → Canceled` and `Paused → Canceled` (Cancel), and `Completed → Ready`, `Done → Ready` and `Canceled → Ready` (Restart). Any other requested transition SHALL be refused with HTTP 409 and change nothing.

#### Scenario: Valid transition
- **WHEN** a Contributor marks a Draft execution as Ready
- **THEN** the execution's status becomes `Ready`

#### Scenario: Invalid transition is refused
- **WHEN** a Contributor requests Pause on a `Ready` execution
- **THEN** the request is rejected with HTTP 409 and the status stays `Ready`

#### Scenario: Concurrent conflicting transitions
- **WHEN** two callers each request Run All on the same `Ready` execution at the same time
- **THEN** exactly one succeeds and the other is rejected with HTTP 409

#### Scenario: Cancel from a status that does not allow it
- **WHEN** a Contributor requests Cancel on a `Completed` execution
- **THEN** the request is rejected with HTTP 409 and the status stays `Completed`

#### Scenario: Restart from a status that does not allow it
- **WHEN** a Contributor requests Restart on an `InProgress` execution
- **THEN** the request is rejected with HTTP 409 and nothing changes

### Requirement: Contributors and above drive the lifecycle; Viewers cannot
The system SHALL allow Mark as Ready, Back to Draft, Run All, Pause, Resume, Cancel, and Restart of a `Completed` or `Canceled` execution to callers with at least `Contributor` access. Restarting a `Done` execution SHALL require at least `Admin` access and be denied with HTTP 403 for Contributors. Callers with only `Viewer` access SHALL be denied with HTTP 403.

#### Scenario: A Viewer cannot start an execution
- **WHEN** a Viewer requests Run All on a `Ready` execution
- **THEN** the request is denied with HTTP 403 and the status stays `Ready`

#### Scenario: A Viewer cannot cancel
- **WHEN** a Viewer requests Cancel on an `InProgress` execution
- **THEN** the request is denied with HTTP 403 and the status stays `InProgress`

#### Scenario: A Contributor restarts a Canceled execution
- **WHEN** a Contributor requests Restart on a `Canceled` execution
- **THEN** the execution's status becomes `Ready`

#### Scenario: Only an Admin restarts a signed-off execution
- **WHEN** a Contributor requests Restart on a `Done` execution
- **THEN** the request is denied with HTTP 403 and the execution is unchanged

#### Scenario: An Admin restarts a signed-off execution
- **WHEN** an Admin requests Restart on a `Done` execution
- **THEN** the execution's status becomes `Ready` and it no longer reports a sign-off

### Requirement: An execution can be readied only when all its test cases are Ready
The system SHALL refuse Mark as Ready with HTTP 409 when any of the execution's runs refers to a test case that has since been deleted or whose status is no longer `Ready`.

#### Scenario: A test case was deleted while the execution was Draft
- **WHEN** a Contributor marks a Draft execution as Ready after one of its test cases was deleted
- **THEN** the request is rejected with HTTP 409 and the status stays `Draft`

#### Scenario: A test case left Ready while the execution was Draft
- **WHEN** a Contributor marks a Draft execution as Ready after one of its test cases was changed to `Deprecated` or `Draft`
- **THEN** the request is rejected with HTTP 409 and the status stays `Draft`

### Requirement: Run All starts a non-empty execution in Manual mode only
The system SHALL accept Run All with mode `Manual`. Mode `Automated` SHALL be rejected with HTTP 422 as currently unavailable. Run All on an execution with no runs SHALL be rejected with HTTP 409.

#### Scenario: Starting manually
- **WHEN** a Contributor requests Run All in `Manual` mode on a `Ready` execution with runs
- **THEN** the execution's status becomes `InProgress` and its elapsed timer starts

#### Scenario: Automated mode is unavailable
- **WHEN** a Contributor requests Run All in `Automated` mode
- **THEN** the request is rejected with HTTP 422 and the status stays `Ready`

#### Scenario: An empty execution cannot start
- **WHEN** a Contributor requests Run All on a `Ready` execution with no runs
- **THEN** the request is rejected with HTTP 409

### Requirement: Starting an execution snapshots each run's test case
When an execution starts, the system SHALL record on each run the name and Gherkin script of its test case as they are at that moment. From then on, the run SHALL report the recorded values regardless of later edits to or deletion of the test case.

#### Scenario: Later edits do not change run history
- **WHEN** an execution starts, and afterwards its test case's name and script are edited
- **THEN** the run still reports the name and script recorded at start

#### Scenario: Later deletion does not change run history
- **WHEN** a test case of a Completed execution is deleted
- **THEN** that execution's run still reports the recorded name and script

### Requirement: Elapsed time counts only while In Progress
The system SHALL report, for each execution, the elapsed milliseconds accumulated across completed In Progress periods and, while `InProgress`, the timestamp the current period began, so that elapsed time excludes time spent `Paused` and stops once the execution leaves `InProgress`.

#### Scenario: Pausing stops the clock
- **WHEN** an execution runs for some time and is then paused
- **THEN** it reports the accumulated elapsed time and no current-period start, and the reported elapsed time does not grow while Paused

#### Scenario: Resuming restarts the clock
- **WHEN** a Paused execution is resumed
- **THEN** it reports the previously accumulated elapsed time unchanged plus a new current-period start

### Requirement: Contributors and above record manual run outcomes
The system SHALL allow a caller with at least `Contributor` access to set a run's outcome to `Pass`, `Fail`, or `Needs Review` while its execution is `InProgress` or `Completed`. Setting an outcome in any other execution status SHALL be refused with HTTP 409; any other outcome value SHALL be rejected with HTTP 400.

#### Scenario: Recording a Pass
- **WHEN** a Contributor sets a run of an `InProgress` execution to `Pass`
- **THEN** the run's outcome is `Pass`

#### Scenario: Outcomes cannot be recorded while Paused
- **WHEN** a Contributor sets a run's outcome on a `Paused` execution
- **THEN** the request is rejected with HTTP 409

#### Scenario: Outcomes cannot be changed after Cancel
- **WHEN** a Contributor sets the outcome of a `Pass` or `Pending` run of a `Canceled` execution
- **THEN** the request is rejected with HTTP 409 and the run keeps its outcome

#### Scenario: A run cannot be reset to Pending
- **WHEN** a Contributor sets a run's outcome to `Pending`
- **THEN** the request is rejected with HTTP 400

#### Scenario: A Viewer cannot record outcomes
- **WHEN** a Viewer sets a run's outcome
- **THEN** the request is denied with HTTP 403

### Requirement: An execution completes when every run has an outcome
The system SHALL move an `InProgress` execution to `Completed`, in the same operation, when the last `Pending` run receives an outcome, and stop its elapsed timer.

#### Scenario: Last outcome completes the execution
- **WHEN** a Contributor records an outcome on the only remaining `Pending` run of an `InProgress` execution
- **THEN** the execution's status is `Completed` and its elapsed time no longer grows

#### Scenario: Needs Review counts as an outcome
- **WHEN** the last `Pending` run is set to `Needs Review`
- **THEN** the execution's status is `Completed`

### Requirement: Only an Admin can sign off, and only without Needs Review runs
The system SHALL allow a caller with at least `Admin` access to sign off a `Completed` execution, moving it to `Done` and recording who signed off and when. Sign off SHALL be refused with HTTP 409 while any run is `Needs Review`, and denied with HTTP 403 for Contributors and Viewers.

#### Scenario: Signing off
- **WHEN** an Admin signs off a `Completed` execution whose runs are all `Pass` or `Fail`
- **THEN** the execution's status is `Done` and it reports the signing Admin and time

#### Scenario: Needs Review blocks sign-off
- **WHEN** an Admin signs off a `Completed` execution with one `Needs Review` run
- **THEN** the request is rejected with HTTP 409 and the status stays `Completed`

#### Scenario: Resolving Needs Review unblocks sign-off
- **WHEN** a Contributor changes that run from `Needs Review` to `Fail`, and the Admin signs off again
- **THEN** the execution's status is `Done`

#### Scenario: A Contributor cannot sign off
- **WHEN** a Contributor signs off a `Completed` execution
- **THEN** the request is denied with HTTP 403

### Requirement: Lifecycle changes and outcomes are recorded in the activity log
The system SHALL write an activity entry, in the same transaction as the change, for every lifecycle transition (including the automatic completion, Cancel and Restart) and every run outcome change. A Restart entry SHALL record the status restarted from, the elapsed time of the attempt that ended, the new attempt number, and how many runs were dropped.

#### Scenario: Run All is logged
- **WHEN** a Contributor starts an execution
- **THEN** an activity entry for that execution recording the transition and the acting user exists

#### Scenario: Automatic completion is logged
- **WHEN** an outcome causes an execution to complete
- **THEN** activity entries exist for both the outcome change and the completion

#### Scenario: Restart is logged with what it discarded
- **WHEN** a Contributor restarts a `Completed` execution that ran for 90 seconds, dropping one run
- **THEN** an activity entry for that execution records the transition from `Completed`, 90 seconds elapsed, attempt 2, and one dropped run

### Requirement: Cancel stops the execution and leaves unrun runs Pending
Canceling SHALL move an `InProgress` or `Paused` execution to `Canceled` and stop its elapsed timer, adding any current In Progress period to the accumulated time. Runs still `Pending` SHALL stay `Pending`, and recorded outcomes SHALL be kept.

#### Scenario: Canceling a running execution
- **WHEN** a Contributor cancels an `InProgress` execution with one `Pass` run and two `Pending` runs
- **THEN** the execution is `Canceled`, reports no current-period start, and its runs are still one `Pass` and two `Pending`

#### Scenario: Canceling a paused execution
- **WHEN** a Contributor cancels a `Paused` execution
- **THEN** the execution is `Canceled` and its accumulated elapsed time is unchanged

### Requirement: Restart resets the execution to Ready for a new attempt
Restarting SHALL return the execution to `Ready` and increase its attempt number by one. It SHALL reset elapsed time to zero and clear its start, completion and sign-off. Every remaining run SHALL be `Pending`, with no outcome author or time and no snapshot, so that the next Run All snapshots the test cases again.

#### Scenario: Restarting a completed execution
- **WHEN** a Contributor restarts a `Completed` execution at attempt 1 whose runs are `Pass` and `Fail`
- **THEN** the execution is `Ready` at attempt 2 with zero elapsed time and no completion time, and both runs are `Pending`

#### Scenario: The next Run All takes new snapshots
- **WHEN** a test case's name is edited after its execution was restarted, and the execution is run again
- **THEN** the run reports the edited name

### Requirement: Restart drops runs whose test case was deleted
Restarting SHALL remove the runs whose test case has been deleted or purged. The remaining runs SHALL keep their relative order with positions renumbered 1..n. Runs whose test case still exists SHALL be kept whatever its status. Restart SHALL be refused with HTTP 409, changing nothing, when no run would remain.

#### Scenario: One test case was deleted
- **WHEN** a Contributor restarts a `Completed` execution with runs A, B, C after B's test case was deleted
- **THEN** the execution has runs A and C at positions 1 and 2

#### Scenario: A deprecated test case is kept
- **WHEN** a Contributor restarts an execution after one of its test cases was changed to `Deprecated`
- **THEN** that test case's run is kept as `Pending`

#### Scenario: Every test case was deleted
- **WHEN** a Contributor restarts an execution whose every test case has been deleted
- **THEN** the request is rejected with HTTP 409 and the execution keeps its status, runs and attempt number

### Requirement: Restart keeps each run's previous result as attempt history
Before resetting, Restart SHALL record, for every run including the ones it drops, an attempt entry holding the attempt number that ended, the run's position, outcome, who set it and when, and the recorded test case name and script. Attempt entries SHALL be kept when their run is dropped.

#### Scenario: Results are kept as attempt 1
- **WHEN** a Contributor restarts an execution at attempt 1 whose run was set to `Fail` by Ana
- **THEN** that run's attempt history holds attempt 1 with outcome `Fail`, set by Ana, and the name and script recorded at start

#### Scenario: A dropped run's history is kept
- **WHEN** a Restart drops a run whose test case was deleted
- **THEN** an attempt entry for that run's result exists for the execution

### Requirement: Executions report their attempt and runs list their earlier attempts
Every execution SHALL report its current attempt number, 1 for an execution never restarted. A caller with at least `Viewer` access SHALL be able to list a run's earlier attempts, newest first, each with its attempt number, outcome, who set it and when, and recorded name and script. Requests for a run of another workspace SHALL return HTTP 404.

#### Scenario: A new execution is at attempt 1
- **WHEN** a Viewer retrieves an execution that was never restarted
- **THEN** it reports attempt 1, and listing any of its runs' attempts returns an empty list

#### Scenario: Listing a run's attempts after two restarts
- **WHEN** a Viewer lists the attempts of a run of an execution restarted twice
- **THEN** attempts 2 and 1 are returned in that order

#### Scenario: Attempts are tenant-isolated
- **WHEN** a caller lists attempts of a run belonging to another workspace through their own project's route
- **THEN** the request returns HTTP 404
