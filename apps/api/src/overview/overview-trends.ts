import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AS_OF_COUNTS_SQL, type AsOfCountsRow, figuresFromCounts, type HealthBand } from '@railgun-qa/reporting';

/**
 * The Overview's trends (specs/project-metrics; overview-charts design.md decision 5): 90
 * days in one read, oldest first. Run and bug series are counted per calendar day in the
 * caller's time zone; the Health Score per UTC day from snapshots, recomputed gaps and
 * the live score (ADR 0024). The client slices each chart's own range.
 */
export const TREND_DAYS = 90;

export interface TrendDay {
  date: string;
  completed: number;
  passed: number;
  reported: number;
  resolved: number;
}

export interface HealthPoint {
  day: string;
  score: number | null;
  band: HealthBand | null;
  source: 'snapshot' | 'recomputed' | 'live';
}

export interface OverviewTrends {
  days: TrendDay[];
  health: HealthPoint[];
  outcomes30d: { pass: number; fail: number; needsReview: number };
}

/** 400 unless `tz` is a zone Postgres knows (the list `AT TIME ZONE` itself uses). */
export async function parseTimeZone(tx: Prisma.TransactionClient, tz: unknown): Promise<string> {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) {
    throw new BadRequestException('tz must be an IANA time zone, such as Europe/Madrid');
  }
  const [known] = await tx.$queryRaw<{ ok: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = ${tz}) AS ok
  `;
  if (!known.ok) {
    throw new BadRequestException(`unknown time zone: ${tz}`);
  }
  return tz;
}

const COMPLETED_RUNS = Prisma.sql`
  test_run tr JOIN test_execution te ON te.id = tr.execution_id
  WHERE te.deleted_at IS NULL AND tr.outcome IN ('Pass', 'Fail', 'NeedsReview')
`;

export async function loadTrends(tx: Prisma.TransactionClient, projectId: string, tz: string): Promise<OverviewTrends> {
  const days = await tx.$queryRaw<TrendDay[]>`
    WITH span AS (
      SELECT (now() AT TIME ZONE ${tz})::date AS today
    ),
    days AS (
      SELECT d::date AS day FROM span, generate_series(span.today - ${TREND_DAYS - 1}::int, span.today, interval '1 day') AS d
    ),
    runs AS (
      SELECT (tr.outcome_updated_at AT TIME ZONE ${tz})::date AS day,
        count(*)::int AS completed, count(*) FILTER (WHERE tr.outcome = 'Pass')::int AS passed
      FROM ${COMPLETED_RUNS} AND te.project_id = ${projectId}::uuid
        AND tr.outcome_updated_at > now() - interval '${Prisma.raw(String(TREND_DAYS + 1))} days'
      GROUP BY 1
    ),
    reported AS (
      SELECT (created_at AT TIME ZONE ${tz})::date AS day, count(*)::int AS n FROM bug
      WHERE project_id = ${projectId}::uuid AND deleted_at IS NULL
        AND created_at > now() - interval '${Prisma.raw(String(TREND_DAYS + 1))} days'
      GROUP BY 1
    ),
    resolved AS (
      SELECT (resolved_at AT TIME ZONE ${tz})::date AS day, count(*)::int AS n FROM bug
      WHERE project_id = ${projectId}::uuid AND deleted_at IS NULL
        AND resolved_at > now() - interval '${Prisma.raw(String(TREND_DAYS + 1))} days'
      GROUP BY 1
    )
    SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
      COALESCE(runs.completed, 0) AS completed, COALESCE(runs.passed, 0) AS passed,
      COALESCE(reported.n, 0) AS reported, COALESCE(resolved.n, 0) AS resolved
    FROM days
    LEFT JOIN runs ON runs.day = days.day
    LEFT JOIN reported ON reported.day = days.day
    LEFT JOIN resolved ON resolved.day = days.day
    ORDER BY days.day
  `;

  const [outcomes] = await tx.$queryRaw<{ pass: number; fail: number; needs_review: number }[]>`
    SELECT count(*) FILTER (WHERE tr.outcome = 'Pass')::int AS pass,
      count(*) FILTER (WHERE tr.outcome = 'Fail')::int AS fail,
      count(*) FILTER (WHERE tr.outcome = 'NeedsReview')::int AS needs_review
    FROM ${COMPLETED_RUNS} AND te.project_id = ${projectId}::uuid
      AND tr.outcome_updated_at > now() - interval '30 days'
  `;

  return {
    days,
    health: await loadHealthHistory(tx, projectId),
    outcomes30d: { pass: outcomes.pass, fail: outcomes.fail, needsReview: outcomes.needs_review },
  };
}

/** The UTC days ending today; past days from snapshots or recomputed, today live (ADR 0024). */
async function loadHealthHistory(tx: Prisma.TransactionClient, projectId: string): Promise<HealthPoint[]> {
  const utcDays = await tx.$queryRaw<{ day: string; score: number | null; band: HealthBand | null; recorded: boolean }[]>`
    WITH days AS (
      SELECT d::date AS day FROM generate_series(
        (now() AT TIME ZONE 'UTC')::date - ${TREND_DAYS - 1}::int, (now() AT TIME ZONE 'UTC')::date, interval '1 day') AS d
    )
    SELECT to_char(days.day, 'YYYY-MM-DD') AS day, s.score, s.band, (s.day IS NOT NULL) AS recorded
    FROM days LEFT JOIN health_snapshot s ON s.project_id = ${projectId}::uuid AND s.day = days.day
    ORDER BY days.day
  `;
  const today = utcDays[utcDays.length - 1];
  const gaps = utcDays.slice(0, -1).filter((d) => !d.recorded);

  // Each gap day is recomputed as of its end: midnight UTC of the next day.
  const endOf = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString();
  const recomputed = new Map<string, AsOfCountsRow>();
  if (gaps.length > 0) {
    const rows = await tx.$queryRawUnsafe<AsOfCountsRow[]>(AS_OF_COUNTS_SQL, projectId, gaps.map((d) => endOf(d.day)));
    rows.forEach((row, i) => recomputed.set(gaps[i].day, row));
  }
  const [live] = await tx.$queryRawUnsafe<AsOfCountsRow[]>(AS_OF_COUNTS_SQL, projectId, null);

  return utcDays.map((d): HealthPoint => {
    if (d === today) {
      const { health } = figuresFromCounts(live);
      return { day: d.day, score: health.score, band: health.band, source: 'live' };
    }
    if (d.recorded) {
      return { day: d.day, score: d.score, band: d.band, source: 'snapshot' };
    }
    const { health } = figuresFromCounts(recomputed.get(d.day)!);
    return { day: d.day, score: health.score, band: health.band, source: 'recomputed' };
  });
}
