# Spec Delta

## ADDED Requirements

### Requirement: Test cases record when they were last changed
A test case SHALL record its last change time: set at creation, and again whenever its name, script, status or tags change or it is moved. An update that changes nothing SHALL leave it unchanged. Restoring from the Trash, and moving or renaming its folder, SHALL not change it. Test case reads SHALL report it with the creation time.

#### Scenario: A new test case
- **WHEN** a Contributor creates a test case
- **THEN** its last change time equals its creation time

#### Scenario: A tag change
- **WHEN** a Contributor changes only a test case's tags
- **THEN** its last change time becomes the time of that update

#### Scenario: A move
- **WHEN** a Contributor moves a test case to another folder
- **THEN** its last change time becomes the time of the move

#### Scenario: An update that changes nothing
- **WHEN** a Contributor saves a test case with the name and script it already has
- **THEN** its last change time is unchanged

### Requirement: Test cases record when their script was last edited
A test case SHALL record when its Gherkin script was last edited, or none if it was never edited after creation. Only an update that changes the script SHALL set it. Test case reads SHALL report it.

#### Scenario: Never edited
- **WHEN** a test case was created with a script and only its status changed since
- **THEN** it reports no script edit time

#### Scenario: A script edit
- **WHEN** a Contributor changes a test case's script
- **THEN** its script edit time and its last change time both become the time of that update

### Requirement: Existing test cases get edit times from their history
Test cases that existed before edit times were recorded SHALL get them from the activity log: the last change time from their latest update or move entry, or their creation time without one; the script edit time from their latest update entry that changed the script, or none.

#### Scenario: A test case edited before the upgrade
- **WHEN** a test case's script was changed 6 days ago and it was moved 2 days ago, before the upgrade
- **THEN** after the upgrade it reports a last change 2 days ago and a script edit 6 days ago
