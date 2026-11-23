## MODIFIED Requirements

### Requirement: Lifecycle actions are offered by status and role
The detail view SHALL offer only the actions valid for the execution's status: Edit, Mark as Ready, and Delete for Draft; Back to Draft and Run All for Ready; Pause and Cancel for In Progress; Resume and Cancel for Paused; Sign Off and Try Again for Completed; Try Again for Done and Canceled. Edit, Mark as Ready, Back to Draft, Run All, Pause, Resume, Cancel, and Try Again SHALL be shown to Contributors and Admins; Delete and Sign Off only to Admins; none to Viewers. On a Done execution, Try Again SHALL offer Restart only to Admins.

#### Scenario: Contributor on a Ready execution
- **WHEN** a Contributor views a Ready execution
- **THEN** Back to Draft and Run All are offered, and Delete and Sign Off are not

#### Scenario: Viewer sees no actions
- **WHEN** a Viewer views an execution in any status
- **THEN** no lifecycle action is offered

#### Scenario: Admin on a Completed execution
- **WHEN** an Admin views a Completed execution
- **THEN** Sign Off and Try Again are offered

#### Scenario: Contributor on an In Progress execution
- **WHEN** a Contributor views an In Progress execution
- **THEN** Pause and Cancel are offered

#### Scenario: Contributor on a Done execution
- **WHEN** a Contributor opens Try Again on a Done execution
- **THEN** Duplicate is offered and Restart is not

### Requirement: The run panel shows the bugs linked to that run
The run side panel SHALL list the bugs linked to the run, each with its title, status, and severity, and each navigating to that bug on the Bugs screen. When the execution has been restarted, the bugs SHALL be grouped by the attempt they were found in, the current attempt first.

#### Scenario: A run with a bug
- **WHEN** a project member opens a run that has one linked bug
- **THEN** the panel lists that bug, and selecting it opens it on the Bugs screen

#### Scenario: Bugs from two attempts
- **WHEN** a project member opens a run at attempt 2 with one bug from attempt 1 and one from attempt 2
- **THEN** the panel lists the attempt 2 bug under the current attempt and the attempt 1 bug under attempt 1

## ADDED Requirements

### Requirement: Cancel asks for confirmation
Cancel SHALL ask the user to confirm, saying that runs not yet run stay Pending and outcomes can no longer be changed. Confirming SHALL cancel the execution and stop its timer.

#### Scenario: Canceling after confirming
- **WHEN** a Contributor chooses Cancel on an In Progress execution and confirms
- **THEN** the execution shows as Canceled, its timer no longer runs, and the run panel no longer offers outcome controls

#### Scenario: Backing out
- **WHEN** a Contributor chooses Cancel and dismisses the confirmation
- **THEN** the execution is unchanged

### Requirement: Try Again offers Restart and Duplicate
Try Again SHALL let the user choose Restart or Duplicate. Restart SHALL ask for confirmation, explaining that results move to attempt history and the execution returns to Ready, and naming the runs that will be dropped because their test case was deleted. When every test case was deleted, Restart SHALL be unavailable with the reason shown.

#### Scenario: Restarting
- **WHEN** a Contributor chooses Try Again on a Canceled execution, picks Restart, and confirms
- **THEN** the execution shows as Ready at attempt 2 with every run Pending

#### Scenario: The confirmation names dropped runs
- **WHEN** a Contributor picks Restart on an execution where one run's test case was deleted
- **THEN** the confirmation names that run as one that will be dropped

#### Scenario: Nothing left to restart
- **WHEN** a Contributor opens Try Again on an execution whose every test case was deleted
- **THEN** Restart is unavailable with the reason, and Duplicate is still offered

### Requirement: Duplicate opens the execution form pre-filled from the source
Duplicate SHALL open the New Execution form named "<source name> (retry)", with the source's run conditions and every eligible test case selected in the source's run order. Test cases that were deleted or are no longer Ready SHALL be listed as not carried over, each with its reason. Saving SHALL create a new Draft execution and leave the source unchanged.

#### Scenario: Duplicating with a deprecated test case
- **WHEN** a Contributor duplicates a Done execution "Smoke" whose runs are A, B and C, after B was changed to Deprecated
- **THEN** the form is named "Smoke (retry)" with A and C selected, and B is listed as not carried over because it is no longer Ready

#### Scenario: Saving the duplicate
- **WHEN** the Contributor unticks C and saves
- **THEN** a new Draft execution with A only is created and selected, and "Smoke" is unchanged

### Requirement: The detail view shows the attempt and earlier results
Once an execution has been restarted, the header SHALL show its attempt number. The run panel SHALL list the run's earlier attempts, newest first, each with its outcome, who set it, and when.

#### Scenario: Attempt badge
- **WHEN** a project member views an execution at attempt 2
- **THEN** the header shows "Attempt 2"

#### Scenario: No badge before a restart
- **WHEN** a project member views an execution at attempt 1
- **THEN** the header shows no attempt number

#### Scenario: Earlier results in the run panel
- **WHEN** a project member opens a run whose attempt 1 outcome was Fail
- **THEN** the run panel lists attempt 1 as Fail with who set it and when
