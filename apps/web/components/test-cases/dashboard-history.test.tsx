import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { DashboardHistory } from './dashboard-history';
import { EXECUTION_HISTORY_TABS } from '../executions/execution-dashboard';
import { listProjectActivity, type ActivityEntry } from '../../lib/activity-api';
import { renderWithProviders } from '../../test/render-with-providers';

vi.mock('../../lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api-client')>()),
  useApiClient: () => ({ request: vi.fn() }),
}));
vi.mock('../../lib/activity-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/activity-api')>()),
  listProjectActivity: vi.fn(),
}));

const entry = (i: number): ActivityEntry => ({
  id: `a${i}`,
  actorName: 'Ana',
  actionCode: 'test_case.created',
  entityType: 'test_case',
  entityId: `t${i}`,
  entityName: `Case ${i}`,
  details: {},
  createdAt: new Date(Date.now() - i * 60_000).toISOString(),
});

describe('DashboardHistory (specs/test-cases-screen)', () => {
  beforeEach(() => {
    vi.mocked(listProjectActivity)
      .mockReset()
      .mockImplementation(async (_client, _projectId, _type, before) =>
        before ? { entries: [entry(20)], nextCursor: null } : { entries: Array.from({ length: 12 }, (_, i) => entry(i)), nextCursor: 'c1' },
      );
  });

  it('is collapsed by default, and shows the latest 5 with a "5+" badge', async () => {
    renderWithProviders(<DashboardHistory projectId="p1" />);
    const toggle = screen.getByRole('button', { name: /History/ });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(await screen.findByTestId('history-count')).toBeTruthy();
    expect(screen.getByTestId('history-count').textContent).toBe('5+');
    expect(screen.queryByRole('list', { name: 'Test case history' })).toBeNull();
    expect(vi.mocked(listProjectActivity).mock.calls[0][2]).toBe('test-cases');

    fireEvent.click(toggle);
    const items = within(screen.getByRole('list', { name: 'Test case history' })).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(items[0].textContent).toContain('Case 0');
  });

  it('opens the full test case history with Load more', async () => {
    renderWithProviders(<DashboardHistory projectId="p1" />);

    fireEvent.click(screen.getByRole('button', { name: 'See full history' }));

    const dialog = await screen.findByRole('dialog', { name: 'Test case history' });
    await within(dialog).findByText(/Case 11/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(within(dialog).getByText(/Case 20/)).toBeTruthy());
  });
});

const runEntry = (i: number): ActivityEntry => ({
  id: `r${i}`,
  actorName: 'Bo',
  actionCode: 'test_run.outcome_set',
  entityType: 'test_run',
  entityId: `run${i}`,
  entityName: `Run case ${i}`,
  details: { outcome: 'Pass' },
  createdAt: new Date(Date.now() - i * 60_000).toISOString(),
});

describe('DashboardHistory with Executions and Runs tabs (specs/executions-screen)', () => {
  beforeEach(() => {
    vi.mocked(listProjectActivity)
      .mockReset()
      .mockImplementation(async (_client, _projectId, type) =>
        type === 'runs'
          ? { entries: Array.from({ length: 8 }, (_, i) => runEntry(i)), nextCursor: null }
          : { entries: [entry(1), entry(2)], nextCursor: null },
      );
  });

  it('opens on Executions; the Runs tab shows its latest 5 with a "5+" badge', async () => {
    renderWithProviders(<DashboardHistory projectId="p1" tabs={EXECUTION_HISTORY_TABS} />);
    await waitFor(() => expect(screen.getByTestId('history-count').textContent).toBe('2'));
    expect(vi.mocked(listProjectActivity).mock.calls.map((c) => c[2])).toEqual(['executions']);

    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    expect(screen.getByRole('tab', { name: 'Executions' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Runs' }));

    const list = await screen.findByRole('list', { name: 'Run history' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByTestId('history-count').textContent).toBe('5+');
  });

  it('"See full history" opens the history of the open tab', async () => {
    renderWithProviders(<DashboardHistory projectId="p1" tabs={EXECUTION_HISTORY_TABS} />);
    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    fireEvent.click(screen.getByRole('tab', { name: 'Runs' }));

    fireEvent.click(screen.getByRole('button', { name: 'See full history' }));

    const dialog = await screen.findByRole('dialog', { name: 'Run history' });
    await within(dialog).findByText(/Run case 7/);
  });

  it('a single tab shows no tab row', async () => {
    renderWithProviders(<DashboardHistory projectId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});
