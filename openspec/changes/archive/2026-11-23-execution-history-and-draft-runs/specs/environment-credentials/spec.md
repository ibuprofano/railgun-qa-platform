## ADDED Requirements

### Requirement: Environment changes are recorded in the activity log
The system SHALL write an activity entry under the Environments category, in the same transaction, when an environment is created, edited, or deleted. A creation entry SHALL name the credential aliases it was created with. An edit entry SHALL name the fields that changed and the credential aliases added, changed and removed. No entry SHALL contain a password.

#### Scenario: Creating an environment is logged
- **WHEN** an Admin creates environment "Staging" with credentials "admin" and "buyer"
- **THEN** an activity entry for "Staging" names both aliases and contains no password

#### Scenario: Editing an environment is logged
- **WHEN** an Admin changes the base URL of "Staging", changes the password of "admin", and removes "buyer"
- **THEN** the entry names the base URL as changed, "admin" as changed, and "buyer" as removed, and contains no password

#### Scenario: Deleting an environment is logged
- **WHEN** an Admin deletes environment "Staging"
- **THEN** an activity entry recording the deletion of "Staging" exists after the environment is gone

#### Scenario: A failed change logs nothing
- **WHEN** an Admin's edit is rejected for a duplicate credential alias
- **THEN** no new activity entry exists for that environment
