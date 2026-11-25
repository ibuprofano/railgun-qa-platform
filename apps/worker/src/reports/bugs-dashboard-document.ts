import type { BugReportData, ReportDonut } from '@railgun-qa/reporting';

/**
 * The Bugs dashboard PDF's layout (specs/bugs-dashboard-report; report-pipeline design.md
 * decision 6), as a pdfmake document definition built from `bugReportData`. Charts are the
 * package's print SVGs, rendered in Noto Sans JP; no remote resources.
 */

const MUTED = '#64748b';
const RED = '#dc2626';
const AMBER = '#d97706';

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
  return { stack: [{ text: d.title, style: 'label', margin: [0, 0, 0, 4] }, ...body], margin: [0, 0, 0, 10] };
}

export function bugsDashboardDocument(report: BugReportData) {
  const t = report.tiles;
  const tile = (label: string, value: number, sub: string) => ({
    stack: [
      { text: label.toUpperCase(), style: 'label' },
      { text: String(value), fontSize: 20, bold: true },
      { text: sub, color: MUTED, fontSize: 8 },
    ],
  });
  const pairs = <T>(items: T[]) => Array.from({ length: Math.ceil(items.length / 2) }, (_, i) => items.slice(i * 2, i * 2 + 2));

  return {
    info: { title: `Bugs dashboard — ${report.projectName}` },
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 40],
    defaultStyle: { font: 'NotoSansJP', fontSize: 9 },
    styles: {
      title: { fontSize: 18, bold: true },
      heading: { fontSize: 12, bold: true },
      label: { fontSize: 8, bold: true, color: MUTED },
    },
    // Functions can't cross into the render thread; it adds the "n / N" footer itself.
    pageNumbers: true,
    content: [
      { text: `Bugs dashboard — ${report.projectName}`, style: 'title' },
      { text: `Generated ${report.generatedOn} · charts cover the last ${report.range} days`, color: MUTED, margin: [0, 2, 0, 8] },
      {
        columns: [
          tile('Total Bugs', t.total, `${t.inProgress} in progress`),
          tile('Open', t.open, 'needs attention'),
          tile('Resolved', t.resolved, `of ${t.total} total`),
          tile('Critical (all time)', t.critical, 'highest severity'),
        ],
        columnGap: 10,
      },
      ...report.charts.flatMap((c) => [heading(c.title), { svg: c.svg, width: c.width, font: 'NotoSansJP' }]),
      heading('Breakdown'),
      ...pairs(report.donuts).map((row) => ({ columns: row.map(donutBlock), columnGap: 20 })),
      heading('Avg Resolution Time'),
      report.resolution.length === 0
        ? { text: 'No resolved bugs yet', color: MUTED }
        : {
            table: {
              widths: ['*', 'auto', 'auto'],
              body: report.resolution.map((r) => [r.severity, { text: `${r.days}d`, bold: true }, { text: `(${r.count} ${r.count === 1 ? 'bug' : 'bugs'})`, color: MUTED }]),
            },
            layout: 'lightHorizontalLines',
          },
      heading('Bugs by Tag'),
      report.tags.length === 0
        ? { text: 'No tagged bugs yet.', color: MUTED }
        : {
            table: {
              headerRows: 1,
              widths: ['*', 'auto'],
              body: [
                [{ text: 'Tag', bold: true }, { text: 'Bugs', bold: true }],
                ...report.tags.map((tag) => [{ text: tag.name, color: tag.color }, { text: String(tag.count), alignment: 'right' }]),
              ],
            },
            layout: 'lightHorizontalLines',
          },
      heading(`Needs Attention (${report.needsAttention.length})`),
      report.needsAttention.length === 0
        ? { text: 'No bugs need attention.', color: MUTED }
        : {
            table: {
              headerRows: 1,
              widths: ['*', 'auto', 'auto', 'auto'],
              body: [
                ['Bug', 'Issue', 'Severity', 'Status'].map((h) => ({ text: h, bold: true })),
                ...report.needsAttention.map((r) => [
                  r.title,
                  {
                    text: [
                      ...(r.unattended ? [{ text: 'Unattended', color: RED, bold: true }] : []),
                      ...(r.unattended && r.idle ? [' '] : []),
                      ...(r.idle ? [{ text: 'Idle', color: AMBER, bold: true }] : []),
                    ],
                  },
                  r.severity,
                  r.status,
                ]),
              ],
            },
            layout: 'lightHorizontalLines',
          },
      {
        text: 'Idle: an open bug with no update for 30 days or more. Unattended: a Critical or High bug still in Open status.',
        color: MUTED,
        fontSize: 7,
        margin: [0, 6, 0, 0],
      },
    ],
  };
}
