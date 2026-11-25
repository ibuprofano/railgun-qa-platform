# Spec Delta

## ADDED Requirements

### Requirement: The Overview shows its four charts in the PRD layout
Below the KPI tiles, the Overview SHALL show the Health Score trend at full width, then the Pass Rate trend and Bug Velocity side by side, then the Run Outcomes donut next to the Top Failing Tests and Urgent Bugs panels. Each trend chart SHALL keep its own range.

#### Scenario: The layout
- **WHEN** a member opens the Overview on a wide screen
- **THEN** the Health Score trend spans the width, the two trends share a row, and the donut sits beside the two panels

### Requirement: The Health Score trend shows each day's score
The Health Score trend SHALL draw the score per UTC day over its range, with today's point equal to the Health Score tile. Days without a score SHALL be left off the line. With no score in the range, it SHALL read "No data yet.".

#### Scenario: Matching the tile
- **WHEN** the Health Score tile shows 62
- **THEN** the trend's last point is 62

#### Scenario: A new project
- **WHEN** the project has no completed run
- **THEN** the chart reads "No data yet."

### Requirement: Pass Rate and Bug Velocity trends show daily figures
The Pass Rate trend SHALL draw each day's pass rate, explaining in its tooltip that days without runs are drawn as 0. Bug Velocity SHALL draw two series, Reported and Resolved, per day.

#### Scenario: A busy day
- **WHEN** 8 of 10 runs completed on 12 November passed
- **THEN** the Pass Rate trend shows 80% for 12 November

#### Scenario: Reported versus resolved
- **WHEN** 3 bugs were reported and 1 resolved on 12 November
- **THEN** Bug Velocity shows Reported 3 and Resolved 1 for that day

### Requirement: Run Outcomes shows the last 30 days' split
The Run Outcomes donut SHALL show the Pass, Fail and Needs Review split of the last 30 days, with a fixed range and no selector. With no completed runs, it SHALL read "No completed runs yet.".

#### Scenario: No recent runs
- **WHEN** no run was completed in the last 30 days
- **THEN** the donut reads "No completed runs yet."
