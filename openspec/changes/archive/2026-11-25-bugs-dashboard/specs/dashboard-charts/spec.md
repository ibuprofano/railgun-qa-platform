# Spec Delta

## ADDED Requirements

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
