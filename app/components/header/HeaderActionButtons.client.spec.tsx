// @vitest-environment jsdom


import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { atom } from 'nanostores';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { mediaExportOpen } from '~/lib/runtime/previewExport';
import { workbenchStore } from '~/lib/stores/workbench';

vi.mock('~/components/deploy/DeployButton', () => ({ DeployButton: () => <button>Közzététel</button> }));
vi.mock('~/lib/runtime/previewExport', () => ({ mediaExportOpen: atom(false) }));
vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: { files: atom({}), previews: atom([]) },
}));

afterEach(() => {
  cleanup();
  workbenchStore.files.set({});
  workbenchStore.previews.set([]);
  mediaExportOpen.set(false);
});

describe('Műhely project actions', () => {
  it('offers a direct media export before the preview has started', () => {
    workbenchStore.files.set({
      '/home/project/index.html': { type: 'file', isBinary: false, content: '<h1>Bolt</h1>' },
    });
    render(<HeaderActionButtons chatStarted />);
    fireEvent.click(screen.getByRole('button', { name: 'Kép vagy videó' }));
    expect(mediaExportOpen.get()).toBe(true);
    expect(screen.queryByRole('button', { name: 'Közzététel' })).toBeNull();
  });

  it('has a Hungarian publish action and no upstream bug-report button when a preview is running', () => {
    workbenchStore.previews.set([{ port: 5173, baseUrl: 'https://example.test', ready: true }]);
    render(<HeaderActionButtons chatStarted />);
    expect(screen.getByRole('button', { name: 'Közzététel' })).toBeDefined();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
