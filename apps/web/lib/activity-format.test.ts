import { describe, expect, it } from 'vitest';
import { actorOf, DESCRIPTIONS, describeActivity, relativeTime } from './activity-format';
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
  ])('%o reads "%s"', (overrides, sentence) => {
    expect(describeActivity(entry(overrides as Partial<ActivityEntry>))).toBe(sentence);
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
