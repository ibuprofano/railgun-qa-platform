/** "12 Nov" for a "YYYY-MM-DD" day, read as a calendar date (no time-zone shift). */
export function shortDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export const formatValue = (kind: 'percent' | 'count', value: number | null) =>
  value === null ? '—' : kind === 'percent' ? `${value}%` : String(value);

/** Execution status colours (PRD §6.3.6), as theme variables, so light and dark both follow. */
export const EXECUTION_STATUS_COLORS = {
  Draft: 'var(--status-draft)',
  Ready: 'var(--status-ready)',
  InProgress: 'var(--status-in-progress)',
  Paused: 'var(--status-paused)',
  Completed: 'var(--status-completed)',
  Done: 'var(--status-done)',
  Canceled: 'var(--status-canceled)',
} as const;

/** Run outcome colours (PRD §6.12.4). */
export const OUTCOME_COLORS = {
  Pass: 'var(--pass)',
  Fail: 'var(--fail)',
  NeedsReview: 'var(--review)',
  Pending: 'var(--pending)',
} as const;

/** Severity colours (PRD §6.12.4), the same variables as the bug list's dots. */
export const SEVERITY_CHART_COLORS = {
  Critical: 'var(--sev-critical)',
  High: 'var(--sev-high)',
  Medium: 'var(--sev-medium)',
  Low: 'var(--sev-low)',
} as const;

/**
 * Bug status colours. PRD §6.12.4 fixes Resolved (green) and In Progress (blue); the
 * rest are bugs-dashboard design.md decision 8's choice, kept distinguishable.
 */
export const BUG_STATUS_COLORS = {
  Open: 'var(--fail)',
  InProgress: 'var(--status-in-progress)',
  Resolved: 'var(--pass)',
  Closed: 'var(--status-completed)',
  WontFix: 'var(--status-done)',
} as const;

/** Backlog Age (PRD §6.12.4): Fresh green, Aging amber, Old red. */
export const BACKLOG_AGE_COLORS = {
  Fresh: 'var(--pass)',
  Aging: 'var(--review)',
  Old: 'var(--fail)',
} as const;

/** A tag's word-cloud colour, following the theme (ADR 0016's palette). */
export const tagChartColor = (color: string) => `var(--tag-${color})`;
