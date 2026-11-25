import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  buildReportOptions,
  COMPLETED_OUTCOMES,
  EXECUTION_STATUSES,
  isReportApiKind,
  NEEDS_ATTENTION_SORT_KEYS,
  REPORT_KIND_LABELS,
  REPORT_KINDS,
  RUN_OUTCOMES,
  type ExecutionReportOptions,
  type ReportApiKind,
  type ReportDbKind,
  type RunSortKey,
  type TestCaseReportOptions,
} from '@railgun-qa/reporting';
import { parseTimeZone } from '../overview/overview-trends';
import { isUuid } from '../executions/execution-input';

export { REPORT_KIND_LABELS };
export type { ReportApiKind, ReportDbKind };

/** Chart ranges a report may use (PRD §6.12.2). */
export const REPORT_RANGES = [7, 15, 30, 90] as const;

export interface ReportRequest {
  kind: ReportDbKind;
  options: Record<string, unknown>;
}

type Body = Record<string, unknown>;
const bad = (message: string) => new BadRequestException(message);

function range(value: unknown, field: string): number {
  if (typeof value !== 'number' || !(REPORT_RANGES as readonly number[]).includes(value)) {
    throw bad(`${field} must be one of: ${REPORT_RANGES.join(', ')}`);
  }
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw bad(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

function optionalText(value: unknown, field: string, max = 200): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > max) throw bad(`${field} must be text of at most ${max} characters`);
  return value;
}

const object = (value: unknown, field: string): Body => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw bad(`${field} must be an object`);
  return value as Body;
};

const RUN_SORT_KEYS: readonly RunSortKey[] = ['order', 'testCase', 'outcome', 'attempts', 'bugs', 'createdAt', 'updatedAt'];
const BROWSERS = ['Chromium', 'Firefox', 'WebKit'] as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** `ExecutionReportOptions` from a request body (executions-dashboard-report design.md decision 2). */
export function parseExecutionReportOptions(body: Body, tz: string): ExecutionReportOptions {
  const filters = body.filters === undefined ? {} : object(body.filters, 'filters');
  const tagIds = filters.tagIds;
  if (tagIds !== undefined && (!Array.isArray(tagIds) || tagIds.length > 50 || !tagIds.every(isUuid))) {
    throw bad('filters.tagIds must be at most 50 tag ids');
  }
  const runTable = object(body.runTable, 'runTable');
  const day = runTable.day === null || runTable.day === undefined ? null : object(runTable.day, 'runTable.day');
  if (day && (typeof day.date !== 'string' || !DAY.test(day.date) || Number.isNaN(Date.parse(`${day.date}T00:00:00Z`)))) {
    throw bad('runTable.day.date must be a YYYY-MM-DD day');
  }
  const sort = object(runTable.sort, 'runTable.sort');
  const ranges = object(body.ranges, 'ranges');
  const include = object(body.include, 'include');
  if (typeof include.executions !== 'boolean' || typeof include.runs !== 'boolean') {
    throw bad('include.executions and include.runs must be true or false');
  }
  if (!include.executions && !include.runs) {
    throw bad('include must turn on executions, runs or both');
  }

  return buildReportOptions({
    tz,
    filters: {
      name: optionalText(filters.name, 'filters.name'),
      status: filters.status === undefined || filters.status === null ? undefined : oneOf(filters.status, EXECUTION_STATUSES, 'filters.status'),
      environmentName: optionalText(filters.environmentName, 'filters.environmentName'),
      browser: filters.browser === undefined || filters.browser === null ? undefined : oneOf(filters.browser, BROWSERS, 'filters.browser'),
      tagIds: tagIds as string[] | undefined,
    },
    runTable: {
      tab: oneOf(runTable.tab, ['needsAttention', 'all'] as const, 'runTable.tab'),
      outcome: runTable.outcome === null || runTable.outcome === undefined ? null : oneOf(runTable.outcome, RUN_OUTCOMES, 'runTable.outcome'),
      day: day ? { date: day.date as string, outcome: oneOf(day.outcome, COMPLETED_OUTCOMES, 'runTable.day.outcome') } : null,
      name: optionalText(runTable.name, 'runTable.name') ?? '',
      sort: { key: oneOf(sort.key, RUN_SORT_KEYS, 'runTable.sort.key'), direction: oneOf(sort.direction, ['asc', 'desc'] as const, 'runTable.sort.direction') },
    },
    ranges: { executionsOverTime: range(ranges.executionsOverTime, 'ranges.executionsOverTime'), runsOverTime: range(ranges.runsOverTime, 'ranges.runsOverTime') },
    include: { executions: include.executions, runs: include.runs },
  });
}

/** `TestCaseReportOptions` from a request body (test-cases-dashboard-report design.md decision 2). */
export function parseTestCaseReportOptions(body: Body, tz: string): TestCaseReportOptions {
  const ranges = object(body.ranges, 'ranges');
  const needsAttention = object(body.needsAttention, 'needsAttention');
  const sort = object(needsAttention.sort, 'needsAttention.sort');
  return {
    tz,
    ranges: {
      overTime: range(ranges.overTime, 'ranges.overTime') as TestCaseReportOptions['ranges']['overTime'],
      passRate: range(ranges.passRate, 'ranges.passRate') as TestCaseReportOptions['ranges']['passRate'],
    },
    needsAttention: {
      name: optionalText(needsAttention.name, 'needsAttention.name') ?? '',
      sort: {
        key: oneOf(sort.key, NEEDS_ATTENTION_SORT_KEYS, 'needsAttention.sort.key'),
        direction: oneOf(sort.direction, ['asc', 'desc'] as const, 'needsAttention.sort.direction'),
      },
    },
  };
}

/** Each kind's options parser; typed by kind so a new kind can't be added without one. */
const PARSERS: Record<ReportDbKind, (body: Body, tz: string) => Record<string, unknown>> = {
  bugs_dashboard: (body, tz) => ({ tz, range: range(body.range, 'range') }),
  executions_dashboard: (body, tz) => parseExecutionReportOptions(body, tz) as unknown as Record<string, unknown>,
  test_cases_dashboard: (body, tz) => parseTestCaseReportOptions(body, tz) as unknown as Record<string, unknown>,
};

/** Validates a request body before anything is created; anything unknown answers 400. */
export async function parseReportRequest(tx: Prisma.TransactionClient, body: Body): Promise<ReportRequest> {
  if (!isReportApiKind(body.kind)) {
    throw bad(`kind must be one of: ${Object.keys(REPORT_KINDS).join(', ')}`);
  }
  const kind = REPORT_KINDS[body.kind as ReportApiKind];
  // Options first, so a malformed body answers before the time zone is looked up.
  PARSERS[kind](body, 'UTC');
  const tz = await parseTimeZone(tx, body.tz);
  return { kind, options: PARSERS[kind](body, tz) };
}
