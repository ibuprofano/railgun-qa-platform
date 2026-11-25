import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestPrismaClient } from './helpers/prisma-test-client';
import {
  type DashboardSetup,
  insertExecution,
  insertRunHistory,
  insertRuns,
  insertTestCase,
  setUpDashboardProject,
  trash,
} from './helpers/dashboard-fixtures';

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

describe('test case health on the detail (e2e, specs/test-case-health)', () => {
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

  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const detail = async (s: DashboardSetup, id: string) =>
    (await request(app.getHttpServer()).get(`/projects/${s.projectId}/test-cases/${id}`).set(as(s.viewer))).body;

  it("counts a trashed execution's run as never added (Orphan)", async () => {
    const s = await setUpDashboardProject(prisma, 'Health-TrashedExec');
    const tc = await insertTestCase(prisma, s, { name: 'Lonely' });
    const execution = await insertExecution(prisma, s);
    await insertRuns(prisma, s, execution, [{ testCaseId: tc, outcome: 'Pass', daysAgo: 1 }]);
    await trash(prisma, s, 'test_execution', execution);

    expect((await detail(s, tc)).health.flags).toEqual(['Orphan']);
  });

  it('counts a run Pending after a Restart as added but not completed (Never Run)', async () => {
    const s = await setUpDashboardProject(prisma, 'Health-Restart');
    const tc = await insertTestCase(prisma, s, { name: 'Retried' });
    const execution = await insertExecution(prisma, s, 'Ready');
    await insertRuns(prisma, s, execution, [{ testCaseId: tc, outcome: 'Pending', earlierAttempts: ['Fail'] }]);

    expect((await detail(s, tc)).health.flags).toEqual(['NeverRun']);
  });

  it('reports Dormant with its last completed run 20 days ago', async () => {
    const s = await setUpDashboardProject(prisma, 'Health-Dormant');
    const tc = await insertTestCase(prisma, s, { name: 'Sleepy' });
    await insertRunHistory(prisma, s, tc, [{ outcome: 'Pass', daysAgo: 20 }]);

    const health = (await detail(s, tc)).health;

    expect(health.flags).toEqual(['Dormant']);
    expect(Math.round((Date.parse(health.asOf) - Date.parse(health.lastCompletedAt)) / 86_400_000)).toBe(20);
  });

  it('reports Degrading with both rates for 2 of 5 against 4 of 5', async () => {
    const s = await setUpDashboardProject(prisma, 'Health-Degrading');
    const tc = await insertTestCase(prisma, s, { name: 'Slipping' });
    // Oldest first: the earlier 5 pass 4, the latest 5 pass 2.
    const older = ['Pass', 'Pass', 'Pass', 'Pass', 'Fail'] as const;
    const newer = ['Pass', 'Fail', 'Pass', 'Fail', 'Fail'] as const;
    await insertRunHistory(prisma, s, tc, [...older, ...newer].map((outcome, i) => ({ outcome, daysAgo: 10 - i })));

    expect((await detail(s, tc)).health).toMatchObject({
      flags: ['Degrading'],
      trend: { recentPassPct: 40, previousPassPct: 80 },
    });
  });

  it("returns No Script in the update's response after clearing the script", async () => {
    const s = await setUpDashboardProject(prisma, 'Health-NoScript');
    const tc = await insertTestCase(prisma, s, { name: 'Clearing' });
    await insertRunHistory(prisma, s, tc, [{ outcome: 'Pass', daysAgo: 1 }]);

    const response = await request(app.getHttpServer())
      .patch(`/projects/${s.projectId}/test-cases/${tc}`)
      .set(as(s.contributor))
      .send({ gherkinScript: null });

    expect(response.status).toBe(200);
    // Clearing the script is a script edit after a completed run, so Trend Reset starts too.
    expect(response.body.health.flags).toEqual(['NoScript', 'TrendReset']);
  });

  it('leaves health off the list', async () => {
    const s = await setUpDashboardProject(prisma, 'Health-List');
    await insertTestCase(prisma, s, { name: 'Listed' });

    const list = await request(app.getHttpServer()).get(`/projects/${s.projectId}/test-cases`).set(as(s.viewer));

    expect(list.body).toHaveLength(1);
    expect(list.body[0]).not.toHaveProperty('health');
  });
});
