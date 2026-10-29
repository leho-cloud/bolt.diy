import type { WebContainer } from '@webcontainer/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchProject, type ProjectPathEvent } from './watch-project';

afterEach(() => vi.useRealTimers());
describe('public project filesystem watcher', () => {
  it('mirrors restored files, edits and deletions without internal runtime APIs', async () => {
    vi.useFakeTimers();

    let notify: (type: string, path: string) => void = () => undefined;

    const disk = new Map([
      ['main.js', 'first'],
      ['node_modules/ignore.js', 'dependency'],
    ]);

    const close = vi.fn();
    const receive = vi.fn<(events: ProjectPathEvent[]) => void>();

    const runtime = {
      workdir: '/home/project',
      fs: {
        watch: (_path: string, _options: unknown, callback: typeof notify) => {
          notify = callback;
          return { close };
        },
        readdir: async () =>
          [...disk.keys()]
            .filter((name) => !name.includes('/'))
            .map((name) => ({ name, isDirectory: () => false, isFile: () => true })),
        readFile: async (name: string) => new TextEncoder().encode(disk.get(name)),
      },
    } as unknown as WebContainer;

    const watcher = watchProject(runtime, receive);
    await vi.runAllTimersAsync();
    expect(receive.mock.calls[0][0]).toEqual([
      expect.objectContaining({ type: 'add_file', path: '/home/project/main.js' }),
    ]);
    disk.set('main.js', 'second');
    notify('change', 'main.js');
    await vi.runAllTimersAsync();
    expect(receive.mock.calls.at(-1)?.[0][0].type).toBe('change');
    disk.delete('main.js');
    notify('rename', 'main.js');
    await vi.runAllTimersAsync();
    expect(receive.mock.calls.at(-1)?.[0][0].type).toBe('remove_file');

    const calls = receive.mock.calls.length;
    notify('change', 'node_modules/ignore.js');
    await vi.runAllTimersAsync();
    expect(receive.mock.calls).toHaveLength(calls);
    watcher.close();
    expect(close).toHaveBeenCalledOnce();
  });
});
