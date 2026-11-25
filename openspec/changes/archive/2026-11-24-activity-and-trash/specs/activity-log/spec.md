# Spec Delta

## ADDED Requirements

### Requirement: A project's activity feed lists all of its entries
The system SHALL let a caller with at least `Viewer` access read every activity entry of a project, newest first, in the same shape as the item histories. Entries of other projects, and workspace entries that belong to no project, SHALL be excluded. A caller with no access to the project, including a member of another workspace, SHALL get HTTP 403.

#### Scenario: Entries from every part of the project
- **WHEN** a Viewer reads the feed of a project where a test case was created, an execution started and a bug filed
- **THEN** all three entries are returned, newest first

#### Scenario: Workspace and other-project entries are excluded
- **WHEN** a Viewer reads a project's feed after the workspace was renamed and a second project had a test case created
- **THEN** neither of those entries is returned

#### Scenario: System entries have no actor
- **WHEN** the purge has removed a bug from the project's trash
- **THEN** the feed includes the purge entry with no actor name

#### Scenario: A caller with no access is refused
- **WHEN** a caller with no effective access to the project reads its feed
- **THEN** the request is denied with HTTP 403

#### Scenario: Another workspace's member is refused
- **WHEN** a member of another workspace reads the project's feed
- **THEN** the request is denied with HTTP 403 and no entries are returned

### Requirement: The project feed can be filtered by entity type
The feed SHALL accept an optional type matching the Activity screen's filters, and return only that type's entries:
- test cases, executions, runs, bugs, folders, tags
- environments, including password reveals
- projects

Deleting, restoring and purging an item SHALL count under the item's own type. An unknown type SHALL be rejected with HTTP 400.

#### Scenario: Only runs
- **WHEN** a Viewer reads the feed filtered to runs, in a project where an execution was started and two runs got outcomes
- **THEN** only the two outcome entries are returned

#### Scenario: Password reveals count as environments
- **WHEN** a Viewer reads the feed filtered to environments after an environment was edited and a password revealed
- **THEN** both entries are returned

#### Scenario: A restore counts as its item's type
- **WHEN** a Viewer reads the feed filtered to folders after a folder was deleted and then restored
- **THEN** both the deletion and the restore entries are returned

#### Scenario: Unknown type
- **WHEN** a caller filters the feed by an unknown type
- **THEN** the request is rejected with HTTP 400

### Requirement: The project feed is paged newest first
The feed SHALL return at most 20 entries per request, with a cursor for the next, older page, or none when no older entries exist. A request with that cursor, and the same type filter, SHALL return only older entries. A malformed cursor SHALL be rejected with HTTP 400.

#### Scenario: Loading more
- **WHEN** a Viewer reads the feed of a project with 25 entries, then requests the next page with the returned cursor
- **THEN** the first response has the 20 newest entries and a cursor, and the second has the 5 oldest and no cursor

#### Scenario: Paging a filtered feed
- **WHEN** a Viewer pages the feed filtered to bugs
- **THEN** every page holds only bug entries, and no bug entry is skipped or repeated
