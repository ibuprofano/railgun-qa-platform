import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { ExecutionList, LIST_REFETCH_MS } from './execution-list';
import { useLiveConnected } from '../../lib/live-updates';
import { listExecutions } from '../../lib/executions-api';
import { renderWithProviders } from '../../test/render-with-providers';
import { makeExecution } from '../../test/execution-fixtures';

vi.mock('../../lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api-client')>()),
  useApiClient: () => ({ request: vi.fn() }),
}));
vi.mock('../../lib/tags-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tags-api')>()),
  listTags: vi.fn(async () => [{ id: 'tag-payments', name: 'payments', color: 'blue', testCaseCount: 1, bugCount: 0 }]),
}));
vi.mock('../../lib/executions-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/executions-api')>()),
  listExecutions: vi.fn(),
}));

vi.mock('../../lib/live-updates', () => ({ useLiveConnected: vi.fn(() => false) }));

const mockedList = vi.mocked(listExecutions);

function renderList(canCreate: boolean, onCreateClick = vi.fn()) {
  renderWithProviders(
    <ExecutionList projectId="p1" selectedId={null} onSelect={() => {}} canCreate={canCreate} onCreateClick={onCreateClick} />,
  );
  return { onCreateClick };
}

describe('ExecutionList polling', () => {
  beforeEach(() => {
    mockedList.mockReset().mockResolvedValue([makeExecution({ id: 'a', name: 'Running', status: 'InProgress' })]);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(useLiveConnected).mockReturnValue(false);
  });

  it('refetches while an execution is under way and the live stream is down', async () => {
    renderList(false);
    await screen.findByText('Running');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIST_REFETCH_MS);
    });

    expect(mockedList).toHaveBeenCalledTimes(2);
  });

  it('does not poll while the live stream is connected', async () => {
    vi.mocked(useLiveConnected).mockReturnValue(true);
    renderList(false);
    await screen.findByText('Running');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIST_REFETCH_MS * 3);
    });

    expect(mockedList).toHaveBeenCalledTimes(1);
  });
});

describe('ExecutionList', () => {
  beforeEach(() => {
    mockedList.mockReset();
  });

  it('shows each execution with status and counts', async () => {
    mockedList.mockResolvedValue([
      makeExecution({ id: 'a', name: 'Smoke', status: 'InProgress', counts: { total: 3, done: 1, pass: 1, fail: 0, needsReview: 0 } }),
    ]);
    renderList(false);

    const item = (await screen.findByText('Smoke')).closest('button')!;
    expect(within(item).getByText('In Progress')).toBeTruthy();
    expect(item.textContent).toContain('1/3 done · 1 pass · 0 fail · 0 needs review');
  });

  it('filtering by status narrows the list', async () => {
    mockedList.mockResolvedValue([
      makeExecution({ id: 'a', name: 'Running one', status: 'InProgress' }),
      makeExecution({ id: 'b', name: 'Draft one', status: 'Draft' }),
    ]);
    renderList(false);
    await screen.findByText('Running one');

    // Radix Select: open the trigger, then click the option.
    fireEvent.click(screen.getByLabelText('Filter by status'));
    fireEvent.click(await screen.findByRole('option', { name: 'Draft' }));

    expect(screen.queryByText('Running one')).toBeNull();
    expect(screen.getByText('Draft one')).toBeTruthy();
  });

  it('filtering by Canceled lists only Canceled executions', async () => {
    mockedList.mockResolvedValue([
      makeExecution({ id: 'a', name: 'Stopped one', status: 'Canceled' }),
      makeExecution({ id: 'b', name: 'Done one', status: 'Done' }),
    ]);
    renderList(false);
    await screen.findByText('Stopped one');

    fireEvent.click(screen.getByLabelText('Filter by status'));
    fireEvent.click(await screen.findByRole('option', { name: 'Canceled' }));

    expect(screen.getByText('Stopped one')).toBeTruthy();
    expect(screen.queryByText('Done one')).toBeNull();
  });

  it('reports filter changes to the screen when it keeps the filters', async () => {
    mockedList.mockResolvedValue([makeExecution({ id: 'a', name: 'Smoke' })]);
    const onFiltersChange = vi.fn();
    renderWithProviders(
      <ExecutionList
        projectId="p1"
        selectedId={null}
        onSelect={() => {}}
        canCreate={false}
        onCreateClick={() => {}}
        filters={{ status: 'Done' }}
        onFiltersChange={onFiltersChange}
      />,
    );
    await screen.findByLabelText('Filter by name');

    fireEvent.change(screen.getByLabelText('Filter by name'), { target: { value: 'smo' } });

    expect(onFiltersChange).toHaveBeenCalledWith({ status: 'Done', name: 'smo' });
  });

  it('filtering by name is case-insensitive', async () => {
    mockedList.mockResolvedValue([makeExecution({ id: 'a', name: 'Smoke' }), makeExecution({ id: 'b', name: 'Regression' })]);
    renderList(false);
    await screen.findByText('Smoke');

    fireEvent.change(screen.getByLabelText('Filter by name'), { target: { value: 'SMO' } });

    expect(screen.getByText('Smoke')).toBeTruthy();
    expect(screen.queryByText('Regression')).toBeNull();
  });

  it('the empty state offers creation only to Contributors and above', async () => {
    mockedList.mockResolvedValue([]);
    const { onCreateClick } = renderList(true);

    fireEvent.click(await screen.findByRole('button', { name: 'Create the first execution' }));
    expect(onCreateClick).toHaveBeenCalled();
  });

  it('a Viewer sees the empty state with no way to create', async () => {
    mockedList.mockResolvedValue([]);
    renderList(false);

    expect(await screen.findByText('No executions yet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /create|new execution/i })).toBeNull();
  });

  it("filters by its test cases' tags, with no Manage tags action", async () => {
    mockedList.mockResolvedValue([
      makeExecution({ id: 'a', name: 'Payments smoke', tagIds: ['tag-payments'] }),
      makeExecution({ id: 'b', name: 'Release regression', tagIds: [] }),
    ]);
    renderList(false);
    await screen.findByText('Payments smoke');

    fireEvent.click(screen.getByRole('button', { name: 'Filter by tags' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'payments' }));

    expect(screen.queryByText('Release regression')).toBeNull();
    expect(screen.getByText('Payments smoke')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Manage tags/ })).toBeNull();
  });
});
