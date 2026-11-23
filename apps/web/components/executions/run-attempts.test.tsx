import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { RunAttempts } from './run-attempts';
import { listRunAttempts } from '../../lib/executions-api';
import { renderWithProviders } from '../../test/render-with-providers';
import { makeExecution, makeRun } from '../../test/execution-fixtures';

vi.mock('../../lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api-client')>()),
  useApiClient: () => ({ request: vi.fn() }),
}));
vi.mock('../../lib/executions-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/executions-api')>()),
  listRunAttempts: vi.fn(),
}));

const run = makeRun({ id: 'run-1' });

describe('RunAttempts', () => {
  beforeEach(() => {
    vi.mocked(listRunAttempts).mockReset();
  });

  it('lists earlier attempts newest first, with who set each outcome', async () => {
    vi.mocked(listRunAttempts).mockResolvedValue([
      { attempt: 2, position: 1, outcome: 'Pass', outcomeUpdatedAt: '2026-11-20T10:00:00.000Z', outcomeUpdatedByName: 'Ana', testCaseName: 'Login', gherkinScript: null },
      { attempt: 1, position: 1, outcome: 'Fail', outcomeUpdatedAt: '2026-11-19T10:00:00.000Z', outcomeUpdatedByName: 'Bo', testCaseName: 'Login', gherkinScript: null },
    ]);
    renderWithProviders(<RunAttempts projectId="p1" execution={makeExecution({ attempt: 3 })} run={run} />);

    const section = await screen.findByRole('region', { name: 'Earlier attempts' });
    const items = await within(section).findAllByRole('listitem');
    expect(items.map((item) => item.textContent?.split(',')[0])).toEqual(['Attempt 2Passby Ana', 'Attempt 1Failby Bo']);
    expect(listRunAttempts).toHaveBeenCalledWith(expect.anything(), 'p1', 'exec-1', 'run-1');
  });

  it('shows and fetches nothing before a Restart', () => {
    renderWithProviders(<RunAttempts projectId="p1" execution={makeExecution({ attempt: 1 })} run={run} />);

    expect(screen.queryByRole('region', { name: 'Earlier attempts' })).toBeNull();
    expect(listRunAttempts).not.toHaveBeenCalled();
  });
});
