import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { daysLeftText, folderContents, restoredMessage, TrashScreen } from './trash-screen';
import { listTrash, restoreTrashItem, type TrashEntry } from '../../lib/trash-api';
import { useSessionContext } from '../../lib/session-context';
import { notifySuccess } from '../../lib/notify';
import { ApiError } from '../../lib/api-client';
import { renderWithProviders } from '../../test/render-with-providers';

const replace = vi.fn();
let search = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/trash',
  useSearchParams: () => search,
}));
vi.mock('../../lib/session-context', () => ({ useSessionContext: vi.fn() }));
vi.mock('../../lib/notify', () => ({ notifySuccess: vi.fn() }));
vi.mock('../../lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api-client')>()),
  useApiClient: () => ({ request: vi.fn() }),
}));
vi.mock('../../lib/trash-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/trash-api')>()),
  listTrash: vi.fn(),
  restoreTrashItem: vi.fn(),
}));

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

const entry = (overrides: Partial<TrashEntry>): TrashEntry => ({
  type: 'test-case',
  id: 'tc-1',
  name: 'Pay with card',
  deletedAt: daysAgo(1),
  deletedByName: 'Ana',
  purgeAfter: daysAgo(-29),
  daysLeft: 29,
  ...overrides,
});

function mockRole(role: 'Admin' | 'Contributor' | 'Viewer') {
  vi.mocked(useSessionContext).mockReturnValue({
    data: { workspaceId: 'w1', projectId: 'p1', projectName: 'Project', role },
    loading: false,
  } as unknown as ReturnType<typeof useSessionContext>);
}

const rowOf = (name: string) => screen.getByRole('listitem', { name: new RegExp(name) });

describe('TrashScreen', () => {
  beforeEach(() => {
    replace.mockReset();
    search = new URLSearchParams();
    mockRole('Admin');
    vi.mocked(listTrash).mockReset();
    vi.mocked(restoreTrashItem).mockReset();
    vi.mocked(notifySuccess).mockReset();
  });

  describe('list', () => {
    it('shows each deletion with what it held, who deleted it and the days left', async () => {
      vi.mocked(listTrash).mockResolvedValue([
        entry({ type: 'folder', id: 'f1', name: 'Checkout', folders: 2, testCases: 4 }),
        entry({ type: 'bug', id: 'b1', name: 'Total wrong', deletedByName: null, daysLeft: 0 }),
      ]);

      renderWithProviders(<TrashScreen />);

      const folder = await screen.findByRole('listitem', { name: /Checkout/ });
      expect(folder.textContent).toContain('1 folder, 4 test cases');
      expect(folder.textContent).toContain('Deleted by Ana');
      expect(folder.textContent).toContain('1 day ago');
      expect(folder.textContent).toContain('29 days left');
      expect(within(folder).getByLabelText('Folder')).toBeTruthy();
      const bug = rowOf('Total wrong');
      expect(bug.textContent).toContain('Removed at the next cleanup');
      expect(bug.textContent).toContain('Deleted by Unknown');
      expect(listTrash).toHaveBeenCalledWith(expect.anything(), 'p1', null);
    });

    it('filters by type, kept in the address', async () => {
      vi.mocked(listTrash).mockResolvedValue([entry({})]);
      const { rerender } = renderWithProviders(<TrashScreen />);
      await screen.findByText('Pay with card');

      fireEvent.click(screen.getByRole('radio', { name: 'Executions' }));
      expect(replace).toHaveBeenCalledWith('/trash?type=execution');

      search = new URLSearchParams('type=execution');
      rerender(<TrashScreen />);
      await waitFor(() => expect(listTrash).toHaveBeenCalledWith(expect.anything(), 'p1', 'execution'));
      expect(screen.getByRole('radio', { name: 'Executions' }).getAttribute('aria-checked')).toBe('true');
    });

    it('says when the trash is empty', async () => {
      vi.mocked(listTrash).mockResolvedValue([]);

      renderWithProviders(<TrashScreen />);

      expect(await screen.findByText('The trash is empty')).toBeTruthy();
    });

    it.each(['Contributor', 'Viewer'] as const)('shows access denied to a %s', (role) => {
      mockRole(role);

      renderWithProviders(<TrashScreen />);

      expect(screen.getByRole('alert').textContent).toMatch(/access denied/i);
      expect(screen.queryByRole('button', { name: /Restore/ })).toBeNull();
      expect(listTrash).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('restores, confirms with the name, refetches and invalidates the other screens', async () => {
      vi.mocked(listTrash).mockResolvedValueOnce([entry({})]).mockResolvedValueOnce([]);
      vi.mocked(restoreTrashItem).mockResolvedValue({ restored: [{ type: 'test-case', id: 'tc-1', name: 'Pay with card' }] });
      const { queryClient } = renderWithProviders(<TrashScreen />);
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

      fireEvent.click(await screen.findByRole('button', { name: /Restore/ }));

      await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith('Restored “Pay with card”'));
      expect(restoreTrashItem).toHaveBeenCalledWith(expect.anything(), 'p1', expect.objectContaining({ type: 'test-case', id: 'tc-1' }));
      expect(await screen.findByText('The trash is empty')).toBeTruthy();
      const keys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
      for (const key of [
        ['projects', 'p1', 'trash'],
        ['projects', 'p1', 'activity'],
        ['projects', 'p1', 'folders'],
        ['projects', 'p1', 'test-cases'],
        ['projects', 'p1', 'executions'],
        ['projects', 'p1', 'bugs'],
      ]) {
        expect(keys).toContain(JSON.stringify(key));
      }
    });

    it('names the folders restored with the item', async () => {
      vi.mocked(listTrash).mockResolvedValue([entry({})]);
      vi.mocked(restoreTrashItem).mockResolvedValue({
        restored: [
          { type: 'test-case', id: 'tc-1', name: 'Pay with card' },
          { type: 'folder', id: 'f1', name: 'Checkout' },
        ],
      });
      renderWithProviders(<TrashScreen />);

      fireEvent.click(await screen.findByRole('button', { name: /Restore/ }));

      await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith('Restored “Pay with card” with folder “Checkout”'));
    });

    it('shows a refusal on its own row and keeps the row', async () => {
      vi.mocked(listTrash).mockResolvedValue([
        entry({ type: 'folder', id: 'f1', name: 'Checkout', folders: 1, testCases: 0 }),
        entry({ type: 'bug', id: 'b1', name: 'Total wrong' }),
      ]);
      vi.mocked(restoreTrashItem).mockRejectedValue(
        new ApiError(409, 'a folder named "Checkout" already exists in the same place; rename it, then restore', '/trash'),
      );
      renderWithProviders(<TrashScreen />);
      await screen.findByText('Checkout');

      fireEvent.click(within(rowOf('Checkout')).getByRole('button', { name: /Restore/ }));

      await waitFor(() => expect(rowOf('Checkout').textContent).toContain('a folder named "Checkout" already exists'));
      expect(rowOf('Total wrong').textContent).not.toContain('already exists');
      expect(notifySuccess).not.toHaveBeenCalled();
    });

    it('disables Restore while the request is pending', async () => {
      vi.mocked(listTrash).mockResolvedValue([entry({})]);
      vi.mocked(restoreTrashItem).mockReturnValue(new Promise(() => {}));
      renderWithProviders(<TrashScreen />);

      fireEvent.click(await screen.findByRole('button', { name: /Restore/ }));

      await waitFor(() => expect((screen.getByRole('button', { name: /Restoring/ }) as HTMLButtonElement).disabled).toBe(true));
    });
  });
});

describe('trash text helpers', () => {
  it.each([
    [{ folders: 2, testCases: 4 }, '1 folder, 4 test cases'],
    [{ folders: 3, testCases: 1 }, '2 folders, 1 test case'],
    [{ folders: 1, testCases: 2 }, '2 test cases'],
    [{ folders: 1, testCases: 0 }, 'Empty'],
  ])('%o holds "%s"', (counts, text) => {
    expect(folderContents(counts)).toBe(text);
  });

  it('counts down in days, then says it goes at the next cleanup', () => {
    expect(daysLeftText(29)).toBe('29 days left');
    expect(daysLeftText(1)).toBe('1 day left');
    expect(daysLeftText(0)).toBe('Removed at the next cleanup');
  });

  it('names every folder that came back', () => {
    expect(
      restoredMessage([
        { type: 'test-case', id: '1', name: 'Pay' },
        { type: 'folder', id: '2', name: 'Cards' },
        { type: 'folder', id: '3', name: 'Checkout' },
      ]),
    ).toBe('Restored “Pay” with folders “Cards”, “Checkout”');
  });
});
