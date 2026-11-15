import { atom } from 'nanostores';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMediaJob } from './previewExport';

const { spawn, readFile, readdir, rm } = vi.hoisted(() => ({
  spawn: vi.fn(),
  readFile: vi.fn(),
  readdir: vi.fn(),
  rm: vi.fn(),
}));

vi.mock('~/lib/webcontainer', () => ({
  webcontainer: Promise.resolve({ workdir: '/home/project', spawn, fs: { readFile, readdir, rm } }),
}));

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    projectGeneration: atom(1),
    queueProjectMutation: (run: () => Promise<unknown>) => run(),
    saveAllFiles: vi.fn(),
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('Vite media export', () => {
  it('builds, reads, and cleans up the same WebContainer-relative folder', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ available: true }))
      .mockResolvedValueOnce(Response.json({ id: 'rendered' }));
    vi.stubGlobal('fetch', fetchMock);
    readFile.mockResolvedValueOnce(
      JSON.stringify({ scripts: { build: 'vite build' }, devDependencies: { vite: '^7' } }),
    );
    readFile.mockResolvedValueOnce(new TextEncoder().encode('<!doctype html><h1>Totem</h1>'));
    spawn.mockResolvedValue({ output: new ReadableStream({ start: (controller) => controller.close() }), exit: 0 });
    readdir.mockResolvedValue([{ name: 'index.html', isDirectory: () => false, isFile: () => true }]);

    await expect(
      createMediaJob({ format: 'mp4', width: 768, height: 256, seconds: 8 }, new AbortController().signal),
    ).resolves.toEqual({ id: 'rendered' });

    const output = spawn.mock.calls[0][1].at(-1);
    expect(output).toMatch(/^node_modules\/\.cache\/muhely-render-[0-9a-f-]+$/);
    expect(readdir).toHaveBeenCalledWith(output, { withFileTypes: true });
    expect(readFile).toHaveBeenLastCalledWith(output + '/index.html');
    expect(rm).toHaveBeenCalledWith(output, { recursive: true, force: true });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      format: 'mp4',
      width: 768,
      height: 256,
      seconds: 8,
      files: [{ path: 'index.html' }],
    });
  });
});
