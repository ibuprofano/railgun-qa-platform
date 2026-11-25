# Spec Delta

## Purpose

The web chart building blocks every dashboard uses (PRD §6.12.2, §6.12.4): line charts with selectable ranges and donuts, behaving and reading the same wherever they appear.

## ADDED Requirements

### Requirement: Trend charts have their own range selector
Every trend chart SHALL offer a range of 7, 15, 30 or 90 days, defaulting to 30, ending today. Changing one chart's range SHALL NOT change any other chart's.

#### Scenario: Changing one range
- **WHEN** a member sets the Pass Rate trend to 7 days
- **THEN** that chart shows 7 days, and every other chart keeps its own range

### Requirement: A trend chart has one point per day and shows values on hover or focus
A trend chart SHALL draw one point per day in its range, drawing a day with no data as 0. Hovering the chart, or moving focus along it with the keyboard, SHALL show the date and every visible series' value for the nearest day.

#### Scenario: A day with no runs
- **WHEN** no runs were completed on a day inside the Pass Rate trend's range
- **THEN** that day is drawn at 0%

#### Scenario: Hovering a day
- **WHEN** a member hovers the Bug Velocity chart near 12 November
- **THEN** it shows "12 Nov" with that day's Reported and Resolved counts

### Requirement: A multi-series chart's legend hides and shows series
In a chart with more than one series, each legend entry SHALL toggle its series. The axis SHALL rescale to the series still shown, and a hidden series' values SHALL not be shown on hover.

#### Scenario: Hiding a series
- **WHEN** a member selects "Reported" in the Bug Velocity legend
- **THEN** only the Resolved line is drawn, and the legend marks Reported as hidden

### Requirement: A donut shows its parts, total and percentages
A donut SHALL show its total in the centre, and a legend with each part's count and percentage of the total. Parts with a count of 0 SHALL be hidden. With a total of 0, the donut SHALL show its empty-state line instead.

#### Scenario: Run outcomes
- **WHEN** the last 30 days hold 30 Pass, 6 Fail and 4 Needs Review runs
- **THEN** the donut shows 40 in the centre, and the legend reads Pass 30 (75%), Fail 6 (15%), Needs Review 4 (10%)

#### Scenario: Nothing to show
- **WHEN** a donut's total is 0
- **THEN** it shows its empty-state line and no donut

### Requirement: Charts are readable without seeing them
Every chart SHALL have an accessible name and a one-sentence summary of what it currently shows, such as the latest value or the totals over its range. Its colours SHALL follow the theme, light or dark, using the meanings of PRD §6.12.4.

#### Scenario: A screen reader user
- **WHEN** a screen reader reaches the Pass Rate trend set to 30 days
- **THEN** it announces the chart's name and a summary such as "Pass rate over the last 30 days; 71% today"
