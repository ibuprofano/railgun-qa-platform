import { describe, expect, it } from 'vitest';
import { actionKind, actorOf, dayLabel, DESCRIPTIONS, describeActivity, groupByDay, initialsOf, relativeTime } from './activity-format';
import type { ActivityEntry } from './activity-api';

/** Every action code the API and worker write today (grep of apps/api/src and apps/worker/src). */
const LOGGED_CODES = [
  'bug.created', 'bug.deleted', 'bug.linked', 'bug.updated', 'bug.purged',
  'environment.created', 'environment.deleted', 'environment.updated', 'environment_credential.revealed',
  'folder.created', 'folder.deleted', 'folder.moved', 'folder.renamed', 'folder.purged',
  'project.created', 'project.deleted', 'project.renamed', 'project.restored', 'project.purged',
  'tag.created', 'tag.deleted', 'tag.updated',
  'test_case.created', 'test_case.deleted', 'test_case.moved', 'test_case.updated', 'test_case.purged',
  'test_execution.canceled', 'test_execution.completed', 'test_execution.created', 'test_execution.deleted',
  'test_execution.marked_ready', 'test_execution.paused', 'test_execution.restarted', 'test_execution.resumed',
  'test_execution.returned_to_draft', 'test_execution.run_added', 'test_execution.run_removed',
  'test_execution.runs_reordered', 'test_execution.signed_off', 'test_execution.started', 'test_execution.updated',
  'test_execution.purged', 'test_run.outcome_set', 'workspace.renamed',
  'test_case.restored', 'folder.restored', 'test_execution.restored', 'bug.restored',
];

const entry = (overrides: Partial<ActivityEntry>): ActivityEntry => ({
  id: 'a1',
  actorName: 'Ana',
  actionCode: 'test_execution.started',
  entityType: 'test_execution',
  entityId: 'e1',
  entityName: 'Smoke',
  details: null,
  createdAt: '2026-11-23T10:00:00.000Z',
  ...overrides,
});

describe('describeActivity', () => {
  it.each(LOGGED_CODES)('has a sentence for %s', (code) => {
    expect(DESCRIPTIONS[code]).toBeDefined();
    expect(describeActivity(entry({ actionCode: code, details: {} }))).not.toContain(code);
  });

  it.each([
    [{ actionCode: 'test_execution.started' }, 'started execution “Smoke”'],
    [{ actionCode: 'test_run.outcome_set', entityName: 'Login', details: { from: 'Pending', to: 'Fail' } }, 'set run “Login” to Fail'],
    [{ actionCode: 'test_run.outcome_set', entityName: 'Login', details: { from: 'Fail', to: 'NeedsReview' } }, 'changed run “Login” from Fail to Needs Review'],
    [{ actionCode: 'bug.created', entityName: 'Login fails', details: { auto: true } }, 'filed bug “Login fails” automatically for a failed run'],
    [{ actionCode: 'bug.updated', entityName: 'X', details: { changes: { status: { from: 'Open', to: 'InProgress' } } } }, 'changed status of bug “X” from Open to In Progress'],
    [{ actionCode: 'bug.updated', entityName: 'X', details: { changes: { title: {}, tags: {} } } }, 'updated bug “X” (title, tags)'],
    [{ actionCode: 'test_execution.restarted', details: { attempt: 2, droppedRuns: 1 } }, 'restarted execution “Smoke” as attempt 2, dropping 1 run of deleted test cases'],
    [{ actionCode: 'test_execution.run_added', details: { testCaseName: 'Login' } }, 'added “Login” to execution “Smoke”'],
    [{ actionCode: 'environment.updated', entityName: 'Staging', details: { changes: { baseUrl: {} }, credentials: { added: ['guest'], changed: [], removed: ['buyer'] } } }, 'updated environment “Staging” (base URL; added guest; removed buyer)'],
    [{ actionCode: 'test_case.restored', entityName: 'Pay' }, 'restored test case “Pay”'],
    [{ actionCode: 'test_execution.restored' }, 'restored execution “Smoke”'],
    [{ actionCode: 'bug.restored', entityName: 'Broken' }, 'restored bug “Broken”'],
    [{ actionCode: 'folder.restored', entityName: 'Checkout', details: { folders: 1, testCases: 2 } }, 'restored folder “Checkout”'],
    [
      { actionCode: 'folder.restored', entityName: 'Checkout', details: { restoredWith: { type: 'test-case', id: 't1', name: 'Pay' } } },
      'restored folder “Checkout” with test case “Pay”',
    ],
  ])('%o reads "%s"', (overrides, sentence) => {
    expect(describeActivity(entry(overrides as Partial<ActivityEntry>))).toBe(sentence);
  });

  it('reads a report download (report-pipeline)', () => {
    expect(describeActivity(entry({ actionCode: 'report.downloaded', entityType: 'report', entityName: 'Bugs dashboard report' }))).toBe(
      'downloaded the Bugs dashboard report',
    );
  });

  it('falls back to the code for an unknown action', () => {
    expect(describeActivity(entry({ actionCode: 'widget.frobbed', entityName: 'W' }))).toBe('widget.frobbed “W”');
  });
});

describe('actorOf', () => {
  it('names the actor, or System for automatic actions', () => {
    expect(actorOf(entry({ actorName: 'Ana' }))).toBe('Ana');
    expect(actorOf(entry({ actorName: null }))).toBe('System');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-11-23T12:00:00.000Z');
  it.each([
    ['2026-11-23T11:59:50.000Z', 'just now'],
    ['2026-11-23T11:55:00.000Z', '5 minutes ago'],
    ['2026-11-23T09:00:00.000Z', '3 hours ago'],
    ['2026-11-21T12:00:00.000Z', '2 days ago'],
  ])('%s is %s', (iso, expected) => {
    expect(relativeTime(iso, now)).toBe(expected);
  });
});

describe('actionKind', () => {
  it.each([
    ['test_case.created', 'create'],
    ['folder.restored', 'create'],
    ['test_execution.run_added', 'create'],
    ['bug.deleted', 'remove'],
    ['bug.purged', 'remove'],
    ['test_execution.run_removed', 'remove'],
    ['bug.updated', 'change'],
    ['test_run.outcome_set', 'change'],
    ['environment_credential.revealed', 'change'],
  ])('%s is a %s', (actionCode, kind) => {
    expect(actionKind({ actionCode })).toBe(kind);
  });
});

describe('initialsOf', () => {
  it.each([
    ['Ana', 'AN'],
    ['Ana Ruiz', 'AR'],
    ['ana maria ruiz', 'AR'],
    ['  ', '?'],
  ])('%s → %s', (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });
});

describe('day grouping', () => {
  // Local-time dates, so the labels don't depend on the machine's time zone.
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);
  const weekday = (date: Date) => date.toLocaleDateString(undefined, { weekday: 'long' });
  const fullDate = (date: Date) => date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  it('labels days within a Thursday’s week by weekday, older ones by date', () => {
    const thursday = at(2026, 11, 26, 15); // Thursday 26 Nov 2026
    expect(dayLabel(at(2026, 11, 26, 1), thursday)).toBe('Today');
    expect(dayLabel(at(2026, 11, 25, 23), thursday)).toBe('Yesterday');
    expect(dayLabel(at(2026, 11, 23), thursday)).toBe(weekday(at(2026, 11, 23))); // Monday
    expect(dayLabel(at(2026, 11, 22), thursday)).toBe(fullDate(at(2026, 11, 22))); // last Sunday
    expect(dayLabel(at(2026, 11, 12), thursday)).toBe(fullDate(at(2026, 11, 12)));
  });

  it('on a Monday, anything before yesterday is a date', () => {
    const monday = at(2026, 11, 23);
    expect(dayLabel(at(2026, 11, 22), monday)).toBe('Yesterday');
    expect(dayLabel(at(2026, 11, 21), monday)).toBe(fullDate(at(2026, 11, 21)));
  });

  it('on a Sunday, the whole week back to Monday gets weekday names', () => {
    const sunday = at(2026, 11, 29);
    expect(dayLabel(at(2026, 11, 23), sunday)).toBe(weekday(at(2026, 11, 23)));
    expect(dayLabel(at(2026, 11, 22), sunday)).toBe(fullDate(at(2026, 11, 22)));
  });

  it('groups newest-first entries under consecutive headings, keeping order', () => {
    const now = at(2026, 11, 26, 15);
    const e = (id: string, date: Date) => entry({ id, createdAt: date.toISOString() });
    const groups = groupByDay([e('1', at(2026, 11, 26, 14)), e('2', at(2026, 11, 26, 9)), e('3', at(2026, 11, 25)), e('4', at(2026, 11, 2))], now);

    expect(groups.map((group) => [group.label, group.entries.map((x) => x.id)])).toEqual([
      ['Today', ['1', '2']],
      ['Yesterday', ['3']],
      [fullDate(at(2026, 11, 2)), ['4']],
    ]);
  });
});
