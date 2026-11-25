import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { EnvironmentsSection } from './environments-section';
import { deleteEnvironment, listEnvironments } from '../../lib/environments-api';
import { DELETE_ENVIRONMENT_TEXT } from './delete-environment-dialog';
import { production, staging } from '../../test/environment-fixtures';
import { renderWithProviders } from '../../test/render-with-providers';

vi.mock('../../lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api-client')>()),
  useApiClient: () => ({ request: vi.fn() }),
}));
vi.mock('../../lib/environments-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/environments-api')>()),
  listEnvironments: vi.fn(),
  deleteEnvironment: vi.fn(),
}));
vi.mock('../../lib/notify', () => ({ notifySuccess: vi.fn() }));

const rows = () =>
  within(screen.getByRole('table', { name: 'Environments' }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell').slice(0, 4).map((cell) => cell.textContent));

describe('EnvironmentsSection (specs/project-settings-screen)', () => {
  beforeEach(() => {
    vi.mocked(listEnvironments).mockReset().mockResolvedValue([staging, production]);
    vi.mocked(deleteEnvironment).mockReset().mockResolvedValue(undefined);
  });

  it('lists environments oldest first, with base URL, default browser and credential count', async () => {
    renderWithProviders(<EnvironmentsSection projectId="p1" />);
    await screen.findByRole('table', { name: 'Environments' });
    expect(rows()).toEqual([
      ['Staging', 'https://staging.shop.test', 'Firefox', '2'],
      ['Production', 'https://shop.test', 'Chromium', '1'],
    ]);
    expect(screen.getByRole('button', { name: 'Edit Staging' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete Production' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Add environment/ })).toBeTruthy();
  });

  it('says "No environments yet" and still offers Add environment', async () => {
    vi.mocked(listEnvironments).mockResolvedValue([]);
    renderWithProviders(<EnvironmentsSection projectId="p1" />);
    expect(await screen.findByText('No environments yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Add environment/ })).toBeTruthy();
  });

  it('shows an error with retry when the list fails to load', async () => {
    vi.mocked(listEnvironments).mockRejectedValueOnce(new Error('down')).mockResolvedValue([staging]);
    renderWithProviders(<EnvironmentsSection projectId="p1" />);
    expect(await screen.findByText('The environments could not be loaded.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /retry|try again/i }));
    await waitFor(() => expect(screen.getByRole('table', { name: 'Environments' })).toBeTruthy());
  });

  describe('Delete', () => {
    it('names the environment and says executions keep its name', async () => {
      renderWithProviders(<EnvironmentsSection projectId="p1" />);
      fireEvent.click(await screen.findByRole('button', { name: 'Delete Staging' }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('Delete “Staging”?')).toBeTruthy();
      expect(within(dialog).getByText(DELETE_ENVIRONMENT_TEXT)).toBeTruthy();
    });

    it('deletes after confirming, refreshes the list and every environment query', async () => {
      const { queryClient } = renderWithProviders(<EnvironmentsSection projectId="p1" />);
      // The execution's environment panel caches the detail under the same prefix.
      queryClient.setQueryData(['projects', 'p1', 'environments', 'env-staging'], staging);
      fireEvent.click(await screen.findByRole('button', { name: 'Delete Staging' }));
      vi.mocked(listEnvironments).mockResolvedValue([production]);
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(rows()).toEqual([['Production', 'https://shop.test', 'Chromium', '1']]));
      expect(deleteEnvironment).toHaveBeenCalledWith(expect.anything(), 'p1', 'env-staging');
      expect(queryClient.getQueryState(['projects', 'p1', 'environments', 'env-staging'])?.isInvalidated).toBe(true);
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('changes nothing when cancelled', async () => {
      renderWithProviders(<EnvironmentsSection projectId="p1" />);
      fireEvent.click(await screen.findByRole('button', { name: 'Delete Staging' }));
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(deleteEnvironment).not.toHaveBeenCalled();
      expect(rows()).toHaveLength(2);
    });
  });
});
