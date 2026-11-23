import { Client } from 'pg';
import { LIVE_CHANNEL, parseLiveEvent, type LiveEvent } from '../../src/realtime/live-event';

/**
 * A plain `pg` client LISTENing on the live channel, for asserting which events a
 * request emitted. Notifications arrive asynchronously after commit, so `take()`
 * waits a short settle time before returning (and clearing) what has arrived.
 */
export interface LiveListener {
  take(settleMs?: number): Promise<LiveEvent[]>;
  close(): Promise<void>;
}

export async function startLiveListener(): Promise<LiveListener> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://railgun_app:app_dev_password@localhost:5433/railgun',
  });
  await client.connect();
  let received: LiveEvent[] = [];
  client.on('notification', (message) => {
    const event = parseLiveEvent(message.payload);
    if (event) {
      received.push(event);
    }
  });
  await client.query(`LISTEN ${LIVE_CHANNEL}`);

  return {
    async take(settleMs = 150) {
      await new Promise((resolve) => setTimeout(resolve, settleMs));
      const events = received;
      received = [];
      return events;
    },
    async close() {
      await client.end();
    },
  };
}
