import { dayRange, DASHBOARD_DAYS } from './execution-dashboard';
import { roundHalfUp } from './health';

/**
 * The Bugs dashboard (PRD §6.4.4, §6.12; specs/bug-metrics), written once for the screen
 * and for Phase 10's PDF: the queries that read its rows, and the pure figures built on
 * them. Every figure covers the project's live bugs; the list's filters never apply.
 */

export type BugStatus = 'Open' | 'InProgress' | 'Resolved' | 'Closed' | 'WontFix';
export type BugSeverity = 'Critical' | 'High' | 'Medium' | 'Low';
export type BacklogAge = 'Fresh' | 'Aging' | 'Old';
/** ADR 0016's palette (mirrors apps/api/src/tags/tag-rules.ts). */
export type BugTagColor = 'gray' | 'red' | 'orange' | 'amber' | 'green' | 'teal' | 'blue' | 'violet';

export const BUG_STATUSES: readonly BugStatus[] = ['Open', 'InProgress', 'Resolved', 'Closed', 'WontFix'];
/** Critical first, the order every severity list uses. */
export const BUG_SEVERITIES: readonly BugSeverity[] = ['Critical', 'High', 'Medium', 'Low'];
export const BACKLOG_AGES: readonly BacklogAge[] = ['Fresh', 'Aging', 'Old'];

export const BUG_STATUS_LABELS: Record<BugStatus, string> = {
  Open: 'Open',
  InProgress: 'In Progress',
  Resolved: 'Resolved',
  Closed: 'Closed',
  WontFix: "Won't Fix",
};

/** PRD §6.12.3: an idle bug has had no update for this many days or more. */
export const IDLE_DAYS = 30;
/** PRD §6.12.3 backlog buckets: Fresh under 7 days, Aging 7–30, Old over 30. */
export const FRESH_DAYS = 7;
export const OLD_AFTER_DAYS = 30;

const DAY_MS = 86_400_000;

export const isOpenBug = (status: BugStatus) => status === 'Open' || status === 'InProgress';
export const isResolvedBug = (status: BugStatus) => !isOpenBug(status);

// ---------------------------------------------------------------------------------------
// Rows: the queries and the response shape
// ---------------------------------------------------------------------------------------

/** Today in the caller's zone, and the database clock; $1 is the time zone. */
export const BUG_DASHBOARD_CLOCK_SQL = `
  SELECT to_char((now() AT TIME ZONE $1::text)::date, 'YYYY-MM-DD') AS today, now() AS now
`;

/**
 * Bugs not in the Trash ($1 project id, $2 time zone, already checked against
 * pg_timezone_names), with their tag ids and the tz days they were reported and resolved.
 */
export const BUG_DASHBOARD_BUGS_SQL = `
  SELECT b.id, b.title, b.severity, b.status,
         COALESCE((SELECT array_agg(bt.tag_id ORDER BY bt.tag_id) FROM bug_tag bt WHERE bt.bug_id = b.id), '{}') AS tag_ids,
         b.created_at, b.updated_at, b.resolved_at,
         to_char((b.created_at AT TIME ZONE $2::text)::date, 'YYYY-MM-DD') AS reported_on,
         to_char((b.resolved_at AT TIME ZONE $2::text)::date, 'YYYY-MM-DD') AS resolved_on
  FROM bug b
  WHERE b.project_id = $1::uuid AND b.deleted_at IS NULL
  ORDER BY b.created_at, b.id
`;

/** Tags carried by at least one live bug of the project ($1 project id). */
export const BUG_DASHBOARD_TAGS_SQL = `
  SELECT t.id, t.name, t.color
  FROM tag t
  WHERE t.project_id = $1::uuid
    AND EXISTS (SELECT 1 FROM bug_tag bt JOIN bug b ON b.id = bt.bug_id
                WHERE bt.tag_id = t.id AND b.deleted_at IS NULL)
  ORDER BY lower(t.name), t.id
`;

export interface BugDashboardClockRow {
  today: string;
  now: Date;
}

export interface BugDashboardBugRow {
  id: string;
  title: string;
  severity: BugSeverity;
  status: BugStatus;
  tag_ids: string[];
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
  reported_on: string;
  resolved_on: string | null;
}

export interface BugDashboardTagRow {
  id: string;
  name: string;
  color: BugTagColor;
}

export interface DashboardBug {
  id: string;
  title: string;
  severity: BugSeverity;
  status: BugStatus;
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  /** YYYY-MM-DD in the caller's zone. */
  reportedOn: string;
  resolvedOn: string | null;
}

export interface DashboardTag {
  id: string;
  name: string;
  color: BugTagColor;
}

export interface BugDashboardData {
  /** YYYY-MM-DD in the caller's zone. */
  today: string;
  /** The database clock, for rolling ages (Idle, Backlog Age). */
  now: string;
  bugs: DashboardBug[];
  tags: DashboardTag[];
}

/** What Phase 10's PDF job will receive: the zone and the range selected on screen. */
export interface BugReportOptions {
  tz: string;
  range: 7 | 15 | 30 | 90;
}

const iso = (value: Date | string) => new Date(value).toISOString();

export function bugDashboardFromRows(
  clock: BugDashboardClockRow,
  bugs: readonly BugDashboardBugRow[],
  tags: readonly BugDashboardTagRow[],
): BugDashboardData {
  return {
    today: clock.today,
    now: iso(clock.now),
    bugs: bugs.map((b) => ({
      id: b.id,
      title: b.title,
      severity: b.severity,
      status: b.status,
      tagIds: b.tag_ids ?? [],
      createdAt: iso(b.created_at),
      updatedAt: iso(b.updated_at),
      resolvedAt: b.resolved_at ? iso(b.resolved_at) : null,
      reportedOn: b.reported_on,
      resolvedOn: b.resolved_on,
    })),
    tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
  };
}

// ---------------------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------------------

/** Whole days elapsed from `from` to `now`. */
export function ageDays(from: string, now: string): number {
  return Math.floor((Date.parse(now) - Date.parse(from)) / DAY_MS);
}

export interface BugTiles {
  total: number;
  inProgress: number;
  open: number;
  /** Status Resolved only, not Closed or Won't Fix. */
  resolved: number;
  /** Critical in any status. */
  critical: number;
}

export function bugTiles(data: Pick<BugDashboardData, 'bugs'>): BugTiles {
  const count = (test: (b: DashboardBug) => boolean) => data.bugs.filter(test).length;
  return {
    total: data.bugs.length,
    inProgress: count((b) => b.status === 'InProgress'),
    open: count((b) => b.status === 'Open'),
    resolved: count((b) => b.status === 'Resolved'),
    critical: count((b) => b.severity === 'Critical'),
  };
}

export interface BugDailySeries {
  dates: string[];
  reported: number[];
  resolved: number[];
  criticalReported: number[];
  criticalResolved: number[];
}

/** Bugs reported and resolved per tz day, for the `days` ending at `today`; Critical by current severity. */
export function bugDailySeries(data: Pick<BugDashboardData, 'bugs' | 'today'>, days = DASHBOARD_DAYS): BugDailySeries {
  const dates = dayRange(data.today, days);
  const index = new Map(dates.map((d, i) => [d, i]));
  const zeros = () => dates.map(() => 0);
  const series: BugDailySeries = { dates, reported: zeros(), resolved: zeros(), criticalReported: zeros(), criticalResolved: zeros() };
  for (const b of data.bugs) {
    const critical = b.severity === 'Critical';
    const reported = index.get(b.reportedOn);
    if (reported !== undefined) {
      series.reported[reported] += 1;
      if (critical) series.criticalReported[reported] += 1;
    }
    const resolved = b.resolvedOn === null ? undefined : index.get(b.resolvedOn);
    if (resolved !== undefined) {
      series.resolved[resolved] += 1;
      if (critical) series.criticalResolved[resolved] += 1;
    }
  }
  return series;
}

const zeroed = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

export function bugSeveritySplit(data: Pick<BugDashboardData, 'bugs'>): Record<BugSeverity, number> {
  const split = zeroed(BUG_SEVERITIES);
  for (const b of data.bugs) split[b.severity] += 1;
  return split;
}

export function bugStatusSplit(data: Pick<BugDashboardData, 'bugs'>): Record<BugStatus, number> {
  const split = zeroed(BUG_STATUSES);
  for (const b of data.bugs) split[b.status] += 1;
  return split;
}

/** Open bugs (Open or In Progress) per severity. */
export function openSeveritySplit(data: Pick<BugDashboardData, 'bugs'>): Record<BugSeverity, number> {
  const split = zeroed(BUG_SEVERITIES);
  for (const b of data.bugs) if (isOpenBug(b.status)) split[b.severity] += 1;
  return split;
}

export function backlogAge(createdAt: string, now: string): BacklogAge {
  const days = ageDays(createdAt, now);
  return days < FRESH_DAYS ? 'Fresh' : days <= OLD_AFTER_DAYS ? 'Aging' : 'Old';
}

/** Open bugs by whole days since they were reported, from the database clock. */
export function backlogAgeSplit(data: Pick<BugDashboardData, 'bugs' | 'now'>): Record<BacklogAge, number> {
  const split = zeroed(BACKLOG_AGES);
  for (const b of data.bugs) if (isOpenBug(b.status)) split[backlogAge(b.createdAt, data.now)] += 1;
  return split;
}

export interface ResolutionTime {
  severity: BugSeverity;
  /** Mean time from report to resolution date, rounded once to whole days. */
  days: number;
  count: number;
}

/** Per severity with resolved bugs (Resolved, Closed or Won't Fix), Critical first. */
export function avgResolutionTime(data: Pick<BugDashboardData, 'bugs'>): ResolutionTime[] {
  return BUG_SEVERITIES.flatMap((severity) => {
    const spans = data.bugs
      .filter((b) => b.severity === severity && isResolvedBug(b.status) && b.resolvedAt !== null)
      .map((b) => Date.parse(b.resolvedAt!) - Date.parse(b.createdAt));
    if (spans.length === 0) return [];
    const mean = spans.reduce((sum, span) => sum + span, 0) / spans.length;
    return [{ severity, days: roundHalfUp(Math.max(0, mean) / DAY_MS), count: spans.length }];
  });
}

export interface TagCount {
  tagId: string;
  name: string;
  color: BugTagColor;
  count: number;
}

/** Each tag by the live bugs carrying it, in any status; tags carried by none are left out. */
export function bugTagCounts(data: Pick<BugDashboardData, 'bugs' | 'tags'>): TagCount[] {
  const counts = new Map<string, number>();
  for (const b of data.bugs) for (const id of b.tagIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return data.tags
    .filter((t) => (counts.get(t.id) ?? 0) > 0)
    .map((t) => ({ tagId: t.id, name: t.name, color: t.color, count: counts.get(t.id)! }));
}

export interface NeedsAttentionRow {
  bug: DashboardBug;
  /** No update for IDLE_DAYS or more. */
  idle: boolean;
  /** Critical or High, and still Open. */
  unattended: boolean;
}

/** Open bugs that are Idle or Unattended: Unattended first, then severity, then the longest idle. */
export function needsAttention(data: Pick<BugDashboardData, 'bugs' | 'now'>): NeedsAttentionRow[] {
  return data.bugs
    .filter((b) => isOpenBug(b.status))
    .map((bug) => ({
      bug,
      idle: ageDays(bug.updatedAt, data.now) >= IDLE_DAYS,
      unattended: bug.status === 'Open' && (bug.severity === 'Critical' || bug.severity === 'High'),
    }))
    .filter((row) => row.idle || row.unattended)
    .sort(
      (a, b) =>
        Number(b.unattended) - Number(a.unattended) ||
        BUG_SEVERITIES.indexOf(a.bug.severity) - BUG_SEVERITIES.indexOf(b.bug.severity) ||
        Date.parse(a.bug.updatedAt) - Date.parse(b.bug.updatedAt) ||
        (a.bug.id < b.bug.id ? -1 : a.bug.id > b.bug.id ? 1 : 0),
    );
}
