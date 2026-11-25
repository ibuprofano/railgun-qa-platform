# Spec Delta

## Purpose

Defines the Bugs dashboard's data (PRD §6.4.4, with the shared definitions in §6.12): which bugs and tags it reads, how each is dated, who can read it, and the shared rules that turn them into tiles, daily series, splits, resolution times, tag counts and the Needs Attention list.

## ADDED Requirements

### Requirement: The Bugs dashboard is readable by every project member
The system SHALL return a project's Bugs dashboard data to any caller with at least `Viewer` access, in one read whose rows are consistent with each other. A caller with no role on the project SHALL get HTTP 403. The `dashboard` path SHALL never be read as a bug id. An unknown time zone SHALL be refused with HTTP 400.

#### Scenario: A Viewer reads the dashboard
- **WHEN** a Viewer reads their project's Bugs dashboard with `tz=Europe/Madrid`
- **THEN** the response holds the bug rows, the tags they carry, today's date in Madrid and the current time

#### Scenario: No access
- **WHEN** a member of another workspace reads the project's Bugs dashboard
- **THEN** the request is denied with HTTP 403

#### Scenario: Not a bug id
- **WHEN** a member requests `/projects/<id>/bugs/dashboard`
- **THEN** the dashboard is returned, not a "not found" for a bug named `dashboard`

#### Scenario: Unknown time zone
- **WHEN** a member reads the dashboard with `tz=Mars/Olympus`
- **THEN** the request is refused with HTTP 400

### Requirement: The dashboard covers every live bug of the project
The read SHALL include every bug of the project that is not in the Trash, in any status and severity, and no bug in the Trash (PRD §2.11). It SHALL not depend on the bug list's filters.

#### Scenario: A trashed bug
- **WHEN** the project has five bugs and one of them is in the Trash
- **THEN** the read holds four bug rows

#### Scenario: A bug of another project
- **WHEN** another project of the same workspace has a bug
- **THEN** that bug does not appear

### Requirement: Each bug row carries its fields, times and days
Each bug row SHALL carry the bug's id, title, severity, status, the ids of the tags it carries, and when it was created, last updated and resolved. It SHALL carry the calendar day, in the requested time zone, on which it was reported, and the day on which it was resolved, or none while it is not resolved.

#### Scenario: Dated in the caller's zone
- **WHEN** a bug was created at 23:30 UTC on 4 March and the dashboard is read with `tz=Europe/Madrid`
- **THEN** its reported day is 5 March

#### Scenario: An unresolved bug
- **WHEN** a bug is In Progress
- **THEN** its row has no resolution time and no resolved day

### Requirement: The read carries the tags its bugs use
The read SHALL include each tag carried by at least one live bug of the project, with its id, name and colour. Tags carried by no live bug SHALL not appear.

#### Scenario: A tag on test cases only
- **WHEN** the tag "smoke" is carried by test cases and by no bug
- **THEN** it does not appear in the read

### Requirement: The stat tiles count bugs by status and severity
Total Bugs SHALL count every live bug, with "N in progress" counting In Progress bugs. Open SHALL count bugs whose status is Open. Resolved SHALL count bugs whose status is Resolved, not Closed or Won't Fix, with "of N total". Critical (all time) SHALL count Critical bugs in any status.

#### Scenario: A mixed backlog
- **WHEN** a project has 2 Open, 1 In Progress, 2 Resolved, 1 Closed and 1 Won't Fix bug, and 2 of them are Critical, one Open and one Closed
- **THEN** the tiles read Total 7 ("1 in progress"), Open 2, Resolved 2 ("of 7 total") and Critical 2

### Requirement: Reported vs Resolved counts bugs per day
For each day of a range ending today, in the viewer's time zone, the Reported series SHALL count the bugs reported that day, and the Resolved series the bugs whose resolution date falls on that day. A day with no bugs SHALL count 0. The Critical chart SHALL apply the same rules to bugs whose current severity is Critical.

#### Scenario: One day
- **WHEN** on 4 March two bugs were reported and one bug was resolved, and one of the reported bugs is Critical
- **THEN** Reported vs Resolved shows 2 reported and 1 resolved for 4 March, and the Critical chart shows 1 reported and 0 resolved

#### Scenario: A reopened bug
- **WHEN** a bug resolved on 2 March is moved back to Open
- **THEN** 2 March's resolved count no longer includes it

### Requirement: The splits divide bugs by severity, status and age
All Bugs by Severity SHALL split every live bug by severity, and All Bugs by Status by its five statuses. Open by Severity SHALL split open bugs (Open or In Progress) by severity. Backlog Age SHALL split open bugs by the time since they were reported: under 7 days (Fresh), 7 to 30 days (Aging), over 30 days (Old), measured from the current time.

#### Scenario: Backlog age buckets
- **WHEN** three open bugs were reported 2 days, 7 days and 31 days ago, and a resolved bug 40 days ago
- **THEN** Backlog Age shows Fresh 1, Aging 1 and Old 1

#### Scenario: Exactly 30 days
- **WHEN** an open bug was reported exactly 30 days ago
- **THEN** it counts as Aging

### Requirement: Avg Resolution Time is computed per severity
For each severity with at least one resolved bug (Resolved, Closed or Won't Fix), the system SHALL report the average time from report to resolution date, rounded to whole days, and the number of resolved bugs it covers. Severities without resolved bugs SHALL be left out. Severities SHALL be listed Critical first.

#### Scenario: Two resolved High bugs
- **WHEN** two High bugs were resolved 2 days and 5 days after they were reported, and no other bug is resolved
- **THEN** Avg Resolution Time lists only High, with 4 days over 2 bugs

### Requirement: Tags are counted by the live bugs carrying them
Each tag in the read SHALL be counted by the number of live bugs carrying it, in any status.

#### Scenario: Counting a tag
- **WHEN** the tag "checkout" is carried by three bugs, one of which is in the Trash
- **THEN** "checkout" counts 2

### Requirement: Needs Attention lists open bugs that are Idle or Unattended
Needs Attention SHALL list each open bug (Open or In Progress) that is Idle, with no update for 30 days or more, or Unattended, Critical or High severity and still Open. A bug SHALL carry every badge that applies.

#### Scenario: An idle bug
- **WHEN** an In Progress Medium bug was last updated 30 days ago
- **THEN** it is listed with the Idle badge only

#### Scenario: An unattended bug
- **WHEN** a High bug is Open and was updated yesterday
- **THEN** it is listed with the Unattended badge only

#### Scenario: Not listed
- **WHEN** a Critical bug is In Progress and was updated yesterday, and a Low bug is Resolved and was last updated 60 days ago
- **THEN** neither is listed

### Requirement: Needs Attention is sorted by urgency
Needs Attention SHALL list Unattended bugs first, then by severity, Critical first, then by the longest time since the last update.

#### Scenario: Ordering
- **WHEN** the list holds an Idle Critical bug, an Unattended High bug, and two Idle Medium bugs last updated 40 and 50 days ago
- **THEN** the order is the High bug, the Critical bug, the Medium bug updated 50 days ago, then the one updated 40 days ago
