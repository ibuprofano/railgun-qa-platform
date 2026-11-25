# Spec Delta

## ADDED Requirements

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
