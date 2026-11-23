## ADDED Requirements

### Requirement: The bug detail shows its history
The bug detail SHALL include a History section listing the bug's own activity entries, newest first, each as a sentence naming who did what and when, 20 at a time with "Load more". It SHALL refresh after the user edits the bug.

#### Scenario: Reading a bug's history
- **WHEN** a Viewer opens a bug that Ana filed and Bo moved from Open to Resolved
- **THEN** the History section lists Bo's status change first, then Ana filing the bug

#### Scenario: Refreshed by an edit
- **WHEN** a Contributor changes the bug's severity in the detail
- **THEN** the severity change appears first in the History section
