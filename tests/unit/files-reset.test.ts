import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebContainer } from '@webcontainer/api';
import { FilesStore } from '~/lib/stores/files';

vi.mock('~/lib/persistence/lockedFiles', () => ({
  getLockedFilesForChat: () => [],
  getLockedFoldersForChat: () => [],
  getLockedItemsForChat: () => ({ files: [], folders: [] }),
  clearCache: vi.fn(),
  migrateLegacyLocks: vi.fn(),
}));
vi.mock('~/utils/fileLocks', () => ({ getCurrentChatId: () => undefined }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('reset while runtime boots', () => {
  it('opens an empty conversation without waiting for a stalled runtime', async () => {
    const store = new FilesStore(new Promise<WebContainer>(() => {}));
    await expect(store.reset()).resolves.toBeUndefined();
    expect(store.files.get()).toEqual({});
  });

  it('still removes the outgoing project after runtime boot', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    const rm = vi.fn().mockResolvedValue(undefined);
    const runtime = {
      fs: { readdir: vi.fn().mockResolvedValue(['src', 'package.json']), rm },
      internal: { watchPaths: vi.fn() },
    } as unknown as WebContainer;
    const store = new FilesStore(Promise.resolve(runtime));
    await Promise.resolve();
    await store.reset();
    expect(rm.mock.calls).toEqual([
      ['src', { recursive: true }],
      ['package.json', { recursive: true }],
    ]);
  });
});
