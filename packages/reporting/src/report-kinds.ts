/**
 * Report kinds (executions-dashboard-report design.md decision 1): the API name, the
 * stored name, and how each is labelled, written once for the API, the worker and the web.
 * Each side keeps a `Record<ReportDbKind, …>` of its own, so a new kind can't be added
 * without its options parser and its builder.
 */
export const REPORT_KINDS = {
  'bugs-dashboard': 'bugs_dashboard',
  'executions-dashboard': 'executions_dashboard',
  'test-cases-dashboard': 'test_cases_dashboard',
} as const;

export type ReportApiKind = keyof typeof REPORT_KINDS;
export type ReportDbKind = (typeof REPORT_KINDS)[ReportApiKind];

export const REPORT_KIND_LABELS: Record<ReportDbKind, { name: string; fileBase: string; category: string }> = {
  bugs_dashboard: { name: 'Bugs dashboard report', fileBase: 'bugs-dashboard', category: 'Bugs' },
  executions_dashboard: { name: 'Executions dashboard report', fileBase: 'executions-dashboard', category: 'Executions' },
  test_cases_dashboard: { name: 'Test Cases dashboard report', fileBase: 'test-cases-dashboard', category: 'Test Cases' },
};

export function isReportApiKind(value: unknown): value is ReportApiKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(REPORT_KINDS, value);
}

export function apiKindOf(kind: ReportDbKind): ReportApiKind {
  return (Object.keys(REPORT_KINDS) as ReportApiKind[]).find((k) => REPORT_KINDS[k] === kind)!;
}
