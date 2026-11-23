## MODIFIED Requirements

### Requirement: A Ready test case can be run directly from the Test Cases screen
For Contributors and Admins, a Ready test case's detail SHALL offer Run with two choices: "New execution", which opens the new-execution form with that test case already picked, and "Add to existing execution…", which adds it to a Draft execution. Run SHALL not be offered for Draft or Deprecated test cases, or to Viewers.

#### Scenario: Running a test case
- **WHEN** a Contributor selects Run → New execution on a Ready test case and saves the form with a name
- **THEN** a Draft execution containing that test case is created, and the user is on the Executions screen with it selected

#### Scenario: Not offered for a Draft test case
- **WHEN** a Contributor views a Draft test case
- **THEN** Run is not offered

## ADDED Requirements

### Requirement: A test case can be added to an existing Draft execution
"Add to existing execution…" SHALL list the project's Draft executions. Executions that already hold the test case SHALL be shown but not selectable, marked as already including it. Choosing one SHALL add the test case as its last run and take the user to the Executions screen with that execution selected. When there are no Draft executions, the dialog SHALL say so.

#### Scenario: Adding to a Draft
- **WHEN** a Contributor chooses Run → Add to existing execution… on test case "Login" and picks Draft execution "Smoke"
- **THEN** "Smoke" gains "Login" as its last run, and the user is on the Executions screen with "Smoke" selected

#### Scenario: An execution that already has the test case
- **WHEN** the dialog lists Draft execution "Regression", which already has a run for "Login"
- **THEN** "Regression" is shown as already including it and cannot be chosen

#### Scenario: No Draft executions
- **WHEN** the project has no Draft executions
- **THEN** the dialog says there are none and suggests creating a new execution

### Requirement: Contributors remove runs from a Draft execution
For Contributors and Admins, each run row of a Draft execution SHALL offer a remove control. Removing SHALL take the run out of the table and renumber the rest. When only one run remains, the control SHALL be unavailable and say why. It SHALL NOT be offered outside Draft or to Viewers. A refusal SHALL show the server's reason and keep the runs as they were.

#### Scenario: Removing a run
- **WHEN** a Contributor removes the second of three runs of a Draft execution
- **THEN** the table shows the other two runs at positions 1 and 2

#### Scenario: The last run
- **WHEN** a Contributor views a Draft execution with one run
- **THEN** that run's remove control is unavailable, saying a Draft needs at least one test case

#### Scenario: Not offered outside Draft
- **WHEN** a Contributor views a Ready execution
- **THEN** no run row offers a remove control

### Requirement: The execution detail shows its history
The execution detail SHALL include a History section listing the execution's history (lifecycle changes, run outcomes, and changes to bugs linked to its runs), newest first, each as a sentence naming who did what and when. It SHALL show 20 entries at a time with "Load more" while older entries exist. It SHALL refresh when the execution changes.

#### Scenario: Reading the history
- **WHEN** a Viewer opens a Completed execution that Ana started and in which Bo set run 2 to Fail
- **THEN** the History section lists, newest first, Bo setting run 2 to Fail and Ana starting the execution, each with its time

#### Scenario: Loading more
- **WHEN** an execution has more than 20 history entries and the user chooses "Load more"
- **THEN** the next older entries are appended below

#### Scenario: Refreshed by a change
- **WHEN** the user cancels the execution from the detail view
- **THEN** the History section shows the cancel entry first without reloading the page
