# Spec Delta

## ADDED Requirements

### Requirement: The Overview trends cover 90 days in one read
The system SHALL return a project's Overview trends to any caller with at least `Viewer` access, for the 90 days ending today:
- the daily pass-rate counts
- the daily reported and resolved bug counts
- the daily Health Score
- the last 30 days' outcome split

A caller with no access SHALL get HTTP 403.

#### Scenario: A Viewer reads the trends
- **WHEN** a Viewer reads their project's trends
- **THEN** each daily series holds 90 days, the latest being today

#### Scenario: No access
- **WHEN** a caller with no role on the project reads its trends
- **THEN** the request is denied with HTTP 403

### Requirement: Daily run and bug counts follow the viewer's time zone
The pass-rate and bug series SHALL be counted per calendar day in a time zone the caller names, as an IANA zone. Each day SHALL carry its completed runs, how many of them passed, the bugs reported and the bugs resolved by resolution date. An unknown zone SHALL be rejected with HTTP 400. Trashed items and earlier attempts' outcomes SHALL not count.

#### Scenario: A run near midnight
- **WHEN** a run's outcome was recorded at 23:30 UTC on 10 November and the caller names `Europe/Madrid`
- **THEN** it counts on 11 November

#### Scenario: Resolved by resolution date
- **WHEN** a bug was reported on 3 November and resolved on 9 November
- **THEN** it counts as reported on 3 November and resolved on 9 November

#### Scenario: Unknown zone
- **WHEN** a caller names `Mars/Olympus`
- **THEN** the request is rejected with HTTP 400

### Requirement: The Health Score history uses snapshots, recomputes gaps, and ends live
Each UTC day's Health Score SHALL come from:
- that day's snapshot, when one exists
- otherwise, a recomputation as of the end of that day: runs completed by then, test cases that existed, and bugs open at that moment, with today's test case statuses
- for today, the live score

Each point SHALL say which of the three it is. Days before the project's first completed run SHALL have no score.

#### Scenario: A recorded day
- **WHEN** a snapshot of 72 exists for 20 November, and the project's data has changed since
- **THEN** the history gives 72 for 20 November, marked as recorded

#### Scenario: A gap day
- **WHEN** no snapshot exists for 10 November, and on that day one Critical bug was open that is resolved now
- **THEN** the recomputed score for 10 November counts that Critical bug in its bug pressure

#### Scenario: Today
- **WHEN** a caller reads the trends
- **THEN** today's point equals the Overview's live Health Score

#### Scenario: Before the first run
- **WHEN** a project's first run was completed 5 days ago
- **THEN** the days before it have no score

### Requirement: The outcome split covers the last 30 days
The trends SHALL include the counts of Pass, Fail and Needs Review among the runs completed in the last 30 days, under the same exclusions as every other figure.

#### Scenario: The split
- **WHEN** the last 30 days hold 30 Pass, 6 Fail and 4 Needs Review runs, and a Fail from 40 days ago
- **THEN** the split is 30, 6 and 4
