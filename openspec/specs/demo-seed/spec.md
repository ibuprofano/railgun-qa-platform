# demo-seed Specification

## Purpose

A developer command that fills a real, signed-in user's default project with a consistent, believable demo dataset, so every screen can be demonstrated without hand-entering data.

## Requirements

### Requirement: The seed targets the default project of an existing user
The seed command SHALL take the target user's email address or Clerk user id and write into that user's default project, the one the app opens on sign-in. The user must have signed in at least once. If no such user exists, the command SHALL exit with a non-zero status and a message naming the problem, and SHALL write nothing.

#### Scenario: Seeding by email
- **WHEN** a developer runs the seed with the email of a user who has signed in
- **THEN** that user's default project contains the demo dataset, and the user sees it after signing in

#### Scenario: Seeding by Clerk user id
- **WHEN** a developer runs the seed with the Clerk user id of a user who has signed in
- **THEN** that user's default project contains the demo dataset

#### Scenario: Unknown user
- **WHEN** a developer runs the seed with an email that matches no Clerk user, or with a Clerk user id that has never signed in to the app
- **THEN** the command exits non-zero with a message saying which user could not be found, and nothing is written

#### Scenario: No target given
- **WHEN** a developer runs the seed with neither an email nor a Clerk user id
- **THEN** the command exits non-zero and prints its usage

### Requirement: The dataset covers every screen with consistent data
The seed SHALL add a Contributor and a Viewer teammate as project members, and a folder tree at least three levels deep. It SHALL add at least 25 test cases with Gherkin scripts in Ready, Draft and Deprecated status, and two environments with credentials. It SHALL add executions in Draft, Ready, In Progress, Paused, Completed and Done status, and bugs in several severities and statuses. Every row SHALL satisfy the rules the app itself enforces.

#### Scenario: Executions at every stage
- **WHEN** the seeded user opens the Executions screen
- **THEN** executions in Draft, Ready, In Progress, Paused, Completed and Done status are listed, and each one's done/total and Pass/Fail/Needs Review counts match its runs

#### Scenario: Started executions look started
- **WHEN** the seeded user opens a seeded execution that has started
- **THEN** its runs show the recorded test case names and scripts, its timer shows a non-zero elapsed time (advancing only for the In Progress one), and the Done execution shows who signed it off

#### Scenario: Bugs filed from runs
- **WHEN** the seeded user opens the Bugs screen
- **THEN** bugs of several severities and statuses are listed, most linked to a failed run with a failed step, and opening that run shows the bug

#### Scenario: Revealable credentials
- **WHEN** the seeded user, as a Contributor or above, reveals a seeded environment credential
- **THEN** the password is shown, so the seeded credential was encrypted with the workspace's key

#### Scenario: Test cases show their last outcome
- **WHEN** the seeded user opens the Test Cases screen
- **THEN** the seeded folders appear in the tree, and test cases that have a recorded outcome show it

### Requirement: The dataset has a believable history
Seeded rows SHALL carry creation and update times spread over the three weeks before the seed runs, in an order that matches the lifecycle: created before started, started before completed. One seeded bug, and the tags it carries, SHALL be older, reported about six weeks before the seed runs (see "One seeded bug needs attention for being idle"). Each seeded change of a kind the app logs (folder creation, tag creation, execution lifecycle steps, run outcomes, bug filing and updates) SHALL have an activity entry with the matching time and the acting teammate or user, written the way the app writes it.

#### Scenario: History spans weeks and people
- **WHEN** the seeded project's activity entries are listed
- **THEN** they span roughly the last three weeks, apart from the older bug and its tags, and name more than one actor

### Requirement: Seeding is additive, idempotent and all-or-nothing
The seed SHALL never modify or remove rows that already exist in the project. Its folders and test cases SHALL be placed after the project's existing root items. Running it again for the same user SHALL add nothing. If any part fails, nothing from that run SHALL remain.

#### Scenario: Existing data is kept
- **WHEN** a developer seeds a project that already has test cases, folders and executions
- **THEN** all of them are unchanged, and the seeded root folders come after the existing root folders

#### Scenario: Running twice
- **WHEN** a developer runs the seed a second time for the same user
- **THEN** the command reports that the demo data is already present, and no row is added or changed

#### Scenario: A clashing folder name
- **WHEN** the project already has a root folder with the same name as a seeded root folder
- **THEN** the command exits non-zero naming that folder, and nothing from this run is written

### Requirement: The seed respects tenant isolation
The seed SHALL write only into the target user's workspace, through the application's database role with that workspace's tenant context, so row-level security applies to every write.

#### Scenario: Other workspaces are untouched
- **WHEN** a developer seeds one user's project
- **THEN** no row in any other workspace is added or changed

### Requirement: Seeded resolved bugs carry a resolution date
Every seeded bug in Resolved, Closed or Won't Fix status SHALL carry a resolution date equal to the time of its seeded status change. Seeded bugs in Open or In Progress SHALL carry none.

#### Scenario: A seeded resolved bug
- **WHEN** the seeded user reads a seeded bug that was resolved 12 days ago
- **THEN** its resolution date is 12 days ago, the time of its seeded status-change entry

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

### Requirement: One seeded bug needs attention for being idle
The seed SHALL add one Open bug of Medium severity, reported about six weeks before the seed runs and never updated since, not filed from a run. On the Bugs dashboard it SHALL be listed in Needs Attention as Idle and counted as Old in Backlog Age.

#### Scenario: The idle bug on the dashboard
- **WHEN** the seeded user opens the Bugs dashboard
- **THEN** Needs Attention lists the six-week-old bug with the Idle badge, and Backlog Age shows an Old part of 1

### Requirement: Seeded bugs carry tags in uneven numbers
The seed SHALL add project tags, each with a colour, and attach them to seeded bugs so that at least one tag is carried by three or more bugs and at least one by exactly one. The tags SHALL be created before the earliest bug that carries them. A bug's filing entry SHALL name the tags it was filed with, as the app writes it.

#### Scenario: The tag cloud on the demo
- **WHEN** the seeded user opens the Bugs dashboard
- **THEN** Bugs by Tag shows several tags in different sizes

#### Scenario: Tags on the bug list
- **WHEN** the seeded user filters the bug list by a seeded tag
- **THEN** only the seeded bugs carrying it are listed
