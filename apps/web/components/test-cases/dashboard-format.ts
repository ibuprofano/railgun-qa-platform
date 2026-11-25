import type { IssueFlag } from '../../lib/test-cases-api';

/** Display names of the dashboard's issues, shared with the PDF (PRD §6.2.4). */
export { ISSUE_LABELS } from '@railgun-qa/reporting';

/** What each issue means, for the Needs Attention tooltip. */
export const ISSUE_DEFINITIONS: Record<IssueFlag, string> = {
  NoScript: 'the test case has no Gherkin script',
  Orphan: 'never added to any execution',
  NeverRun: 'added to an execution, but no completed run yet',
  Dormant: 'its last completed run was more than 14 days ago',
  Degrading: 'its last 5 runs passed at least 20 points less often than the 5 before them',
};

/** Degrading is red, the other issues amber (PRD §6.2.4). */
export function issueBadgeClass(issue: IssueFlag): string {
  return issue === 'Degrading' ? 'border-fail/40 bg-fail/10 text-fail' : 'border-review/40 bg-review/15 text-foreground';
}

/** A row link opens the test case in a new tab, as the Overview's lists do. */
export const testCaseHref = (id: string) => `/test-cases?testCase=${encodeURIComponent(id)}`;

export const shortDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
