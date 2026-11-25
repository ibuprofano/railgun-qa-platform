import { BadRequestException } from '@nestjs/common';
import { parseExecutionReportOptions, parseTestCaseReportOptions } from './report-rules';

/** The executions-dashboard options parser (specs/report-generation, executions-dashboard-report). */
const valid = () => ({
  filters: { status: 'Done', name: '  smoke ', environmentName: 'Staging', tagIds: ['3f2b6c1e-9a0d-4c55-8e2a-1b2c3d4e5f60'] },
  runTable: { tab: 'all', outcome: null, day: { date: '2026-03-04', outcome: 'Fail' }, name: ' login ', sort: { key: 'bugs', direction: 'desc' } },
  ranges: { executionsOverTime: 30, runsOverTime: 7 },
  include: { executions: true, runs: true },
});

describe('parseExecutionReportOptions', () => {
  it('parses a full request and cleans it like buildReportOptions', () => {
    expect(parseExecutionReportOptions(valid(), 'Europe/Madrid')).toEqual({
      tz: 'Europe/Madrid',
      filters: { status: 'Done', name: 'smoke', environmentName: 'Staging', tagIds: ['3f2b6c1e-9a0d-4c55-8e2a-1b2c3d4e5f60'] },
      runTable: { tab: 'all', outcome: null, day: { date: '2026-03-04', outcome: 'Fail' }, name: 'login', sort: { key: 'bugs', direction: 'desc' } },
      ranges: { executionsOverTime: 30, runsOverTime: 7 },
      include: { executions: true, runs: true },
    });
  });

  it('accepts no filters at all', () => {
    const { filters, ...rest } = valid();
    void filters;
    expect(parseExecutionReportOptions(rest, 'UTC').filters).toEqual({});
  });

  const refused: [string, (b: ReturnType<typeof valid>) => void][] = [
    ['both switches off', (b) => (b.include = { executions: false, runs: false })],
    ['an unknown status', (b) => ((b.filters as Record<string, unknown>).status = 'Archived')],
    ['an unknown browser', (b) => ((b.filters as Record<string, unknown>).browser = 'Netscape')],
    ['an unknown outcome', (b) => ((b.runTable as Record<string, unknown>).outcome = 'Maybe')],
    ['an unknown tab', (b) => ((b.runTable as Record<string, unknown>).tab = 'favourites')],
    ['an unknown sort key', (b) => (b.runTable.sort = { key: 'colour', direction: 'asc' })],
    ['a bad tag id', (b) => (b.filters.tagIds = ['not-an-id'])],
    ['a malformed day', (b) => (b.runTable.day = { date: '4 March', outcome: 'Fail' })],
    ['a range of 45', (b) => (b.ranges.runsOverTime = 45)],
  ];

  it.each(refused)('refuses %s', (_label, mutate) => {
    const body = valid();
    mutate(body);
    expect(() => parseExecutionReportOptions(body, 'UTC')).toThrow(BadRequestException);
  });
});

/** The test-cases-dashboard options parser (specs/report-generation, test-cases-dashboard-report). */
interface TestCasesBody {
  ranges: { overTime: number; passRate: number };
  needsAttention?: { name?: string; sort: { key: string; direction: string } };
}
const validTestCases = (): TestCasesBody => ({
  ranges: { overTime: 30, passRate: 7 },
  needsAttention: { name: 'pay', sort: { key: 'updatedAt', direction: 'desc' } },
});

describe('parseTestCaseReportOptions', () => {
  it('parses a full request', () => {
    expect(parseTestCaseReportOptions(validTestCases() as unknown as Record<string, unknown>, 'Europe/Madrid')).toEqual({
      tz: 'Europe/Madrid',
      ranges: { overTime: 30, passRate: 7 },
      needsAttention: { name: 'pay', sort: { key: 'updatedAt', direction: 'desc' } },
    });
  });

  it('stores an absent name as no filter', () => {
    const body = validTestCases();
    delete body.needsAttention!.name;
    expect(parseTestCaseReportOptions(body as unknown as Record<string, unknown>, 'UTC').needsAttention.name).toBe('');
  });

  const refusedTestCases: [string, (b: TestCasesBody) => void][] = [
    ['a missing needsAttention', (b) => delete b.needsAttention],
    ['a sort by folder', (b) => (b.needsAttention!.sort.key = 'folder')],
    ['a direction of up', (b) => (b.needsAttention!.sort.direction = 'up')],
    ['a 201-character name', (b) => (b.needsAttention!.name = 'x'.repeat(201))],
    ['a range of 45', (b) => (b.ranges.passRate = 45)],
  ];

  it.each(refusedTestCases)('refuses %s', (_label, mutate) => {
    const body = validTestCases();
    mutate(body);
    expect(() => parseTestCaseReportOptions(body as unknown as Record<string, unknown>, 'UTC')).toThrow(BadRequestException);
  });
});
