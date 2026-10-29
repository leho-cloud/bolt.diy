import type { WebContainer } from '@webcontainer/api';

export type ProjectPathEvent = {
  type: 'add_dir' | 'remove_dir' | 'add_file' | 'remove_file' | 'change' | 'update_directory';
  path: string;
  buffer?: Uint8Array;
};
type Entry = { kind: 'file' | 'dir'; data?: Uint8Array };

const ignored = new Set(['node_modules', '.git', '.vite', 'dist', 'build', '.next', 'coverage']);

const included = (name: string) =>
  !name.split('/').some((segment) => ignored.has(segment)) && !/(?:^|\/)package-lock\.json$/.test(name);

/** Synchronize editor files using the supported public filesystem watcher. */
export function watchProject(container: WebContainer, receive: (events: ProjectPathEvent[]) => void) {
  let previous = new Map<string, Entry>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let scanning = false;
  let dirty = false;
  let closed = false;

  const scan = async () => {
    if (closed) {
      return;
    }

    if (scanning) {
      dirty = true;
      return;
    }

    scanning = true;

    const next = new Map<string, Entry>();

    const walk = async (directory: string) => {
      const entries = await container.fs.readdir(directory || '.', { withFileTypes: true });

      for (const entry of entries) {
        const relative = directory ? `${directory}/${entry.name}` : entry.name;

        if (!included(relative)) {
          continue;
        }

        try {
          if (entry.isDirectory()) {
            next.set(relative, { kind: 'dir' });
            await walk(relative);
          } else if (entry.isFile()) {
            next.set(relative, { kind: 'file', data: await container.fs.readFile(relative) });
          }
        } catch {
          dirty = true;
        }
      }
    };

    try {
      await walk('');

      if (closed) {
        return;
      }

      const events: ProjectPathEvent[] = [];

      for (const [path, old] of previous) {
        if (!next.has(path) || next.get(path)?.kind !== old.kind) {
          events.push({
            type: old.kind === 'dir' ? 'remove_dir' : 'remove_file',
            path: `${container.workdir}/${path}`,
          });
        }
      }

      for (const [path, entry] of next) {
        const old = previous.get(path);

        if (!old || old.kind !== entry.kind) {
          events.push({
            type: entry.kind === 'dir' ? 'add_dir' : 'add_file',
            path: `${container.workdir}/${path}`,
            buffer: entry.data,
          });
        } else if (
          entry.data &&
          (entry.data.length !== old.data?.length || entry.data.some((byte, i) => byte !== old.data?.[i]))
        ) {
          events.push({ type: 'change', path: `${container.workdir}/${path}`, buffer: entry.data });
        }
      }
      previous = next;

      if (events.length) {
        receive(events);
      }
    } catch {
      // A failed read must not erase the last known good editor filesystem.
    } finally {
      scanning = false;

      if (dirty && !closed) {
        dirty = false;
        schedule();
      }
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void scan();
    }, 100);
  };
  const watcher = container.fs.watch('.', { recursive: true }, (_event, filename) => {
    if (typeof filename !== 'string' || included(filename)) {
      dirty = scanning;
      schedule();
    }
  });
  void scan();

  return {
    close: () => {
      closed = true;
      clearTimeout(timer);
      watcher.close();
    },
  };
}
