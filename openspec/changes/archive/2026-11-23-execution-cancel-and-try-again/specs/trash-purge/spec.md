## MODIFIED Requirements

### Requirement: Purging keeps run history and bug records
Purging a test case SHALL keep its runs and their attempt history inside their executions, with the name and script captured when the execution started, and SHALL clear the links to it from those runs, attempts and bugs. Purging an execution SHALL remove its runs and their attempt history and clear the links to them from bugs, and the bugs SHALL remain.

#### Scenario: Purging a test case that was run
- **WHEN** a test case that has a run in a live execution and a bug pointing at it is purged
- **THEN** the run still shows the test case name, and the run and the bug no longer link to the test case

#### Scenario: Purging an execution with a bug filed from a run
- **WHEN** an execution whose run has a bug filed from it is purged
- **THEN** the bug still exists and no longer links to the run

#### Scenario: Purging a test case with attempt history
- **WHEN** a test case whose run has an earlier attempt is purged
- **THEN** the attempt still shows the recorded test case name and no longer links to the test case

#### Scenario: Purging a restarted execution
- **WHEN** an execution that was restarted is purged
- **THEN** its attempt history is removed with its runs
