// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { atom } from 'nanostores';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { chatId, description } from '~/lib/persistence/useChatHistory';
import { mediaExportOpen } from '~/lib/runtime/previewExport';
import { workbenchStore } from '~/lib/stores/workbench';

vi.mock('~/lib/persistence/useChatHistory', () => ({ chatId: atom('test-project'), description: atom('') }));
vi.mock('~/components/deploy/DeployButton', () => ({ DeployButton: () => <button>Közzététel</button> }));
vi.mock('~/lib/runtime/previewExport', () => ({ mediaExportOpen: atom(false) }));
vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: { files: atom({}), previews: atom([]) },
}));

afterEach(() => {
  cleanup();
  description.set('');
  chatId.set('test-project');
  localStorage.clear();
  workbenchStore.files.set({});
  workbenchStore.previews.set([]);
  mediaExportOpen.set(false);
});

describe('Műhely project actions', () => {
  it('offers media export for a creative and keeps publishing separate', () => {
    description.set('Készíts egy animált LED-üdvözlőt');
    workbenchStore.files.set({
      '/home/project/index.html': { type: 'file', isBinary: false, content: '<h1>Bolt</h1>' },
    });
    render(<HeaderActionButtons chatStarted />);
    fireEvent.click(screen.getByRole('button', { name: 'Videó mentése' }));
    expect(mediaExportOpen.get()).toBe(true);
    expect(screen.queryByRole('button', { name: 'Közzététel' })).toBeNull();
  });

  it('shows only domain publication for a website and can switch output explicitly', () => {
    chatId.set('website-project');
    description.set('Főnix Gold weboldal újraépítése');
    workbenchStore.files.set({
      '/home/project/index.html': { type: 'file', isBinary: false, content: '<h1>Főnix</h1>' },
    });
    render(<HeaderActionButtons chatStarted />);
    expect(screen.getByRole('button', { name: 'Közzététel' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Videó mentése' })).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Projekt kimenete' }), { target: { value: 'image' } });
    expect(screen.getByRole('button', { name: 'Kép mentése' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Közzététel' })).toBeNull();
    expect(localStorage.getItem('muhely-output:website-project')).toBe('image');
  });

  it('keeps the publish action unavailable without project files', () => {
    workbenchStore.previews.set([{ port: 5173, baseUrl: 'https://example.test', ready: true }]);
    render(<HeaderActionButtons chatStarted />);
    expect(screen.queryByRole('button', { name: 'Közzététel' })).toBeNull();
  });
});
