import type { ActivityEntry } from './activity-api';

/**
 * Turns an activity entry into the part of a sentence after the actor's name
 * ("set run “Login” to Fail"). Shared by the item History sections and, later, the
 * Activity screen (ADR 0021 decision 2). Unknown codes fall back to the code itself, so
 * a code added on the server never breaks the feed.
 */

const LABELS: Record<string, string> = {
  InProgress: 'In Progress',
  NeedsReview: 'Needs Review',
  WontFix: "Won't Fix",
};
const label = (value: unknown) => (typeof value === 'string' ? (LABELS[value] ?? value) : String(value));
const quote = (name: string) => `“${name}”`;

const FIELD_NAMES: Record<string, string> = {
  stepsToReproduce: 'steps to reproduce',
  baseUrl: 'base URL',
  defaultBrowser: 'default browser',
  gherkinScript: 'script',
  testCaseIds: 'test cases',
  autoCreateBug: 'auto-create bugs',
  viewportWidth: 'viewport',
  viewportHeight: 'viewport',
  environmentId: 'environment',
};
const fieldName = (field: string) => FIELD_NAMES[field] ?? field;

function fieldList(fields: string[]): string {
  return [...new Set(fields.map(fieldName))].join(', ');
}

type Describe = (entry: ActivityEntry, details: Record<string, unknown>) => string;

function bugUpdated(entry: ActivityEntry, details: Record<string, unknown>): string {
  const changes = (details.changes ?? {}) as Record<string, { from?: unknown; to?: unknown }>;
  const name = quote(entry.entityName);
  const fields = Object.keys(changes);
  if (fields.length === 1 && (fields[0] === 'status' || fields[0] === 'severity')) {
    const { from, to } = changes[fields[0]];
    return `changed ${fields[0]} of bug ${name} from ${label(from)} to ${label(to)}`;
  }
  return fields.length > 0 ? `updated bug ${name} (${fieldList(fields)})` : `updated bug ${name}`;
}

function testCaseUpdated(entry: ActivityEntry, details: Record<string, unknown>): string {
  const changes = (details.changes ?? {}) as Record<string, { from?: unknown; to?: unknown }>;
  const name = quote(entry.entityName);
  if (changes.status && Object.keys(changes).length === 1) {
    return `changed status of test case ${name} from ${label(changes.status.from)} to ${label(changes.status.to)}`;
  }
  const fields = Object.keys(changes);
  return fields.length > 0 ? `updated test case ${name} (${fieldList(fields)})` : `updated test case ${name}`;
}

function environmentUpdated(entry: ActivityEntry, details: Record<string, unknown>): string {
  const parts: string[] = Object.keys((details.changes ?? {}) as object).map(fieldName);
  const credentials = details.credentials as { added?: string[]; changed?: string[]; removed?: string[] } | undefined;
  if (credentials?.added?.length) parts.push(`added ${credentials.added.join(', ')}`);
  if (credentials?.changed?.length) parts.push(`changed ${credentials.changed.join(', ')}`);
  if (credentials?.removed?.length) parts.push(`removed ${credentials.removed.join(', ')}`);
  return parts.length > 0 ? `updated environment ${quote(entry.entityName)} (${parts.join('; ')})` : `updated environment ${quote(entry.entityName)}`;
}

function lifecycle(verb: string): Describe {
  return (entry) => `${verb} execution ${quote(entry.entityName)}`;
}

export const DESCRIPTIONS: Record<string, Describe> = {
  'test_execution.created': lifecycle('created'),
  'test_execution.updated': (entry, d) =>
    Array.isArray(d.fields) && d.fields.length > 0
      ? `edited execution ${quote(entry.entityName)} (${fieldList(d.fields as string[])})`
      : `edited execution ${quote(entry.entityName)}`,
  'test_execution.deleted': lifecycle('deleted'),
  'test_execution.purged': (entry) => `permanently removed execution ${quote(entry.entityName)} from the trash`,
  'test_execution.marked_ready': lifecycle('marked as Ready'),
  'test_execution.returned_to_draft': (entry) => `moved execution ${quote(entry.entityName)} back to Draft`,
  'test_execution.started': lifecycle('started'),
  'test_execution.paused': lifecycle('paused'),
  'test_execution.resumed': lifecycle('resumed'),
  'test_execution.completed': (entry) => `completed execution ${quote(entry.entityName)}: every run has an outcome`,
  'test_execution.signed_off': lifecycle('signed off'),
  'test_execution.canceled': lifecycle('canceled'),
  'test_execution.restarted': (entry, d) =>
    `restarted execution ${quote(entry.entityName)} as attempt ${d.attempt ?? '?'}` +
    (typeof d.droppedRuns === 'number' && d.droppedRuns > 0
      ? `, dropping ${d.droppedRuns} run${d.droppedRuns === 1 ? '' : 's'} of deleted test cases`
      : ''),
  'test_execution.runs_reordered': (entry, d) =>
    `moved a run of ${quote(entry.entityName)} from position ${d.fromPosition} to ${d.toPosition}`,
  'test_execution.run_added': (entry, d) => `added ${quote(String(d.testCaseName ?? 'a test case'))} to execution ${quote(entry.entityName)}`,
  'test_execution.run_removed': (entry, d) =>
    `removed ${quote(String(d.testCaseName ?? 'a test case'))} from execution ${quote(entry.entityName)}`,
  'test_run.outcome_set': (entry, d) =>
    d.from && d.from !== 'Pending'
      ? `changed run ${quote(entry.entityName)} from ${label(d.from)} to ${label(d.to)}`
      : `set run ${quote(entry.entityName)} to ${label(d.to)}`,
  'bug.created': (entry, d) => (d.auto ? `filed bug ${quote(entry.entityName)} automatically for a failed run` : `filed bug ${quote(entry.entityName)}`),
  'bug.updated': bugUpdated,
  'bug.linked': (entry) => `linked bug ${quote(entry.entityName)} to a run`,
  'bug.deleted': (entry) => `deleted bug ${quote(entry.entityName)}`,
  'bug.purged': (entry) => `permanently removed bug ${quote(entry.entityName)} from the trash`,
  'test_case.created': (entry) => `created test case ${quote(entry.entityName)}`,
  'test_case.updated': testCaseUpdated,
  'test_case.moved': (entry) => `moved test case ${quote(entry.entityName)}`,
  'test_case.deleted': (entry) => `deleted test case ${quote(entry.entityName)}`,
  'test_case.purged': (entry) => `permanently removed test case ${quote(entry.entityName)} from the trash`,
  'folder.created': (entry) => `created folder ${quote(entry.entityName)}`,
  'folder.renamed': (entry, d) => (d.from ? `renamed folder ${quote(String(d.from))} to ${quote(entry.entityName)}` : `renamed folder ${quote(entry.entityName)}`),
  'folder.moved': (entry) => `moved folder ${quote(entry.entityName)}`,
  'folder.deleted': (entry) => `deleted folder ${quote(entry.entityName)}`,
  'folder.purged': (entry) => `permanently removed folder ${quote(entry.entityName)} from the trash`,
  'tag.created': (entry) => `created tag ${quote(entry.entityName)}`,
  'tag.updated': (entry) => `updated tag ${quote(entry.entityName)}`,
  'tag.deleted': (entry) => `deleted tag ${quote(entry.entityName)}`,
  'environment.created': (entry) => `created environment ${quote(entry.entityName)}`,
  'environment.updated': environmentUpdated,
  'environment.deleted': (entry) => `deleted environment ${quote(entry.entityName)}`,
  'environment_credential.revealed': (entry, d) =>
    `revealed the password of ${quote(entry.entityName)}${d.environmentName ? ` in ${quote(String(d.environmentName))}` : ''}`,
  'project.created': (entry) => `created project ${quote(entry.entityName)}`,
  'project.renamed': (entry) => `renamed project to ${quote(entry.entityName)}`,
  'project.deleted': (entry) => `deleted project ${quote(entry.entityName)}`,
  'project.restored': (entry) => `restored project ${quote(entry.entityName)}`,
  'project.purged': (entry) => `permanently removed project ${quote(entry.entityName)} from the trash`,
  'workspace.renamed': (entry) => `renamed the workspace to ${quote(entry.entityName)}`,
};

/** The action, without the actor ("set run “Login” to Fail"). */
export function describeActivity(entry: ActivityEntry): string {
  const describe = DESCRIPTIONS[entry.actionCode];
  return describe ? describe(entry, entry.details ?? {}) : `${entry.actionCode} ${quote(entry.entityName)}`;
}

/** Who did it: the stored name, or "System" for automatic actions such as the purge. */
export const actorOf = (entry: ActivityEntry): string => entry.actorName ?? 'System';

/** "just now", "5 minutes ago", "3 days ago"; older than a week shows the date. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}
