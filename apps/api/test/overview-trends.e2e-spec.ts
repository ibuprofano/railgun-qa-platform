import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import request from 'supertest';
import { createTestPrismaClient } from './helpers/prisma-test-client';
import { createWorkspaceWithProject, type WorkspaceFixture } from './helpers/cross-tenant-harness';
import { insertTestCases, setUpProjectMember } from './helpers/execution-fixtures';
import { insertTestUser } from './helpers/membership-fixtures';
import { withTenantContext } from '../src/common/tenant-context';

jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn(async (token: string) => ({ sub: token })),
  createClerkClient: jest.fn(() => ({
    users: {
      getUser: jest.fn(async (clerkUserId: string) => ({
        emailAddresses: [{ emailAddress: `${clerkUserId}@example.com` }],
        firstName: 'Test',
        lastName: 'User',
      })),
    },
  })),
}));

import { AppModule } from '../src/app.module';

type Outcome = 'Pass' | 'Fail' | 'NeedsReview';
interface TrendDay {
  date: string;
  completed: number;
  passed: number;
  reported: number;
  resolved: number;
}
interface HealthPoint {
  day: string;
  score: number | null;
  band: string | null;
  source: string;
}

const DAY_MS = 86_400_000;
/** The UTC date `n` days before today, as "YYYY-MM-DD". */
const utcDay = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);
const at = (day: string, time: string) => new Date(`${day}T${time}Z`);

describe('Overview trends (e2e, specs/project-metrics)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const api = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  interface Setup extends WorkspaceFixture {
    viewer: string;
    admin: string;
    creator: string;
  }

  async function setUp(label: string): Promise<Setup> {
    const f = await createWorkspaceWithProject(prisma, `${label}-${randomUUID().slice(0, 8)}`);
    return {
      ...f,
      viewer: await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Viewer'),
      admin: await setUpProjectMember(prisma, f.workspaceId, f.projectId, 'Admin'),
      creator: await insertTestUser(prisma, `clerk-trends-${randomUUID()}`, 'Creator'),
    };
  }

  /** One execution holding one run per [outcome, recorded at]; each run gets a fresh test case. */
  async function runs(s: Setup, rows: [Outcome, Date][]): Promise<void> {
    const testCases = await insertTestCases(prisma, s.workspaceId, s.projectId, rows.map((_, i) => `T${i}-${randomUUID().slice(0, 4)}`));
    const executionId = randomUUID();
    await withTenantContext(prisma, s.workspaceId, async (tx) => {
      await tx.$executeRaw`INSERT INTO test_execution (id, project_id, workspace_id, name, status, browser, viewport_width,
          viewport_height, locale, timezone, created_by)
        VALUES (${executionId}::uuid, ${s.projectId}::uuid, ${s.workspaceId}::uuid, 'Exec', 'Completed', 'Chromium', 1280, 720,
          'en-US', 'UTC', ${s.creator}::uuid)`;
      for (const [index, [outcome, recordedAt]] of rows.entries()) {
        await tx.$executeRaw`INSERT INTO test_run (execution_id, workspace_id, test_case_id, position, outcome, outcome_updated_at)
          VALUES (${executionId}::uuid, ${s.workspaceId}::uuid, ${testCases[index]}::uuid, ${index + 1}, ${outcome}, ${recordedAt})`;
      }
    });
  }

  async function bug(s: Setup, severity: string, createdAt: Date, resolvedAt: Date | null = null): Promise<string> {
    const id = randomUUID();
    await withTenantContext(prisma, s.workspaceId, (tx) =>
      tx.$executeRaw`INSERT INTO bug (id, project_id, workspace_id, title, severity, status, reporter_id, reporter_display_name,
          created_at, resolved_at)
        VALUES (${id}::uuid, ${s.projectId}::uuid, ${s.workspaceId}::uuid, 'Bug', ${severity},
          ${resolvedAt ? 'Resolved' : 'Open'}, ${s.creator}::uuid, 'Creator', ${createdAt}, ${resolvedAt})`,
    );
    return id;
  }

  /** Snapshots are written only by the worker role (migration 0017). */
  async function snapshot(s: Setup, day: string, score: number, band: string): Promise<void> {
    const client = new Client({ connectionString: 'postgresql://railgun_worker:worker_dev_password@localhost:5433/railgun' });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.workspace_id', $1, true)`, [s.workspaceId]);
      await client.query(
        `INSERT INTO health_snapshot (workspace_id, project_id, day, score, band, pass_rate, coverage, bug_pressure, freshness)
         VALUES ($1, $2, $3, $4, $5, 0, 0, 0, 0)`,
        [s.workspaceId, s.projectId, day, score, band],
      );
      await client.query('COMMIT');
    } finally {
      await client.end();
    }
  }

  const trends = (s: Setup, tz = 'UTC', token = s.viewer) =>
    api().get(`/projects/${s.projectId}/overview/trends?tz=${encodeURIComponent(tz)}`).set(as(token));
  const dayOf = (body: { days: TrendDay[] }, date: string) => body.days.find((d) => d.date === date)!;
  const healthOf = (body: { health: HealthPoint[] }, day: string) => body.health.find((h) => h.day === day)!;

  it('returns 90 days in each series, ending today', async () => {
    const s = await setUp('Tr-Shape');

    const response = await trends(s);

    expect(response.status).toBe(200);
    expect(response.body.days).toHaveLength(90);
    expect(response.body.health).toHaveLength(90);
    expect(response.body.days[89].date).toBe(utcDay(0));
    expect(response.body.health[89]).toMatchObject({ day: utcDay(0), source: 'live' });
    expect(response.body.days[0].date).toBe(utcDay(89));
  });

  it('counts a run near midnight on the caller’s local day', async () => {
    const s = await setUp('Tr-Zone');
    const day = utcDay(10);
    await runs(s, [['Pass', at(day, '23:30:00')]]);
    const nextDay = utcDay(9);

    const madrid = (await trends(s, 'Europe/Madrid')).body;
    const utc = (await trends(s, 'UTC')).body;

    expect(dayOf(madrid, nextDay)).toMatchObject({ completed: 1, passed: 1 });
    expect(dayOf(madrid, day).completed).toBe(0);
    expect(dayOf(utc, day).completed).toBe(1);
  });

  it('counts bugs reported and resolved on their own days, leaving trashed ones out', async () => {
    const s = await setUp('Tr-Bugs');
    await bug(s, 'High', at(utcDay(20), '12:00:00'), at(utcDay(15), '12:00:00'));
    const trashed = await bug(s, 'Low', at(utcDay(20), '13:00:00'));
    await withTenantContext(prisma, s.workspaceId, (tx) => tx.$executeRaw`UPDATE bug SET deleted_at = now() WHERE id = ${trashed}::uuid`);

    const body = (await trends(s)).body;

    expect(dayOf(body, utcDay(20))).toMatchObject({ reported: 1, resolved: 0 });
    expect(dayOf(body, utcDay(15))).toMatchObject({ reported: 0, resolved: 1 });
  });

  it('rejects an unknown time zone (400)', async () => {
    const s = await setUp('Tr-BadZone');

    expect((await trends(s, 'Mars/Olympus')).status).toBe(400);
    expect((await api().get(`/projects/${s.projectId}/overview/trends`).set(as(s.viewer))).status).toBe(400);
  });

  describe('Health Score history', () => {
    it('returns a recorded day as recorded, even after the data changed', async () => {
      const s = await setUp('Tr-Snapshot');
      await runs(s, [['Pass', at(utcDay(8), '10:00:00')]]);
      await snapshot(s, utcDay(5), 72, 'AtRisk');
      await bug(s, 'Critical', at(utcDay(3), '10:00:00'));

      expect(healthOf((await trends(s)).body, utcDay(5))).toEqual({ day: utcDay(5), score: 72, band: 'AtRisk', source: 'snapshot' });
    });

    it('recomputes a gap day with the bugs open that day', async () => {
      const s = await setUp('Tr-Gap');
      // A completed run 40 days ago, so every later day has a score; the test cases are
      // created now, so past days count none of them (coverage and freshness 0).
      await runs(s, [['Pass', at(utcDay(40), '10:00:00')]]);
      await bug(s, 'Critical', at(utcDay(30), '10:00:00'), at(utcDay(2), '10:00:00'));

      const body = (await trends(s)).body;

      // 10 days ago: no recent runs (pass 0), coverage 0, freshness 0, one open Critical (75).
      expect(healthOf(body, utcDay(10))).toEqual({ day: utcDay(10), score: 19, band: 'Critical', source: 'recomputed' });
      // 1 day ago the bug was resolved: bug pressure 100.
      expect(healthOf(body, utcDay(1))).toMatchObject({ score: 25, source: 'recomputed' });
    });

    it("ends on today's live score, the same as the Overview", async () => {
      const s = await setUp('Tr-Live');
      await runs(s, [
        ['Pass', at(utcDay(2), '10:00:00')],
        ['Fail', at(utcDay(1), '10:00:00')],
      ]);

      const live = (await api().get(`/projects/${s.projectId}/overview`).set(as(s.viewer))).body.health;
      const today = (await trends(s)).body.health[89];

      expect(today).toMatchObject({ score: live.score, band: live.band, source: 'live' });
    });

    it('has no score before the first completed run', async () => {
      const s = await setUp('Tr-First');
      await runs(s, [['Pass', at(utcDay(5), '10:00:00')]]);

      const body = (await trends(s)).body;

      expect(healthOf(body, utcDay(6)).score).toBeNull();
      expect(healthOf(body, utcDay(5)).score).toEqual(expect.any(Number));
      expect((body.health as HealthPoint[]).slice(0, 80).every((h) => h.score === null)).toBe(true);
    });
  });

  it('splits the last 30 days’ outcomes', async () => {
    const s = await setUp('Tr-Split');
    const recent = at(utcDay(3), '10:00:00');
    await runs(s, [
      ...Array.from({ length: 30 }, (): [Outcome, Date] => ['Pass', recent]),
      ...Array.from({ length: 6 }, (): [Outcome, Date] => ['Fail', recent]),
      ...Array.from({ length: 4 }, (): [Outcome, Date] => ['NeedsReview', recent]),
      ['Fail', at(utcDay(40), '10:00:00')],
    ]);

    expect((await trends(s)).body.outcomes30d).toEqual({ pass: 30, fail: 6, needsReview: 4 });
  });

  it('refuses a caller with no access (403)', async () => {
    const s = await setUp('Tr-Access');
    const other = await setUp('Tr-Access-Other');

    expect((await trends(s, 'UTC', other.viewer)).status).toBe(403);
  });
});
