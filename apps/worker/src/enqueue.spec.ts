import type { Pool, PoolClient } from 'pg';
import { createWorkerPool } from './db';
import { createAppPool } from '../test/fixtures';

/** enqueue_job (migration 0014), called as the API's role, counted as the worker's. */
describe('enqueue_job', () => {
  let app: Pool;
  let worker: Pool;
  const created: string[] = [];

  beforeAll(() => {
    app = createAppPool();
    worker = createWorkerPool();
  });

  afterAll(async () => {
    await worker.query('DELETE FROM graphile_worker._private_jobs WHERE id = ANY($1::bigint[])', [created]);
    await app.end();
    await worker.end();
  });

  async function inTransaction(fn: (client: PoolClient) => Promise<string | null>, commit: boolean) {
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      const id = await fn(client);
      await client.query(commit ? 'COMMIT' : 'ROLLBACK');
      return id;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const enqueue = (client: PoolClient, task: string) =>
    client.query<{ id: string }>('SELECT enqueue_job($1) AS id', [task]).then(({ rows }) => rows[0].id);

  async function jobExists(id: string): Promise<boolean> {
    const { rows } = await worker.query('SELECT 1 FROM graphile_worker._private_jobs WHERE id = $1', [id]);
    return rows.length === 1;
  }

  it('queues the job when the enclosing transaction commits', async () => {
    const id = (await inTransaction((client) => enqueue(client, 'trash_purge'), true))!;
    created.push(id);

    expect(await jobExists(id)).toBe(true);
  });

  it('queues nothing when the enclosing transaction rolls back', async () => {
    const id = (await inTransaction((client) => enqueue(client, 'trash_purge'), false))!;

    expect(await jobExists(id)).toBe(false);
  });

  it('refuses a task name that is not on the allow-list', async () => {
    await expect(inTransaction((client) => enqueue(client, 'drop_everything'), true)).rejects.toThrow(
      /unknown job task: drop_everything/,
    );
  });

  it('queues report_generate with 3 attempts, once per report however often it is enqueued', async () => {
    const reportId = '00000000-0000-4000-8000-' + String(Date.now()).slice(-12).padStart(12, '0');
    const enqueueReport = (client: PoolClient) =>
      client
        .query<{ id: string }>(`SELECT enqueue_job('report_generate', $1::jsonb) AS id`, [JSON.stringify({ reportId })])
        .then(({ rows }) => rows[0].id);
    const first = (await inTransaction(enqueueReport, true))!;
    const second = (await inTransaction(enqueueReport, true))!;
    created.push(first, second);

    expect(second).toBe(first);
    const { rows } = await worker.query<{ max_attempts: number; n: string }>(
      `SELECT max_attempts, (SELECT count(*) FROM graphile_worker._private_jobs WHERE key = $1) AS n
       FROM graphile_worker._private_jobs WHERE id = $2`,
      [`report:${reportId}`, first],
    );
    expect(rows[0]).toEqual({ max_attempts: 3, n: '1' });
  });

  it('refuses report_generate without a reportId', async () => {
    await expect(inTransaction((client) => enqueue(client, 'report_generate'), true)).rejects.toThrow(/needs a reportId/);
  });

  it("doesn't let the API's role touch the queue tables directly", async () => {
    await expect(app.query('SELECT * FROM graphile_worker.jobs')).rejects.toThrow(/permission denied/);
    await expect(app.query('SELECT * FROM graphile_worker._private_jobs')).rejects.toThrow(/permission denied/);
  });
});
