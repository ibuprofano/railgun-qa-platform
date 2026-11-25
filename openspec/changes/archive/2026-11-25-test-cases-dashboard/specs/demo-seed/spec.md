# Spec Delta

## ADDED Requirements

### Requirement: Seeded test cases carry edit times
Every seeded test case SHALL carry a last change time: its seeded script edit time when it has one, else its creation time. A seeded test case without a seeded script edit SHALL carry no script edit time.

#### Scenario: An unedited seeded test case
- **WHEN** the seeded user reads a seeded test case created 18 days ago and never edited
- **THEN** it reports a creation time and a last change time of 18 days ago, and no script edit time

### Requirement: Some seeded test cases had their script edited after a completed run
At least two seeded test cases SHALL have a script edit a few days after one of their runs completed and before any later run started. Each edit SHALL be logged as the app logs it, by a teammate, with the edit's time. Runs started before the edit, and bugs filed from them, SHALL keep the script as it was then; runs started after it SHALL keep the current script.

#### Scenario: Trend Reset on the demo
- **WHEN** the seeded user opens a seeded test case whose script was edited after its last completed run
- **THEN** its detail shows the Trend Reset banner, and its script edit time and last change time are the time of the edit

#### Scenario: The edit is in the history
- **WHEN** the seeded user filters the Activity screen to Test Cases
- **THEN** each seeded script edit appears as an update of that test case's script, at its seeded time, by the teammate who made it

#### Scenario: Earlier runs keep the old script
- **WHEN** the seeded user opens a run of an edited test case from an execution that started before the edit
- **THEN** the run shows the script from before the edit, which differs from the test case's current script

### Requirement: The seeded runs fill the failing and most-run rankings
The seed SHALL give at least three Ready test cases 3 or more completed runs including a Fail, so Top Failing lists them on the Overview and the Test Cases dashboard. At least one failing test case SHALL keep fewer than 3 completed runs, so the unranked count shows too. The extra executions SHALL be signed off, without auto-created bugs.

#### Scenario: Top Failing on the demo
- **WHEN** the seeded user opens the Test Cases dashboard
- **THEN** Top Failing lists "Account locks after five failed sign-ins" first, at 100% (3/3), and says that failing test cases with fewer than 3 completed runs aren't ranked yet

