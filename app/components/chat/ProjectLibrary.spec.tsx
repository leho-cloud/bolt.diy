import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectLibrary } from './ProjectLibrary';
import { invalidateChatCache } from '~/lib/persistence/chatCache';
import { deleteById, getAll, getSnapshot, openDatabase } from '~/lib/persistence/db';

vi.mock('~/lib/persistence/db', () => ({
  deleteById: vi.fn(),
  getAll: vi.fn(),
  getSnapshot: vi.fn(),
  openDatabase: vi.fn(),
}));
vi.mock('~/lib/persistence/chatCache', () => ({ invalidateChatCache: vi.fn() }));
vi.mock('~/lib/common/projectSummary', () => ({ projectSummary: () => ({ hasFiles: true, fileCount: 2 }) }));
vi.mock('~/components/ui/Dialog', () => ({
  ConfirmationDialog: ({ isOpen, onClose, onConfirm, title, description, isLoading }: any) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        <p>{description}</p>
        <button onClick={onClose} disabled={isLoading}>
          Mégse
        </button>
        <button onClick={onConfirm} disabled={isLoading}>
          Végleges törlés
        </button>
      </div>
    ) : null,
}));

const database = {} as IDBDatabase;
const project = { id: 'one', urlId: 'photo', description: 'Fotós oldal', messages: [], timestamp: '2026-11-01' };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(openDatabase).mockResolvedValue(database);
  vi.mocked(getAll).mockResolvedValue([project]);
  vi.mocked(getSnapshot).mockResolvedValue(undefined);
  vi.mocked(deleteById).mockResolvedValue(undefined);
});
afterEach(cleanup);
describe('project deletion from the welcome page', () => {
  it('cancelling leaves the project and its saved files untouched', async () => {
    const view = render(<ProjectLibrary />);
    const remove = await view.findByRole('button', { name: 'Fotós oldal törlése' });
    fireEvent.click(remove);
    expect(deleteById).not.toHaveBeenCalled();
    expect(view.getByRole('dialog')).toHaveTextContent('A már közzétett weboldal megmarad');
    fireEvent.click(view.getByRole('button', { name: 'Mégse' }));
    expect(view.queryByRole('dialog')).toBeNull();
    expect(view.getByRole('link', { name: /Fotós oldal/ })).toBeVisible();
    expect(deleteById).not.toHaveBeenCalled();
  });
  it('deletes only the confirmed project, clears both cache keys and refreshes other lists', async () => {
    const changed = vi.fn();
    window.addEventListener('muhely-projects-changed', changed);

    const view = render(<ProjectLibrary />);
    fireEvent.click(await view.findByRole('button', { name: 'Fotós oldal törlése' }));
    vi.mocked(getAll).mockResolvedValue([]);
    await act(async () => fireEvent.click(view.getByRole('button', { name: 'Végleges törlés' })));
    expect(deleteById).toHaveBeenCalledExactlyOnceWith(database, 'one');
    expect(invalidateChatCache).toHaveBeenCalledWith('one');
    expect(invalidateChatCache).toHaveBeenCalledWith('photo');
    expect(changed).toHaveBeenCalledOnce();
    await waitFor(() => expect(view.queryByRole('link', { name: /Fotós oldal/ })).toBeNull());
    expect(view.getByRole('status')).toHaveTextContent('törölve');
    window.removeEventListener('muhely-projects-changed', changed);
  });
  it('keeps the project visible and allows retry when storage refuses deletion', async () => {
    vi.mocked(deleteById).mockRejectedValue(new Error('Storage failed'));

    const view = render(<ProjectLibrary />);
    fireEvent.click(await view.findByRole('button', { name: 'Fotós oldal törlése' }));
    await act(async () => fireEvent.click(view.getByRole('button', { name: 'Végleges törlés' })));
    expect(view.getByRole('status')).toHaveTextContent('A mentett munka megmaradt');
    expect(view.getByRole('button', { name: 'Végleges törlés' })).toBeEnabled();
    expect(view.getByRole('link', { name: /Fotós oldal/ })).toBeVisible();
    expect(invalidateChatCache).not.toHaveBeenCalled();
  });
});
