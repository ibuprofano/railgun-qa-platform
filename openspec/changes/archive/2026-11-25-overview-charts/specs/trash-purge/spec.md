# Spec Delta

## MODIFIED Requirements

### Requirement: Purging a project removes everything in it
Purging a project SHALL remove all of its folders, test cases, executions with their runs, bugs, tags, environments with their credentials, project memberships, and Health Score snapshots. A user whose last active project it was SHALL fall back to another project.

#### Scenario: A project 31 days in the trash
- **WHEN** the purge runs 31 days after a project with test cases, an execution and a bug was deleted
- **THEN** the project and all of its content no longer exist, while the workspace's other projects are unchanged

#### Scenario: Snapshots go with their project
- **WHEN** a project with Health Score snapshots is purged
- **THEN** its snapshots no longer exist, and other projects' snapshots are unchanged
