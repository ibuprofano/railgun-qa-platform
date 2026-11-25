import { parseCrontab } from 'graphile-worker';
import { CRONTAB } from './crontab';

describe('CRONTAB', () => {
  it('parses into the daily trash_purge and health_snapshot items, each backfilling a day', () => {
    const items = parseCrontab(CRONTAB);

    expect(items.map((item) => item.task)).toEqual(['trash_purge', 'health_snapshot']);
    expect(items.map((item) => item.identifier)).toEqual(['trash_purge', 'health_snapshot']);
    expect(items.every((item) => item.options.backfillPeriod === 86_400_000)).toBe(true);
  });

  it('runs the snapshot at 00:15 UTC', () => {
    const snapshot = parseCrontab(CRONTAB).find((item) => item.task === 'health_snapshot')!;

    expect(snapshot.match({ min: 15, hour: 0, date: 25, month: 11, dow: 3 } as never)).toBe(true);
    expect(snapshot.match({ min: 0, hour: 3, date: 25, month: 11, dow: 3 } as never)).toBe(false);
  });
});
