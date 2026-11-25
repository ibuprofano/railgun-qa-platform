# Spec Delta

## MODIFIED Requirements

### Requirement: The app shell navigates between the project's screens
The signed-in app shell SHALL offer navigation to the Test Cases, Executions, Bugs, and Activity screens, each with its own icon, and indicate which one is current. The sidebar SHALL collapse to an icon-only rail and expand again; the user's choice SHALL be remembered across visits. While collapsed, each item SHALL still be identifiable by name (e.g. on hover or focus). On narrow screens the navigation SHALL open as an overlay instead of taking page width.

#### Scenario: Navigating to Executions
- **WHEN** a signed-in project member selects Executions in the shell's navigation
- **THEN** the Executions screen is shown and marked as the current screen

#### Scenario: Navigating to Bugs
- **WHEN** a signed-in project member selects Bugs in the shell's navigation
- **THEN** the Bugs screen is shown and marked as the current screen

#### Scenario: Navigating to Activity
- **WHEN** a signed-in project member with Viewer access selects Activity in the shell's navigation
- **THEN** the Activity screen is shown and marked as the current screen

#### Scenario: Collapsing the sidebar
- **WHEN** a user collapses the sidebar
- **THEN** only the items' icons remain visible, each still reachable and named on hover or focus, and the current screen stays marked

#### Scenario: The collapsed state is remembered
- **WHEN** a user collapses the sidebar and later reloads or returns to the app
- **THEN** the sidebar is still collapsed
