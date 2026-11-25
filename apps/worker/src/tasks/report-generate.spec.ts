import { randomUUID } from 'crypto';
import { Client, type Pool } from 'pg';
import { bugTiles, BUG_DASHBOARD_BUGS_SQL, BUG_DASHBOARD_CLOCK_SQL, BUG_DASHBOARD_TAGS_SQL, bugDashboardFromRows } from '@railgun-qa/reporting';
import { createWorkerPool } from '../db';
import { withTenantContext } from '../tenant-context';
import { LIVE_CHANNEL } from '../live-event';
import { renderPdf } from '../reports/render-pdf';
import { postgresReportStore } from '../reports/report-store';
import { FONTS_MISSING_MESSAGE } from '../reports/fonts';
import { generateReport, type GenerateDeps } from './report-generate';
import { loadTestCaseDashboardRows } from '../reports/kinds';
import { addUser, builder, createAppPool, createWorkspace } from '../../test/fixtures';

/** report_generate (specs/report-generation): fixtures as railgun_app, the job as railgun_worker. */
describe('report_generate', () => {
  let app: Pool;
  let worker: Pool;
  let listener: Client;
  const notified: { reportId: string }[] = [];

  beforeAll(async () => {
    app = createAppPool();
    worker = createWorkerPool();
    listener = new Client({ connectionString: process.env.WORKER_DATABASE_URL ?? 'postgresql://railgun_worker:worker_dev_password@localhost:5433/railgun' });
    await listener.connect();
    listener.on('notification', (n) => {
      const event = JSON.parse(n.payload ?? '{}');
      if (event.type === 'report.changed') notified.push(event);
    });
    await listener.query(`LISTEN ${LIVE_CHANNEL}`);
  });

  afterAll(async () => {
    await listener.end();
    await app.end();
    await worker.end();
  });

  async function setUp(label: string) {
    const ws = await createWorkspace(app, `${label}-${randomUUID().slice(0, 8)}`);
    const user = await addUser(app);
    return { ws, user, b: builder(app, ws) };
  }

  const reportRow = (workspaceId: string, id: string) =>
    withTenantContext(app, workspaceId, async (c) => (await c.query('SELECT * FROM report WHERE id = $1', [id])).rows[0]);
  const fileOf = (workspaceId: string, id: string) =>
    withTenantContext(app, workspaceId, async (c) => (await c.query<{ content: Buffer }>('SELECT content FROM report_file WHERE report_id = $1', [id])).rows[0]?.content ?? null);
  const eventsFor = async (id: string) => {
    await new Promise((r) => setTimeout(r, 100));
    return notified.filter((e) => e.reportId === id).length;
  };
  const LAST = { number: 3, max: 3 };
  const FIRST = { number: 1, max: 3 };

  it('makes a Queued report Ready, with a PDF built from the dashboard figures, leaving trashed bugs out', async () => {
    const { ws, user, b } = await setUp('Rep-Ready');
    await b.bug('Live bug', user);
    await b.bug('Trashed bug', user, { deleted: 1 });
    const id = await b.report(user, { range: 7 });
    let definition: unknown;
    const deps: GenerateDeps = { store: postgresReportStore, render: (d) => ((definition = d), renderPdf(d)) };

    expect(await generateReport(worker, { reportId: id, workspaceId: ws.workspaceId }, FIRST, deps)).toBe('ready');

    const row = await reportRow(ws.workspaceId, id);
    expect(row).toMatchObject({ status: 'Ready', error: null });
    expect(row.file_name).toMatch(/^bugs-dashboard-\d{4}-\d{2}-\d{2}\.pdf$/);
    const file = (await fileOf(ws.workspaceId, id))!;
    expect(file.subarray(0, 4).toString()).toBe('%PDF');
    expect(row.byte_size).toBe(file.length);

    const expected = await withTenantContext(app, ws.workspaceId, async (c) =>
      bugTiles(
        bugDashboardFromRows(
          (await c.query(BUG_DASHBOARD_CLOCK_SQL, ['UTC'])).rows[0],
          (await c.query(BUG_DASHBOARD_BUGS_SQL, [ws.projectId, 'UTC'])).rows,
          (await c.query(BUG_DASHBOARD_TAGS_SQL, [ws.projectId])).rows,
        ),
      ),
    );
    const json = JSON.stringify(definition);
    expect(expected.total).toBe(1);
    expect(json).toContain(`"text":"${expected.total}"`);
    expect(json).toContain('Live bug');
    expect(json).not.toContain('Trashed bug');
    expect(json).toContain('the last 7 days');
    expect(await eventsFor(id)).toBe(2);
  }, 60_000);

  it('rethrows before the last attempt and leaves the report Generating', async () => {
    const { ws, user, b } = await setUp('Rep-Retry');
    const id = await b.report(user);
    const deps: GenerateDeps = { store: postgresReportStore, render: async () => Promise.reject(new Error('boom')) };
    await expect(generateReport(worker, { reportId: id, workspaceId: ws.workspaceId }, FIRST, deps)).rejects.toThrow('boom');
    expect((await reportRow(ws.workspaceId, id)).status).toBe('Generating');
    expect(await fileOf(ws.workspaceId, id)).toBeNull();
  }, 30_000);

  it('marks the report Failed with a reason on the last attempt, without throwing', async () => {
    const { ws, user, b } = await setUp('Rep-Failed');
    const id = await b.report(user);
    const deps: GenerateDeps = { store: postgresReportStore, render: async () => Promise.reject(new Error('render blew up\nstack…')) };
    expect(await generateReport(worker, { reportId: id, workspaceId: ws.workspaceId }, LAST, deps)).toBe('failed');
    expect(await reportRow(ws.workspaceId, id)).toMatchObject({ status: 'Failed', error: 'render blew up', file_name: null });
    expect(await eventsFor(id)).toBe(2);
  }, 30_000);

  it('fails with "Report fonts are not installed" when the fonts are missing', async () => {
    const { ws, user, b } = await setUp('Rep-Fonts');
    const id = await b.report(user);
    const saved = process.env.REPORT_FONTS_DIR;
    process.env.REPORT_FONTS_DIR = `/nonexistent-${randomUUID()}`;
    try {
      expect(await generateReport(worker, { reportId: id, workspaceId: ws.workspaceId }, LAST)).toBe('failed');
    } finally {
      if (saved === undefined) delete process.env.REPORT_FONTS_DIR;
      else process.env.REPORT_FONTS_DIR = saved;
    }
    expect((await reportRow(ws.workspaceId, id)).error).toBe(FONTS_MISSING_MESSAGE);
  }, 30_000);

  it('skips an expired report', async () => {
    const { ws, user, b } = await setUp('Rep-Expired');
    const id = await b.report(user, { expiresInDays: -1 });
    expect(await generateReport(worker, { reportId: id, workspaceId: ws.workspaceId }, FIRST)).toBe('skipped');
    expect((await reportRow(ws.workspaceId, id)).status).toBe('Queued');
    expect(await eventsFor(id)).toBe(0);
  }, 30_000);

  describe('the Executions dashboard report (executions-dashboard-report)', () => {
    const execOptions = (include: { executions: boolean; runs: boolean }) => ({
      tz: 'UTC',
      filters: { environmentName: 'Staging' },
      runTable: { tab: 'all', outcome: null, day: null, name: '', sort: { key: 'updatedAt', direction: 'desc' } },
      ranges: { executionsOverTime: 30, runsOverTime: 7 },
      include,
    });

    async function setUpExecutions(label: string) {
      const setup = await setUp(label);
      const staging = await setup.b.execution('Staging smoke', setup.user);
      const prod = await setup.b.execution('Prod regression', setup.user);
      const trashed = await setup.b.execution('Trashed staging run', setup.user, { deleted: 1 });
      await withTenantContext(app, setup.ws.workspaceId, async (c) => {
        await c.query(`UPDATE test_execution SET environment_name = 'Staging' WHERE id = ANY($1::uuid[])`, [[staging.executionId, trashed.executionId]]);
        await c.query(`UPDATE test_execution SET environment_name = 'Prod' WHERE id = $1`, [prod.executionId]);
      });
      return setup;
    }

    it('generates a Ready report scoped to the filtered environment, leaving trashed executions out', async () => {
      const { ws, user, b } = await setUpExecutions('Rep-Exec');
      const id = await b.report(user, { kind: 'executions_dashboard', options: execOptions({ executions: true, runs: true }) });
      let definition: unknown;
      const deps: GenerateDeps = { store: postgresReportStore, render: (d) => ((definition = d), renderPdf(d)) };

      expect(await generateReport(worker, { reportId: id, workspaceId: ws.workspaceId }, FIRST, deps)).toBe('ready');

      const row = await reportRow(ws.workspaceId, id);
      expect(row.file_name).toMatch(/^executions-dashboard-\d{4}-\d{2}-\d{2}\.pdf$/);
      expect((await fileOf(ws.workspaceId, id))!.subarray(0, 4).toString()).toBe('%PDF');
      const json = JSON.stringify(definition);
      expect(json).toContain('Filters: Environment: Staging');
      expect(json).toContain('Staging smoke');
      expect(json).not.toContain('Prod regression');
      expect(json).not.toContain('Trashed staging run');
      expect(json).toContain('Executions (1)');
      expect(json).toContain('Runs (1) — All Runs');
    }, 60_000);

    it('leaves the executions table out when only Runs is on', async () => {
      const { ws, user, b } = await setUpExecutions('Rep-Exec-Runs');
      const id = await b.report(user, { kind: 'executions_dashboard', options: execOptions({ executions: false, runs: true }) });
      let definition: unknown;
      const deps: GenerateDeps = { store: postgresReportStore, render: async (d) => ((definition = d), Buffer.from('%PDF')) };
      expect(await generateReport(worker, { reportId: id, workspaceId: ws.workspaceId }, FIRST, deps)).toBe('ready');
      const json = JSON.stringify(definition);
      expect(json).not.toContain('Executions (');
      expect(json).toContain('Runs (1)');
    }, 30_000);
  });

  describe('the Test Cases dashboard report (test-cases-dashboard-report)', () => {
    const tcOptions = (name = '') => ({
      tz: 'UTC',
      ranges: { overTime: 30, passRate: 7 },
      needsAttention: { name, sort: { key: 'name', direction: 'asc' } },
    });

    /** Fixture test cases have no script and no runs, so each is flagged No Script and Orphan. */
    async function setUpTestCases(label: string) {
      const setup = await setUp(label);
      const folder = await setup.b.folder('Payments');
      const pay = await setup.b.testCase('Pay by card', { folderId: folder });
      await setup.b.testCase('Refund payment', { folderId: folder });
      await setup.b.testCase('Login');
      await setup.b.testCase('Trashed pay case', { deleted: 1 });
      const tag = await setup.b.tag('checkout');
      await withTenantContext(app, setup.ws.workspaceId, (c) =>
        c.query('INSERT INTO test_case_tag (test_case_id, tag_id, workspace_id) VALUES ($1, $2, $3)', [pay, tag, setup.ws.workspaceId]),
      );
      return setup;
    }

    it('generates a Ready report with the dashboard figures, leaving trashed test cases out', async () => {
      const { ws, user, b } = await setUpTestCases('Rep-TC');
      const id = await b.report(user, { kind: 'test_cases_dashboard', options: tcOptions() });
      let definition: unknown;
      const deps: GenerateDeps = { store: postgresReportStore, render: (d) => ((definition = d), renderPdf(d)) };

      expect(await generateReport(worker, { reportId: id, workspaceId: ws.workspaceId }, FIRST, deps)).toBe('ready');

      const row = await reportRow(ws.workspaceId, id);
      expect(row.file_name).toMatch(/^test-cases-dashboard-\d{4}-\d{2}-\d{2}\.pdf$/);
      expect((await fileOf(ws.workspaceId, id))!.subarray(0, 4).toString()).toBe('%PDF');

      // The same queries and figures the API's dashboard runs, read as railgun_app.
      const screen = await withTenantContext(app, ws.workspaceId, (c) => loadTestCaseDashboardRows(c, ws.projectId, 'UTC'));
      expect(screen.tiles.total).toBe(3);
      const json = JSON.stringify(definition);
      expect(json).toContain(`"text":"${screen.tiles.total}"`);
      expect(json).toContain(`${screen.tiles.ready} ready`);
      expect(json).toContain(`${screen.tiles.total - screen.tiles.covered} never run`);
      expect(json).toContain('Needs Attention (3)');
      expect(json).toContain('Pay by card');
      expect(json).toContain('checkout');
      expect(json).toContain('Payments');
      expect(json).not.toContain('Trashed pay case');
    }, 60_000);

    it('lists only the Needs Attention rows matching the name filter', async () => {
      const { ws, user, b } = await setUpTestCases('Rep-TC-Filter');
      const id = await b.report(user, { kind: 'test_cases_dashboard', options: tcOptions('PAY') });
      let definition: unknown;
      const deps: GenerateDeps = { store: postgresReportStore, render: async (d) => ((definition = d), Buffer.from('%PDF')) };
      expect(await generateReport(worker, { reportId: id, workspaceId: ws.workspaceId }, FIRST, deps)).toBe('ready');
      const json = JSON.stringify(definition);
      expect(json).toContain('Needs Attention (2 of 3)');
      expect(json).toContain('Filter: Name: PAY');
      expect(json).toContain('Refund payment');
      expect(json).not.toContain('"Login"');
    }, 30_000);
  });
});
