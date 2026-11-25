# Spec Delta

## MODIFIED Requirements

### Requirement: Execution changes emit an event only when they commit
The system SHALL emit an `execution.changed` event carrying the execution's id whenever an execution is created, edited, deleted or restored from the trash, its runs are reordered, it changes lifecycle status, or a run's outcome is recorded. It SHALL emit the event only after the change commits. A refused or rolled-back change SHALL emit nothing.

#### Scenario: A colleague records an outcome
- **WHEN** a Contributor records an outcome on a run while another member has the project's stream open
- **THEN** that stream receives an `execution.changed` event with the execution's id

#### Scenario: A refused transition emits nothing
- **WHEN** a lifecycle action is refused with `409` because the execution is in the wrong status
- **THEN** no event is sent on any stream

#### Scenario: An execution is restored
- **WHEN** an Admin restores a deleted execution while another member has the project's stream open
- **THEN** that stream receives an `execution.changed` event with the execution's id

### Requirement: Changes to a run's linked bugs emit an event
The system SHALL emit a `run.bugs.changed` event carrying the execution id and run id when a run's set of linked bugs changes or a linked bug is edited, deleted or restored from the trash. This covers a bug filed from a run, a bug auto-created on Fail, and an existing bug linked to a run. It SHALL emit the event only after the change commits.

#### Scenario: A bug is auto-created on Fail
- **WHEN** a Contributor sets a run to Fail on an execution with auto-create bug on
- **THEN** open streams on the project receive `execution.changed` for the execution and `run.bugs.changed` for that run

#### Scenario: An unlinked bug is edited
- **WHEN** a Contributor edits a bug that is not linked to any run
- **THEN** no `run.bugs.changed` event is sent

#### Scenario: A linked bug is restored
- **WHEN** an Admin restores a deleted bug that is linked to a run of a live execution
- **THEN** open streams on the project receive `run.bugs.changed` for that run
