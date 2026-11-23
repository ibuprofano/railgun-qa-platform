## ADDED Requirements

### Requirement: A Contributor or above can add a test case to a Draft execution
The system SHALL allow a caller with at least `Contributor` access to add one of the project's test cases to a `Draft` execution as a new `Pending` run at the last position. The test case SHALL be `Ready` and not deleted, else HTTP 400. If the execution already holds it, the request SHALL be refused with HTTP 409. A non-Draft execution SHALL be refused with HTTP 409.

#### Scenario: Adding to a Draft
- **WHEN** a Contributor adds test case D to a Draft execution with runs A, B, C
- **THEN** the execution's runs are A, B, C, D at positions 1 to 4, with D `Pending`

#### Scenario: A test case already in the execution
- **WHEN** a Contributor adds test case B to a Draft execution that already has a run for B
- **THEN** the request is rejected with HTTP 409 and the runs are unchanged

#### Scenario: Only Ready test cases can be added
- **WHEN** a Contributor adds a `Draft`, `Deprecated` or deleted test case, or one of another project
- **THEN** the request is rejected with HTTP 400

#### Scenario: Adding outside Draft is refused
- **WHEN** a Contributor adds a test case to a `Ready` execution
- **THEN** the request is rejected with HTTP 409 and the runs are unchanged

#### Scenario: A Viewer cannot add
- **WHEN** a Viewer adds a test case to a Draft execution
- **THEN** the request is denied with HTTP 403

### Requirement: A Contributor or above can remove a run from a Draft execution
The system SHALL allow a caller with at least `Contributor` access to remove one run of a `Draft` execution, renumbering the remaining positions 1..n and keeping their order and ids. Removing the only run SHALL be refused with HTTP 409. A non-Draft execution SHALL be refused with HTTP 409, and a run that is not part of the execution SHALL return HTTP 404.

#### Scenario: Removing a run
- **WHEN** a Contributor removes run B of a Draft execution with runs A, B, C
- **THEN** the execution's runs are A and C at positions 1 and 2, with the same run ids as before

#### Scenario: The last run cannot be removed
- **WHEN** a Contributor removes the only run of a Draft execution
- **THEN** the request is rejected with HTTP 409 and the run remains

#### Scenario: Removing outside Draft is refused
- **WHEN** a Contributor removes a run of a `Ready` execution
- **THEN** the request is rejected with HTTP 409 and the runs are unchanged

#### Scenario: A run of another execution
- **WHEN** a Contributor removes a run id that belongs to another execution
- **THEN** the request returns HTTP 404

#### Scenario: A Viewer cannot remove
- **WHEN** a Viewer removes a run
- **THEN** the request is denied with HTTP 403

### Requirement: Adding and removing runs are recorded in the activity log
The system SHALL write an activity entry for the execution, naming the test case and the acting user, in the same transaction as adding or removing a run, and SHALL announce the change to open live-update streams.

#### Scenario: Adding is logged
- **WHEN** a Contributor adds a test case to a Draft execution
- **THEN** an activity entry for that execution naming the test case and the Contributor exists

#### Scenario: Removing is logged
- **WHEN** a Contributor removes a run
- **THEN** an activity entry for that execution naming the removed run's test case exists
