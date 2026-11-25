/**
 * The Health Score and its percentages (PRD §6.1, §6.12; specs/project-metrics), pure and
 * free of any database, shared by the API's live score and history and the worker's
 * daily snapshot (ADR 0024). SQL only counts; everything derived happens here.
 */

/** Rounds half away from zero for the non-negative values used here (87.5 → 88). */
export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5 + Number.EPSILON * Math.abs(value));
}

/** A whole percentage of `part` in `whole`; 0 when there is nothing to divide by. */
export function pct(part: number, whole: number): number {
  return whole > 0 ? roundHalfUp((100 * part) / whole) : 0;
}

export interface OpenBugCounts {
  critical: number;
  high: number;
  medium: number;
}

/** 100 minus 25 per open Critical, 10 per High, 3 per Medium; Low costs nothing; never below 0. */
export function bugPressure({ critical, high, medium }: OpenBugCounts): number {
  return Math.max(0, 100 - 25 * critical - 10 * high - 3 * medium);
}

export interface HealthComponents {
  /** The 30-day pass rate, 0 when there were no runs in that window. */
  passRate: number;
  coverage: number;
  bugPressure: number;
  freshness: number;
}

export type HealthBand = 'Healthy' | 'AtRisk' | 'Critical';

export const HEALTH_WEIGHTS = { passRate: 0.4, coverage: 0.2, bugPressure: 0.25, freshness: 0.15 } as const;

/**
 * The weighted score from the already-rounded components, so the components a response
 * shows always reproduce its score (design.md decision 4).
 */
export function healthScore(components: HealthComponents): number {
  return roundHalfUp(
    HEALTH_WEIGHTS.passRate * components.passRate +
      HEALTH_WEIGHTS.coverage * components.coverage +
      HEALTH_WEIGHTS.bugPressure * components.bugPressure +
      HEALTH_WEIGHTS.freshness * components.freshness,
  );
}

/** Healthy 80–100, At Risk 60–79, Critical below 60 (PRD §6.12.3). */
export function band(score: number): HealthBand {
  if (score >= 80) return 'Healthy';
  if (score >= 60) return 'AtRisk';
  return 'Critical';
}

export interface HealthInput {
  /** Whether the project has any completed run at all; without one there is no score. */
  hasCompletedRun: boolean;
  /** The 30-day pass rate, or null with no runs in the window. */
  passRate: number | null;
  coverage: number;
  openBugs: OpenBugCounts;
  freshness: number;
}

export interface Health {
  score: number | null;
  band: HealthBand | null;
  components: HealthComponents;
}

export function health(input: HealthInput): Health {
  const components: HealthComponents = {
    passRate: input.passRate ?? 0,
    coverage: input.coverage,
    bugPressure: bugPressure(input.openBugs),
    freshness: input.freshness,
  };
  if (!input.hasCompletedRun) {
    return { score: null, band: null, components };
  }
  const score = healthScore(components);
  return { score, band: band(score), components };
}
