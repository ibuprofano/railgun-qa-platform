# Design

## Context

See proposal.md, Why. The relevant code:

- **`charts/word-cloud.ts`:**
  - `estimateWordWidth(label, size)` is `label.length × size × WORD_WIDTH_EM` (0.6).
  - `wordCloud` uses it to flow words into rows.
  - Its shrink-to-fit (`fit`) divides by `label.length × 0.6`.
  - `label.length` counts UTF-16 code units, so a character outside the BMP counts twice.
- **`charts/line.ts` and `charts/stacked-bar.ts`:**
  - Both pad the plot by 36 px on the left and 12 px on the right.
  - `xTicks` are `{ index, x, label }`, with `label` the ISO date. Line ticks sit on the points, so the last one is at `plot.right`. Bar ticks sit at bar centres.
- **Text:**
  - `charts/svg.ts` writes x ticks with `text-anchor="middle"` and the raw `tick.label`.
  - The web's `LineChart` and `StackedBarChart` also hard-code `textAnchor="middle"`, and format with `shortDate` from `chart-format.ts`, which uses the browser's locale.
- **Spike evidence** (ADR 0026): in both PDF libraries and in resvg, Japanese words overlapped their neighbours, and the last ISO label was clipped.

## Goals / Non-Goals

**Goals:**
- One width estimate that holds for Latin, accented and East Asian wide text, used by both the layout and shrink-to-fit.
- Tick anchors decided once in the geometry, so the screen and print agree.

**Non-Goals:**
- Real text measurement: the package stays DOM-free (ADR 0023).
- Localised month names in print. Reports can pass a formatter later.

## Decisions

### 1. Width per character class
`charWidthEm(codePoint)` returns **1** for East Asian wide and full-width code points and **0.6** for everything else. The wide ranges are:
- Hangul Jamo, U+1100–115F
- CJK radicals through Yi, U+2E80–A4CF
- Hangul syllables, U+AC00–D7A3
- CJK compatibility ideographs, U+F900–FAFF
- CJK compatibility forms, U+FE30–FE4F
- full-width forms, U+FF00–FF60 and U+FFE0–FFE6
- everything from U+20000 up (CJK extensions)

`estimateWordWidth(label, size)` then sums `charWidthEm` over the label's code points (`for…of`, so surrogate pairs count once) and multiplies by `size`. `fit` uses the same sum, so a long Japanese tag shrinks to the right size. `WORD_WIDTH_EM` stays exported as the Latin value.

**Why ranges, not Unicode's East Asian Width property:** the property needs a data table, and these ranges cover the scripts the PRD's locales and tag names can bring. A character that is missing from the ranges is only under-estimated as 0.6 em, the behaviour before this change.

**Alternative rejected:** a 1 em estimate for every character. Latin clouds would gain wide gaps.

### 2. Tick anchors in the geometry
`xTicks` entries become `{ index, x, label, anchor: 'start' | 'middle' | 'end' }`.
- **One tick:** `middle`, at its own `x`.
- **Last tick of several:** `end`, with `x = plot.right`.
- **First tick of several:** `start` with `x = plot.left` when its estimated half-width (the short label at 10 px, through decision 1's estimate) exceeds `plot.left`. Otherwise `middle`. With today's 36 px left padding the first tick stays `middle`, but the rule holds if the padding or labels change.
- **Every other tick:** `middle` at its own `x`.

For the stacked bar, the last label then ends at the plot edge rather than centring on the last bar. Its readout and selection still use each bar's own position.

**Why in the geometry:** both outputs read it, so the screen and the PDF can't disagree. The field is additive.

**Alternative rejected:** more right padding. The label would still overflow if it grew, and each chart would lose plot width.

### 3. Short day labels in print
`charts/svg.ts` gains `shortDayLabel(day)`, which turns `"2026-11-24"` into `"24 Nov"` with fixed English month abbreviations, parsing the string without any time zone. `lineChartSvg` and `stackedBarChartSvg` take an optional `formatDate = shortDayLabel` and write `text-anchor` from `tick.anchor`. The web keeps its locale-aware `shortDate` and reads `tick.anchor`.

## Risks / Trade-offs

- **[Estimates are still estimates]** → 1 em is the actual advance of CJK glyphs in Noto Sans JP. The 0.6 em Latin estimate was already generous, and the spike's images confirm both.
- **[A missed wide script]** → it falls back to today's behaviour. The range list is one function, easy to extend.
- **[Print month names are English]** → recorded as out of scope; the formatter option is the hook.

## Migration Plan

None. These are pure functions and component rendering; deploy with the web.
