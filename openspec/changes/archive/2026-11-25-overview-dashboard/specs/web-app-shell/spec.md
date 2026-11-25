# Spec Delta

## MODIFIED Requirements

### Requirement: Signing in lands the user on their project's Test Cases screen
The system SHALL take a user straight to their active project's Overview screen immediately after signing in or signing up, and when they open the app's root address while signed in. The active project is the one they last switched to, when it is still available to them.

#### Scenario: Landing after sign-in
- **WHEN** a user finishes signing in
- **THEN** they land on their active project's Overview screen

#### Scenario: Landing on the last active project
- **WHEN** a user who last switched to "Mobile App" signs in
- **THEN** they land on the Overview screen of "Mobile App"

#### Scenario: Opening the root address
- **WHEN** a signed-in user opens the app's root address
- **THEN** they are taken to the Overview screen

### Requirement: Pages that require a session are only reachable while signed in
The system SHALL redirect an unauthenticated visitor to the sign-in page when they request a page that requires a session, and SHALL redirect an already signed-in user away from the sign-in or sign-up pages. Every screen of the signed-in app SHALL require a session.

#### Scenario: An unauthenticated visitor is redirected away from a protected page
- **WHEN** an unauthenticated visitor requests a page that requires a session
- **THEN** they are redirected to the sign-in page instead

#### Scenario: A signed-in user is redirected away from sign-in or sign-up
- **WHEN** an already signed-in user requests the sign-in or sign-up page
- **THEN** they are redirected away from it instead

#### Scenario: Every app screen is protected
- **WHEN** an unauthenticated visitor requests the Overview, Executions, Bugs, Activity, Trash, Project Settings or Workspace Settings screen
- **THEN** they are redirected to the sign-in page instead

### Requirement: The app shell navigates between the project's screens
The signed-in app shell SHALL offer navigation to the Overview, Test Cases, Executions, Bugs, and Activity screens, in that order, each with its own icon, and indicate which one is current. The sidebar SHALL collapse to an icon-only rail and expand again; the user's choice SHALL be remembered across visits. While collapsed, each item SHALL still be identifiable by name (e.g. on hover or focus). On narrow screens the navigation SHALL open as an overlay instead of taking page width.

#### Scenario: Navigating to Executions
- **WHEN** a signed-in project member selects Executions in the shell's navigation
- **THEN** the Executions screen is shown and marked as the current screen

#### Scenario: Navigating to Bugs
- **WHEN** a signed-in project member selects Bugs in the shell's navigation
- **THEN** the Bugs screen is shown and marked as the current screen

#### Scenario: Navigating to Activity
- **WHEN** a signed-in project member with Viewer access selects Activity in the shell's navigation
- **THEN** the Activity screen is shown and marked as the current screen

#### Scenario: Navigating to the Overview
- **WHEN** a signed-in project member selects Overview, the first item in the navigation
- **THEN** the Overview screen is shown and marked as the current screen

#### Scenario: Collapsing the sidebar
- **WHEN** a user collapses the sidebar
- **THEN** only the items' icons remain visible, each still reachable and named on hover or focus, and the current screen stays marked

#### Scenario: The collapsed state is remembered
- **WHEN** a user collapses the sidebar and later reloads or returns to the app
- **THEN** the sidebar is still collapsed
