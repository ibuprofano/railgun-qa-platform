import type { ReportDonut, ReportRanking, TestCaseReportData } from '@railgun-qa/reporting';

/**
 * The Test Cases dashboard PDF's layout (specs/test-cases-dashboard-report;
 * test-cases-dashboard-report design.md decision 5), from `testCaseReportData`, in the
 * Bugs and Executions reports' style. Plain data only: the render thread adds the page
 * numbers.
 */

const MUTED = '#64748b';
const heading = (text: string) => ({ text, style: 'heading', margin: [0, 14, 0, 6] });
const head = (labels: string[]) => labels.map((h) => ({ text: h, bold: true }));
const pairs = <T>(items: T[]) => Array.from({ length: Math.ceil(items.length / 2) }, (_, i) => items.slice(i * 2, i * 2 + 2));

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

/** One ranking: rank, name and value rows, or its empty line; Top Failing's note below. */
function rankingBlock(r: ReportRanking) {
  const note = r.note ? [{ text: r.note, color: MUTED, fontSize: 8, margin: [0, 4, 0, 0] }] : [];
  const body =
    r.rows.length === 0
      ? r.note
        ? note
        : [{ text: r.emptyText, color: MUTED }]
      : [
          {
            table: {
              widths: [12, '*', 'auto'],
              body: r.rows.map((row) => [{ text: String(row.rank), color: MUTED }, row.name, { text: row.value, alignment: 'right' }]),
            },
            layout: 'lightHorizontalLines',
          },
          ...note,
        ];
  return { stack: [{ text: r.title, style: 'label', margin: [0, 0, 0, 4] }, ...body], margin: [0, 0, 0, 10] };
}

export function testCasesDashboardDocument(report: TestCaseReportData) {
  const tile = (t: TestCaseReportData['tiles'][number]) => ({
    stack: [{ text: t.label.toUpperCase(), style: 'label' }, { text: t.value, fontSize: 20, bold: true }, { text: t.subLabel, color: MUTED, fontSize: 8 }],
  });
  const attention = report.needsAttention;
  const attentionTitle =
    attention.filter === null
      ? `Needs Attention (${attention.total})`
      : `Needs Attention (${attention.rows.length} of ${attention.total})`;

  return {
    info: { title: `Test Cases dashboard — ${report.projectName}` },
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
      { text: `Test Cases dashboard — ${report.projectName}`, style: 'title' },
      { text: `Generated ${report.generatedOn}`, color: MUTED, margin: [0, 2, 0, 8] },
      { columns: report.tiles.map(tile), columnGap: 10 },
      ...report.charts.flatMap((c) => [heading(c.title), { svg: c.svg, width: c.width, font: 'NotoSansJP' }]),
      heading('Breakdown'),
      { columns: report.donuts.map(donutBlock), columnGap: 20 },
      heading(attentionTitle),
      ...(attention.filter ? [{ text: `Filter: ${attention.filter}`, margin: [0, 0, 0, 4] }] : []),
      attention.rows.length === 0
        ? { text: attention.total === 0 ? 'No test cases need attention.' : 'No test case matches this filter.', color: MUTED }
        : {
            table: {
              headerRows: 1,
              widths: ['*', 'auto', 'auto', 'auto', 'auto'],
              body: [
                head(['Test Case', 'Issue', 'Status', 'Created', 'Last Updated']),
                ...attention.rows.map((r) => [
                  r.tags.length === 0 ? r.name : { stack: [r.name, { text: r.tags.join(', '), color: MUTED, fontSize: 8 }] },
                  r.issues.join(', '),
                  r.status,
                  r.created,
                  r.updated,
                ]),
              ],
            },
            layout: 'lightHorizontalLines',
          },
      heading('Rankings'),
      ...pairs(report.rankings).map((pair) => ({ columns: pair.map(rankingBlock), columnGap: 20 })),
      heading('Folder Health'),
      report.folderHealth.length === 0
        ? { text: 'No folders hold test cases yet.', color: MUTED }
        : {
            table: {
              headerRows: 1,
              widths: ['*', 'auto', 'auto', '*'],
              body: [
                head(['Folder', 'Cases', 'Issues', 'Breakdown']),
                ...report.folderHealth.map((f) => [f.path, String(f.cases), f.issues, f.breakdown]),
              ],
            },
            layout: 'lightHorizontalLines',
          },
    ],
  };
}
