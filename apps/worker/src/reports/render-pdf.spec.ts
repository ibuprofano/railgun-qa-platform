import {
  bugReportData,
  DEFAULT_NEEDS_ATTENTION,
  DEFAULT_RUN_TABLE_STATE,
  executionReportData,
  testCaseReportData,
  type BugDashboardData,
  type TestCaseDashboard,
} from '@railgun-qa/reporting';
import { testCasesDashboardDocument } from './test-cases-dashboard-document';
import { executionsDashboardDocument } from './executions-dashboard-document';
import { bugsDashboardDocument } from './bugs-dashboard-document';
import { renderPdf, RenderTimeoutError } from './render-pdf';

/** A small dashboard with a Japanese title and tag (specs/bugs-dashboard-report). */
const dashboard: BugDashboardData = {
  today: '2026-11-25',
  now: '2026-11-25T12:00:00.000Z',
  bugs: [
    {
      id: 'b1',
      title: '合計金額が正しくない',
      severity: 'Critical',
      status: 'Open',
      tagIds: ['t1'],
      createdAt: '2026-11-20T10:00:00.000Z',
      updatedAt: '2026-11-20T10:00:00.000Z',
      resolvedAt: null,
      reportedOn: '2026-11-20',
      resolvedOn: null,
    },
  ],
  tags: [{ id: 't1', name: '決済', color: 'violet' }],
};

describe('renderPdf (report-pipeline design.md decision 5)', () => {
  it('renders the Bugs dashboard document as a PDF with the Japanese glyphs embedded', async () => {
    const definition = { ...bugsDashboardDocument(bugReportData(dashboard, { range: 30, projectName: 'ShopFlow' })), compress: false };
    const bytes = await renderPdf(definition);
    const text = bytes.toString('latin1');
    expect(text.startsWith('%PDF')).toBe(true);
    // The subset font's ToUnicode map covers 決 (U+6C7A) and 済 (U+6E08).
    expect(text).toMatch(/<6c7a>/i);
    expect(text).toMatch(/<6e08>/i);
  }, 30_000);

  it('renders the Executions dashboard document as a PDF', async () => {
    const report = executionReportData(
      {
        today: '2026-11-25',
        executions: [{ id: 'e1', name: 'リリース回帰', status: 'Done', environmentName: 'Staging', browser: 'Chromium', tagIds: [], completedOn: '2026-11-24' }],
        runs: [],
      },
      { tz: 'UTC', filters: {}, runTable: { ...DEFAULT_RUN_TABLE_STATE }, ranges: { executionsOverTime: 30, runsOverTime: 7 }, include: { executions: true, runs: true } },
      { projectName: 'ShopFlow', tagName: (id) => id },
    );
    const bytes = await renderPdf(executionsDashboardDocument(report));
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
  }, 30_000);

  it.each([true, false])('renders the Test Cases dashboard document as a PDF (Pass Rate Trend: %s)', async (hasCompletedRuns) => {
    const data: TestCaseDashboard = {
      tiles: { total: 2, ready: 1, covered: 1, avgConfidencePct: null },
      days: Array.from({ length: 90 }, (_, i) => ({
        date: new Date(Date.UTC(2026, 7, 28) + i * 86_400_000).toISOString().slice(0, 10),
        created: i % 2,
        added: i % 3,
        completed: hasCompletedRuns ? i % 2 : 0,
        passed: 0,
      })),
      hasCompletedRuns,
      lastOutcome: { pass: 1, fail: 0, needsReview: 0, neverRun: 1 },
      sourceType: { gherkin: 1, manual: 1 },
      needsAttention: [
        { id: 'tc1', name: '決済のシナリオ', tagIds: ['t1'], status: 'Draft', createdAt: '2026-11-20T10:00:00.000Z', updatedAt: '2026-11-21T10:00:00.000Z', issues: ['NoScript', 'Orphan'] },
      ],
      rankings: { mostRun: [{ id: 'tc2', name: 'Login', completed: 3 }], topFailing: [], topFlaky: [], topTags: [], failingBelowMinimum: 1 },
      folderHealth: [{ folderId: 'f1', path: ['決済', 'Cards'], cases: 2, withIssues: 1, issuePct: 50, breakdown: { NoScript: 1, Orphan: 1 } }],
    };
    const report = testCaseReportData(
      data,
      { tz: 'Asia/Tokyo', ranges: { overTime: 30, passRate: 7 }, needsAttention: DEFAULT_NEEDS_ATTENTION },
      { projectName: 'ShopFlow', tagName: () => '回帰' },
    );
    expect(report.charts).toHaveLength(hasCompletedRuns ? 2 : 1);
    const bytes = await renderPdf(testCasesDashboardDocument(report));
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
  }, 30_000);

  it('refuses to fetch a remote image', async () => {
    const definition = { content: [{ image: 'remote' }], images: { remote: 'https://example.com/a.png' }, defaultStyle: { font: 'NotoSansJP' } };
    await expect(renderPdf(definition)).rejects.toThrow(/resource access policy/);
  }, 30_000);

  it('stops a render that runs past the timeout', async () => {
    const definition = {
      defaultStyle: { font: 'NotoSansJP' },
      content: Array.from({ length: 20_000 }, (_, i) => `Line ${i} チェックアウトのシナリオ`),
    };
    await expect(renderPdf(definition, 50)).rejects.toBeInstanceOf(RenderTimeoutError);
  }, 30_000);
});
