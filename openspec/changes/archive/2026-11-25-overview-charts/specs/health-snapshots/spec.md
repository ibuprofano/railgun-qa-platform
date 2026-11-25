# Spec Delta

## Purpose

Recording each project's Health Score once a day, so the Health Score trend shows the score as it actually stood (PRD §6.1, ADR 0024).

## ADDED Requirements

### Requirement: Every live project's score is recorded once per UTC day
A daily job SHALL record, for every live project in every workspace, the Health Score, band and four components as they stand when it runs, labelled with the UTC day that just ended. A project in the Trash SHALL be skipped. A project with no completed run SHALL be recorded with no score and no band.

#### Scenario: A live project
- **WHEN** the job runs just after midnight UTC on 25 November for a project scoring 72
- **THEN** a snapshot for that project dated 24 November holds 72, At Risk and its four components

#### Scenario: A trashed project
- **WHEN** the job runs while a project is in the Trash
- **THEN** no snapshot is recorded for it

#### Scenario: No completed runs yet
- **WHEN** the job runs for a project with test cases but no completed run
- **THEN** its snapshot records no score and no band

### Requirement: A recorded day is never changed
The job SHALL never overwrite a snapshot that already exists for a project and day. Running it again for the same day SHALL record nothing new. Later edits, deletions and restores SHALL leave recorded snapshots unchanged.

#### Scenario: Running twice
- **WHEN** the job runs twice for the same day
- **THEN** each project has exactly one snapshot for that day, with the values of the first run

#### Scenario: A later change
- **WHEN** a bug is resolved the day after a snapshot was recorded
- **THEN** that snapshot still holds the score it recorded

### Requirement: A failing project doesn't block the others
A failure while recording one project SHALL NOT prevent the other projects from being recorded. The job SHALL report the failure so it is retried.

#### Scenario: One project fails
- **WHEN** recording one project fails during a run
- **THEN** every other project's snapshot for that day is still recorded
