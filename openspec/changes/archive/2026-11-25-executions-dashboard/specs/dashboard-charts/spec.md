# Spec Delta

## ADDED Requirements

### Requirement: Stacked bars show daily counts by part
A stacked bar chart SHALL draw one bar per day in its range, stacking each visible series' count for that day in a fixed order, with a day of 0 drawn empty. It SHALL have its own range selector, legend toggles and readout, as trend charts do.

#### Scenario: One day's bar
- **WHEN** Runs Over Time shows 4 March with Passed 3, Failed 1 and Needs Review 2
- **THEN** that day's bar is 6 high, stacked Passed, Failed, Needs Review

#### Scenario: Hiding a series
- **WHEN** a member hides Passed in the legend
- **THEN** the bars stack only Failed and Needs Review, and the axis rescales to them

#### Scenario: Reading a day
- **WHEN** a member hovers or moves keyboard focus to 4 March
- **THEN** the chart shows "4 Mar" with each visible series' count for that day

### Requirement: Chart parts can be selected
A chart that filters something SHALL let the member select a donut part, or a stacked-bar segment of one day, by pointer or keyboard, and SHALL mark the selected part. Selecting the selected part again SHALL clear the selection. The keyboard path SHALL go through the legend for donuts and through the day readout for bars.

#### Scenario: Selecting a donut part
- **WHEN** a member selects "Fail" in the Run Outcomes legend
- **THEN** the chart reports Fail as selected and marks it, until the member selects Fail again

#### Scenario: Selecting a segment by keyboard
- **WHEN** a member moves focus along Runs Over Time to 4 March and chooses "Failed" in the readout
- **THEN** the chart reports 4 March · Failed as selected

### Requirement: A donut can order its parts by count
A donut SHALL be able to order its parts by count, largest first, in both the ring and the legend. Parts with equal counts SHALL keep their given order.

#### Scenario: Execution statuses
- **WHEN** the Execution Status donut has 1 Draft, 4 Done and 2 In Progress executions
- **THEN** the legend lists Done 4, In Progress 2, Draft 1
