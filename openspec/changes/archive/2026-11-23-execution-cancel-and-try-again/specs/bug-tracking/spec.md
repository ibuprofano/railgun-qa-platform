## MODIFIED Requirements

### Requirement: Failing a run auto-creates a bug when the execution asks for it
When a run's outcome is set to `Fail` on an execution with auto-create-bug-on-failure enabled, the system SHALL create a bug in the same operation: titled with the run's test case name, carrying the run's snapshot, severity `Medium`, status `Open`, reported by the user who set the outcome, and marked as automatically created. At most one bug SHALL be auto-created per run in each attempt of its execution.

#### Scenario: Auto-created on failure
- **WHEN** a Contributor sets a run to `Fail` on an execution with auto-create enabled
- **THEN** one Open, Medium bug titled with the test case name exists for that run, marked automatically created

#### Scenario: Not created when disabled
- **WHEN** a Contributor sets a run to `Fail` on an execution with auto-create disabled
- **THEN** no bug is created

#### Scenario: Only once per run
- **WHEN** a run is set to `Fail`, then `Pass`, then `Fail` again on an execution with auto-create enabled
- **THEN** exactly one auto-created bug exists for that run

#### Scenario: Failing again after a Restart creates a new bug
- **WHEN** a run fails with auto-create enabled, the execution is restarted and run again, and the run fails again
- **THEN** the run has two auto-created bugs, one recording attempt 1 and one recording attempt 2

## ADDED Requirements

### Requirement: A bug tied to a run records the attempt it was found in
When a bug is filed from a run, auto-created for a run, or linked to a run, the system SHALL record the run's execution's current attempt number on the bug. The bug SHALL report that attempt number and keep it if later restarts change the execution's attempt or drop the run. A bug never tied to a run SHALL report no attempt.

#### Scenario: Filing from a run in a second attempt
- **WHEN** a Contributor files a bug from a run of an execution at attempt 2
- **THEN** the bug reports attempt 2

#### Scenario: A restart does not change a bug's attempt
- **WHEN** a bug was filed from a run in attempt 1 and the execution is then restarted
- **THEN** the bug still reports attempt 1 and is still linked to the run

#### Scenario: A dropped run's bug keeps its attempt
- **WHEN** a Restart drops the run a bug was filed from
- **THEN** the bug still exists, no longer links to a run, and still reports its attempt

#### Scenario: A bug without a run has no attempt
- **WHEN** a Contributor files a bug that is not tied to a run
- **THEN** the bug reports no attempt
