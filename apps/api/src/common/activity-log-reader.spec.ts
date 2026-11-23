import { decodeActivityCursor, encodeActivityCursor } from './activity-log-reader';

describe('activity history cursor', () => {
  it('round-trips a keyset position', () => {
    const cursor = { createdAt: new Date('2026-11-23T10:00:00.123Z'), id: '8f2b1c3e-0d4a-4e5f-9a6b-7c8d9e0f1a2b' };

    expect(decodeActivityCursor(encodeActivityCursor(cursor))).toEqual(cursor);
  });

  it.each([
    ['not base64 of anything useful', 'zzz'],
    ['no separator', Buffer.from('2026-11-23T10:00:00Z').toString('base64url')],
    ['a bad date', Buffer.from('yesterday|8f2b1c3e-0d4a-4e5f-9a6b-7c8d9e0f1a2b').toString('base64url')],
    ['a bad id', Buffer.from('2026-11-23T10:00:00Z|42').toString('base64url')],
  ])('rejects %s', (_label, raw) => {
    expect(decodeActivityCursor(raw)).toBeNull();
  });
});
