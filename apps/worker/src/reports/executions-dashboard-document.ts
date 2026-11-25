import type { ExecutionReportData, ReportDonut } from '@railgun-qa/reporting';

/**
 * The Executions dashboard PDF's layout (specs/executions-dashboard-report;
 * executions-dashboard-report design.md decision 6), from `executionReportData`, in the
 * Bugs report's style. Plain data only: the render thread adds the page numbers.
 */

const MUTED = '#64748b';
const heading = (text: string) => ({ text, style: 'heading', margin: [0, 14, 0, 6] });

function donutBlock(d: ReportDonut) {
  const body =
    d.total === 0
      ? [{ text: d.emptyText, color: MUTED }]
      : [
          { svg: d.svg, width: d.width, font: 'NotoSansJP' },
          {
            table: {
              widths: [8, '*', 'auto'],
              body: d.legend.map((l) => [
                { canvas: [{ type: 'rect', x: 0, y: 3, w: 6, h: 6, color: l.color }] },
                l.label,
                { text: `${l.count} (${l.pct}%)`, alignment: 'right' },
              ]),
            },
            layout: 'noBorders',
            margin: [0, 4, 0, 0],
          },
        ];
  return { stack: [{ text: d.title, style: 'label', margin: [0, 0, 0, 4] }, ...body] };
}

export function executionsDashboardDocument(report: ExecutionReportData) {
  const t = report.tiles;
  const tile = (label: string, value: string, sub: string) => ({
    stack: [{ text: label.toUpperCase(), style: 'label' }, { text: value, fontSize: 20, bold: true }, { text: sub, color: MUTED, fontSize: 8 }],
  });
  const head = (labels: string[]) => labels.map((h) => ({ text: h, bold: true }));

  return {
    info: { title: `Executions dashboard — ${report.projectName}` },
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 40],
    defaultStyle: { font: 'NotoSansJP', fontSize: 9 },
    styles: {
      title: { fontSize: 18, bold: true },
      heading: { fontSize: 12, bold: true },
      label: { fontSize: 8, bold: true, color: MUTED },
    },
    pageNumbers: true,
    content: [
      { text: `Executions dashboard — ${report.projectName}`, style: 'title' },
      { text: `Generated ${report.generatedOn}`, color: MUTED, margin: [0, 2, 0, 4] },
      { text: report.filters.length ? `Filters: ${report.filters.join(' · ')}` : 'No filters', margin: [0, 0, 0, 8] },
      {
        columns: [
          tile('Executions', String(t.executions), `${t.active} active`),
          tile('Total Runs', String(t.totalRuns), `${t.completedRuns} completed`),
          tile('Pass Rate', t.passRatePct === null ? '—' : `${t.passRatePct}%`, t.passRatePct === null ? 'no results yet' : `${t.passedRuns} of ${t.completedRuns} runs`),
          tile('Avg Duration', t.avgDurationSeconds === null ? '—' : `${t.avgDurationSeconds.toFixed(1)}s`, 'per test run'),
        ],
        columnGap: 10,
      },
      ...report.charts.flatMap((c) => [heading(c.title), { svg: c.svg, width: c.width, font: 'NotoSansJP' }]),
      heading('Breakdown'),
      { columns: report.donuts.map(donutBlock), columnGap: 20 },
      ...(report.executions
        ? [
            heading(`Executions (${report.executions.length})`),
            report.executions.length === 0
              ? { text: 'No executions match these filters.', color: MUTED }
              : {
                  table: {
                    headerRows: 1,
                    widths: ['*', 'auto', 'auto', 'auto', 'auto'],
                    body: [
                      head(['Execution', 'Status', 'Environment', 'Browser', 'Completed']),
                      ...report.executions.map((e) => [e.name, e.status, e.environment ?? '—', e.browser, e.completedOn ?? '—']),
                    ],
                  },
                  layout: 'lightHorizontalLines',
                },
          ]
        : []),
      ...(report.runs
        ? [
            heading(`Runs (${report.runs.rows.length}) — ${report.runs.filter}`),
            report.runs.rows.length === 0
              ? { text: 'No runs match this filter.', color: MUTED }
              : {
                  table: {
                    headerRows: 1,
                    widths: ['*', 'auto', '*', 'auto', 'auto', 'auto'],
                    body: [
                      head(['Execution', '#', 'Test case', 'Outcome', 'Attempts', 'Bugs']),
                      ...report.runs.rows.map((r) => [r.execution, String(r.position), r.testCase, r.outcome, String(r.attempts), String(r.bugs)]),
                    ],
                  },
                  layout: 'lightHorizontalLines',
                },
          ]
        : []),
    ],
  };
}
