import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import { AS_OF_COUNTS_SQL, type AsOfCountsRow, figuresFromCounts } from '@railgun-qa/reporting';
import { createWorkerPool } from '../db';
import { healthSnapshotTask, recordHealthSnapshots, snapshotDay } from './health-snapshot';
import { addUser, builder, createAppPool, createWorkspace, inWorkspace } from '../../test/fixtures';

/**
 * Fixtures are written as railgun_app; the snapshot runs as railgun_worker (specs/health-snapshots).
 * Each test narrows the run to its own workspace.
 */
describe('health snapshot', () => {
  let app: Pool;
  let worker: Pool;

  beforeAll(() => {
    app = createAppPool();
    worker = createWorkerPool();
  });

  afterAll(async () => {
    await app.end();
    await worker.end();
  });

  async function setUp(label: string) {
    const ws = await createWorkspace(app, `${label}-${randomUUID().slice(0, 8)}`);
    const user = await addUser(app);
    return { ws, user, b: builder(app, ws) };
  }

  /** A test case with one run whose outcome was recorded `daysAgo` days ago. */
  async function ranCase(s: Awaited<ReturnType<typeof setUp>>, outcome: 'Pass' | 'Fail', daysAgo = 1, projectId?: string) {
    const testCaseId = await s.b.testCase(`Case ${randomUUID().slice(0, 4)}`, { projectId });
    const { runId } = await s.b.execution('Run', s.user, { testCaseId, projectId });
    await inWorkspace(app, s.ws.workspaceId, (c) =>
      c.query(`UPDATE test_run SET outcome = $2, outcome_updated_at = now() - make_interval(days => $3) WHERE id = $1`, [
        runId,
        outcome,
        daysAgo,
      ]),
    );
    return testCaseId;
  }

  const snapshots = (s: Awaited<ReturnType<typeof setUp>>) =>
    inWorkspace(app, s.ws.workspaceId, async (c) =>
      (await c.query<{ project_id: string; day: string; score: number | null; band: string | null; pass_rate: number }>(
        `SELECT project_id, to_char(day, 'YYYY-MM-DD') AS day, score, band, pass_rate FROM health_snapshot ORDER BY project_id, day`,
      )).rows,
    );

  it('labels the run with the UTC day that just ended', () => {
    expect(snapshotDay(new Date('2026-11-25T00:15:00Z'))).toBe('2026-11-24');
    expect(snapshotDay(new Date('2026-03-01T23:59:00Z'))).toBe('2026-02-28');
  });

  it('records a live project with the same figures the API computes, and skips a trashed one', async () => {
    const s = await setUp('Snap-Live');
    await ranCase(s, 'Pass');
    await ranCase(s, 'Fail');
    const trashed = await s.b.project('Old App', 2);
    await ranCase(s, 'Pass', 1, trashed);

    const summary = await recordHealthSnapshots(worker, { day: '2026-11-24', workspaceIds: [s.ws.workspaceId] });

    const rows = await snapshots(s);
    expect(summary).toMatchObject({ recorded: 1, failedProjects: [] });
    expect(rows.map((r) => [r.project_id, r.day])).toEqual([[s.ws.projectId, '2026-11-24']]);
    const live = await inWorkspace(app, s.ws.workspaceId, (c) => c.query<AsOfCountsRow>(AS_OF_COUNTS_SQL, [s.ws.projectId, null]));
    const expected = figuresFromCounts(live.rows[0]).health;
    expect(rows[0]).toMatchObject({ score: expected.score, band: expected.band, pass_rate: 50 });
  });

  it('records a project with no completed run with no score and no band', async () => {
    const s = await setUp('Snap-NoRuns');
    await s.b.testCase('Never run');

    await recordHealthSnapshots(worker, { day: '2026-11-24', workspaceIds: [s.ws.workspaceId] });

    expect(await snapshots(s)).toEqual([expect.objectContaining({ score: null, band: null })]);
  });

  it('never overwrites a recorded day', async () => {
    const s = await setUp('Snap-Twice');
    await ranCase(s, 'Pass');
    await recordHealthSnapshots(worker, { day: '2026-11-24', workspaceIds: [s.ws.workspaceId] });
    const [first] = await snapshots(s);
    await ranCase(s, 'Fail'); // the score would change now

    const second = await recordHealthSnapshots(worker, { day: '2026-11-24', workspaceIds: [s.ws.workspaceId] });

    expect(second.recorded).toBe(0);
    expect(await snapshots(s)).toEqual([first]);
  });

  it('keeps recording the other projects when one fails', async () => {
    const s = await setUp('Snap-Fail');
    const other = await s.b.project('Second');
    await ranCase(s, 'Pass');
    await ranCase(s, 'Pass', 1, other);

    const summary = await recordHealthSnapshots(worker, {
      day: '2026-11-24',
      workspaceIds: [s.ws.workspaceId],
      beforeProject: (projectId) => {
        if (projectId === s.ws.projectId) throw new Error('boom');
      },
    });

    expect(summary.failedProjects).toEqual([s.ws.projectId]);
    expect((await snapshots(s)).map((r) => r.project_id)).toEqual([other]);
  });

  it('the task labels a backfilled run by its scheduled time, and fails when a project fails', async () => {
    const s = await setUp('Snap-Task');
    await ranCase(s, 'Pass');
    const task = healthSnapshotTask(worker, { workspaceIds: [s.ws.workspaceId] });

    // A late run of the 2026-11-20 00:15 schedule still records 2026-11-19.
    await task({ _cron: { ts: '2026-11-20T00:15:00.000Z', backfilled: true } }, {} as never);
    expect((await snapshots(s)).map((r) => r.day)).toEqual(['2026-11-19']);

    const failing = healthSnapshotTask(worker, {
      workspaceIds: [s.ws.workspaceId],
      beforeProject: () => {
        throw new Error('boom');
      },
    });
    await expect(failing({ _cron: { ts: '2026-11-21T00:15:00.000Z' } }, {} as never)).rejects.toThrow(/1 project/);
  });
});
