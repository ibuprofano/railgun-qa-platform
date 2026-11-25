# dashboard-charts Specification

## Purpose

The web chart building blocks every dashboard uses (PRD §6.12.2, §6.12.4): line charts with selectable ranges and donuts, behaving and reading the same wherever they appear.

## Requirements

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

### Requirement: A word cloud sizes each word by the square root of its count
A word cloud SHALL size each word between a minimum and a maximum size, growing with the square root of its count: the smallest count gets the minimum and the largest the maximum. When every count is equal, every word SHALL have the same size.

#### Scenario: Square-root sizing
- **WHEN** a cloud with sizes 12 to 32 shows counts 1, 4 and 9
- **THEN** the words are sized 12, 22 and 32

#### Scenario: Equal counts
- **WHEN** every word in the cloud has a count of 3
- **THEN** every word has the same size

### Requirement: A word cloud interleaves large and small words
A word cloud SHALL place its words in a fixed order that alternates between the largest and the smallest remaining, so the large words don't cluster. Words with equal counts SHALL be ordered by name. The same words and counts SHALL always produce the same order.

#### Scenario: Five words
- **WHEN** a cloud shows counts a 5, b 4, c 3, d 2 and e 1
- **THEN** the words are placed in the order a, e, b, d, c

### Requirement: A word cloud word has a stable colour and a readout
Each word SHALL use its item's colour. A word without one SHALL get a colour from the chart palette that is always the same for that item. Hovering a word, or moving keyboard focus to it, SHALL show "name: count".

#### Scenario: Reading a word
- **WHEN** a member hovers "checkout", carried by 4 bugs
- **THEN** the cloud shows "checkout: 4"

#### Scenario: A word without a colour
- **WHEN** the same uncoloured item is drawn in two clouds
- **THEN** it has the same colour in both

### Requirement: A word cloud is readable without seeing it
A word cloud SHALL have an accessible name and a summary that lists its words with their counts, largest first.

#### Scenario: A screen reader user
- **WHEN** a screen reader reaches Bugs by Tag showing checkout 4 and ui 1
- **THEN** it announces the chart's name and a summary such as "checkout 4, ui 1"

### Requirement: Word cloud words never overlap, whatever their script
A word cloud SHALL lay out its words so that no two words in a row overlap and no word extends past the cloud's width, for Latin, accented and East Asian wide text alike. A wide character (CJK ideographs, kana, Hangul, full-width forms) SHALL take about twice the width of a Latin letter at the same size.

#### Scenario: Japanese and Latin tags side by side
- **WHEN** the Bugs by Tag cloud shows "決済", "search", "auth" and "モバイル"
- **THEN** each word keeps a gap to its neighbours, on screen and in print

#### Scenario: A wide word longer than the cloud
- **WHEN** a Japanese tag is too wide to fit the cloud at its size
- **THEN** it is shrunk to fit inside the cloud's width

### Requirement: Axis date labels stay inside the chart
A trend chart's and a stacked bar chart's date labels SHALL be drawn entirely inside the chart: the last label ends at the plot's right edge, and the first starts at the left edge when centring it would cross it. Date labels SHALL read as short days, such as "24 Nov", on screen and in a report.

#### Scenario: The last day of the range
- **WHEN** a Reported vs Resolved chart shows the 30 days ending 24 November
- **THEN** the "24 Nov" label is fully visible at the right end of the axis

#### Scenario: A chart in a report
- **WHEN** a chart's SVG is written for a report
- **THEN** its date labels read like "24 Nov", not "2026-11-24", and none is cut off
