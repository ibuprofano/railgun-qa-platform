# ADR 0023: Chart Rendering

**Status:** Accepted, amended by [ADR 0025](0025-test-case-health-and-edit-times.md) (the package also holds the test case health rules) and [ADR 0026](0026-report-rendering-library-and-fonts.md) (rules for SVG text in reports; word-cloud and date-axis fixes)
**Date:** 2026-11-25
**Amends:** [ADR 0006](0006-report-generation.md) (decision 4: the web no longer uses a separate chart library), [ADR 0011](0011-frontend-ui-stack.md) (resolves the chart-library part of open question F6)

## Context

The four dashboards (PRD §6.1, §6.2.4, §6.3.6, §6.4.4, with the shared conventions in §6.12) need line charts, stacked daily bars, donuts and, on the Bugs dashboard, a tag word cloud. The same charts appear in the dashboard PDFs (PRD §8).

ADR 0006 already decided that report charts are "drawn once": a shared module turns a chart specification into a static SVG string, which the HTML export embeds and pdfmake accepts as an `svg` node. It left the web on "the UI's own chart library", with only the specifications shared. Open question F6 left that library undecided until the dashboards were built.

The screen charts need hover values, legend toggles, range selection and, on the Executions dashboard, clickable segments that filter a table. The PDF charts need none of that, but must look the same.

## Decision

1. **One in-house chart module draws every chart, for the screen and for reports.** It lives in `packages/reporting`. It is pure TypeScript with no DOM and no rendering library, and it turns a chart specification (series, categories, colours, size, range) into **chart geometry**: scales, axis ticks, line paths, bar rectangles, donut arcs, word positions.
2. **Two thin renderers read that geometry.**
   - A static serializer writes it as an SVG string, for the HTML and PDF exports (ADR 0006).
   - The web renders the same geometry as React SVG elements and adds the interactive layer on top: hover and focus values, legend toggles, range selection, click targets.

   A screen chart and its report counterpart therefore have identical shapes.
3. **Charts are authored within a small SVG subset:** paths, lines, rectangles, circles, text and groups, with flat fills and opacity. There are no gradients, filters, masks, patterns or `foreignObject`. This keeps every chart within what pdfmake's SVG conversion handles, which ADR 0006 flagged as a risk.
4. **Colours are passed in, not built in.** The web passes the theme's semantic colour tokens, so charts follow light and dark mode. Reports pass a fixed print palette with the same meanings (PRD §6.12.4).
5. **Every chart is accessible without hover.** It has an accessible name and a one-sentence summary of what it shows. Its values can also be reached from the keyboard.
6. **The package is compiled to JavaScript, and every app imports the build.** *(Amended 2026-11-25 by the `overview-charts` change; this originally said the web would compile the package's TypeScript source.)* The API and worker production builds compile only their own `src` and can't load TypeScript from elsewhere, and ADR 0024 needs the package in the worker now. So the package builds to `dist/` on install and is watched during development.

## Alternatives Considered

- **A React chart library (Recharts, visx, or similar).** It is the fastest way to build the screen charts. Reports would then need a second renderer, or a server-side React render to extract the SVG, which pulls React into the worker. Two renderers also bring back the visual drift ADR 0006 set out to avoid. Rejected.
- **A canvas library (Chart.js).** Canvas output can't be passed to pdfmake as vectors, and it is harder to make accessible. Rejected.
- **Headless Chromium for reports**, rendering the screen charts directly. ADR 0006 already rejected this for v1, for worker weight, and that reasoning stands.

## Consequences

- We own axes, tick spacing, date labels, arcs and the word cloud layout, so the geometry code needs its own unit tests. In exchange there is no chart dependency, and the bundle stays small.
- The PDF matches the screen by construction, which PRD §8 requires.
- `packages/reporting` becomes the first workspace package an app imports. It is built to `dist/` on every install (decision 6).

## Revisit Triggers

- The dashboards need interactions the module would struggle with, such as zooming, brushing or very large series.
- Report fidelity problems appear in the D1 spike (ADR 0006).
- The traceability graph (PRD §6.3.5) is not covered by this decision. It stays open under F6.
