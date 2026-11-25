/**
 * Scheduled jobs (Graphile Worker crontab syntax), all in UTC. `fill=1d` catches up one
 * missed run after downtime. Several workers never schedule the same run twice
 * (Graphile's known_crontabs lock).
 * - trash_purge: daily at 03:00 (ADR 0007)
 * - health_snapshot: daily at 00:15, recording the UTC day that just ended (ADR 0024)
 */
export const CRONTAB = ['0 3 * * * trash_purge ?fill=1d', '15 0 * * * health_snapshot ?fill=1d'].join('\n');
