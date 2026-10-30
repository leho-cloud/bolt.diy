import { atom } from 'nanostores';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { spawn, writeToBoltTerminal, toggleTerminal, readFile, saveFileContent, createFile } = vi.hoisted(() => ({
  spawn: vi.fn(),
  writeToBoltTerminal: vi.fn(),
  toggleTerminal: vi.fn(),
  readFile: vi.fn(),
  saveFileContent: vi.fn(),
  createFile: vi.fn(),
}));

const serializeMutation = vi.hoisted(() => {
  let tail: Promise<unknown> = Promise.resolve();

  return (operation: () => Promise<unknown>) => {
    const result = tail.then(operation);
    tail = result.catch(() => undefined);

    return result;
  };
});

vi.mock('~/lib/webcontainer', () => ({
  webcontainer: Promise.resolve({ spawn, workdir: '/home/project', fs: { readFile } }),
}));
vi.mock('~/lib/persistence/useChatHistory', () => ({ chatId: atom('command-test') }));
vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    projectGeneration: atom(1),
    previews: atom([]),
    files: atom({}),
    unsavedFiles: atom(new Set<string>()),
    saveFileContent,
    createFile,
    isFolderLocked: () => ({ isLocked: false }),
    isFileLocked: () => ({ locked: false }),
    queueProjectMutation: serializeMutation,
    waitForExecutionQueue: async () => undefined,
    toggleTerminal,
    writeToBoltTerminal,
  },
}));
vi.mock('./ripgrepClient', () => ({ searchWithRipgrep: vi.fn() }));

import { createProjectMcpBridge } from './projectMcp';
import { workbenchStore } from '~/lib/stores/workbench';

let bridge: Awaited<ReturnType<typeof createProjectMcpBridge>> | undefined;

afterEach(async () => {
  await bridge?.close();
  bridge = undefined;
  workbenchStore.projectGeneration.set(workbenchStore.projectGeneration.get() + 1);
  workbenchStore.previews.set([]);
  workbenchStore.files.set({});
  workbenchStore.unsavedFiles.set(new Set());
});

describe('multiple edits to one project file', () => {
  const file = 'src/theme.js';
  const absolute = '/home/project/src/theme.js';
  const initial = 'export const color = "blue";\nexport const size = 12;\n';
  const colors = { oldText: '"blue"', newText: '"green"' };
  const sizes = { oldText: 'size = 12', newText: 'size = 14' };

  let text = initial;

  const revisionOf = (result: unknown) =>
    (result as { structuredContent: { revision: string } }).structuredContent.revision;

  const setText = (value: string) => {
    text = value;
    workbenchStore.files.set({ [absolute]: { type: 'file', content: text, isBinary: false } });
  };
  const prepare = async () => {
    setText(initial);
    readFile.mockImplementation(async () => new TextEncoder().encode(text));
    saveFileContent.mockReset().mockImplementation(async (_path, value) => setText(value));
    bridge = await createProjectMcpBridge();

    return (await bridge.callTool('project_read_file', { path: file })).structuredContent as { revision: string };
  };
  afterEach(() => {
    readFile.mockReset();
    saveFileContent.mockReset();
  });

  it('applies several exact changes in one save and returns the resulting revision', async () => {
    const { revision } = await prepare();

    const result = await bridge!.callTool('project_patch_file', {
      path: file,
      expectedRevision: revision,
      edits: [colors, sizes],
    });
    expect(result.isError).not.toBe(true);
    expect(text).toBe(initial.replace('blue', 'green').replace('12', '14'));
    expect(saveFileContent).toHaveBeenCalledOnce();

    const reread = await bridge!.callTool('project_read_file', { path: file });
    expect(result.structuredContent).toMatchObject({ appliedEdits: 2, revision: revisionOf(reread) });
  });

  it('validates the final source, allowing intermediate steps that are not valid on their own', async () => {
    await prepare();
    setText('export const first = 1;\nexport const second = 2;\n');

    const read = await bridge!.callTool('project_read_file', { path: file });

    const result = await bridge!.callTool('project_patch_file', {
      path: file,
      expectedRevision: revisionOf(read),
      edits: [
        { oldText: 'first = 1', newText: 'second = 1' },
        { oldText: 'second = 2', newText: 'first = 2' },
      ],
    });
    expect(result.isError).not.toBe(true);
    expect(text).toBe('export const second = 1;\nexport const first = 2;\n');
    expect(saveFileContent).toHaveBeenCalledOnce();
  });

  it.each([
    { oldText: 'missing', newText: 'other' },
    { oldText: 'export const', newText: 'const' },
    { oldText: 'size = 12', newText: 'size = (' },
  ])('does not save any part of a batch when its final edit is invalid: $oldText', async (badEdit) => {
    await prepare();

    const result = await bridge!.callTool('project_patch_file', { path: file, edits: [colors, badEdit] });
    expect(result.isError).toBe(true);
    expect(text).toBe(initial);
    expect(saveFileContent).not.toHaveBeenCalled();
  });

  it('continues sequential edits without another model read and accepts the latest returned explicit revision', async () => {
    await prepare();

    const first = await bridge!.callTool('project_patch_file', { path: file, ...colors });
    const second = await bridge!.callTool('project_patch_file', { path: file, ...sizes });

    const third = await bridge!.callTool('project_patch_file', {
      path: file,
      expectedRevision: revisionOf(second),
      oldText: '"green"',
      newText: '"red"',
    });
    expect([first, second, third].every((result) => !result.isError)).toBe(true);
    expect(text).toBe(initial.replace('blue', 'red').replace('12', '14'));
  });

  it('serializes parallel implicit-revision patches without losing either change', async () => {
    await prepare();

    const results = await Promise.all([
      bridge!.callTool('project_patch_file', { path: file, ...colors }),
      bridge!.callTool('project_patch_file', { path: file, ...sizes }),
    ]);
    expect(results.every((result) => !result.isError)).toBe(true);
    expect(text).toBe(initial.replace('blue', 'green').replace('12', '14'));
  });

  it('still rejects an explicitly stale revision instead of silently rebasing it', async () => {
    const { revision } = await prepare();

    const results = await Promise.all([
      bridge!.callTool('project_patch_file', { path: file, expectedRevision: revision, ...colors }),
      bridge!.callTool('project_patch_file', { path: file, expectedRevision: revision, ...sizes }),
    ]);
    expect(results[0].isError).not.toBe(true);
    expect(results[1].isError).toBe(true);
    expect(text).toBe(initial.replace('blue', 'green'));
  });

  it('refuses a manual change between model edits and permits continuation only after rereading', async () => {
    await prepare();
    await bridge!.callTool('project_patch_file', { path: file, ...colors });
    setText(text + '// Manual note\n');

    const refused = await bridge!.callTool('project_patch_file', { path: file, ...sizes });
    expect(refused.isError).toBe(true);
    expect(text).toContain('// Manual note');
    expect(text).toContain('size = 12');
    await bridge!.callTool('project_read_file', { path: file });

    const accepted = await bridge!.callTool('project_patch_file', { path: file, ...sizes });
    expect(accepted.isError).not.toBe(true);
    expect(text).toContain('// Manual note');
  });

  it('returns and remembers a successful replacement revision for a subsequent targeted patch', async () => {
    await prepare();

    const replaced = await bridge!.callTool('project_write_file', {
      path: file,
      content: initial.replace('blue', 'green'),
      replacementReason: 'Replace the theme structure.',
    });
    expect(revisionOf(replaced)).toMatch(/^[a-f0-9]{64}$/);

    const patched = await bridge!.callTool('project_patch_file', { path: file, ...sizes });
    expect(patched.isError).not.toBe(true);
    expect(text).toBe(initial.replace('blue', 'green').replace('12', '14'));
  });

  it('protects unsaved manual edits from both patches and replacements', async () => {
    await prepare();
    workbenchStore.unsavedFiles.set(new Set([absolute]));

    const patched = await bridge!.callTool('project_patch_file', { path: file, ...colors });

    const replaced = await bridge!.callTool('project_write_file', {
      path: file,
      content: 'export const other = true;',
      replacementReason: 'New theme.',
    });
    expect(patched.isError).toBe(true);
    expect(replaced.isError).toBe(true);
    expect(saveFileContent).not.toHaveBeenCalled();
  });

  it('remembers the revision of a newly created file without requiring a redundant read', async () => {
    await prepare();
    workbenchStore.files.set({});
    readFile.mockRejectedValueOnce({ code: 'ENOENT' });
    createFile.mockReset().mockImplementation(async (_path, value) => setText(value));

    const created = await bridge!.callTool('project_write_file', { path: file, content: initial, overwrite: false });
    expect(created.structuredContent).toMatchObject({ created: true });
    expect(revisionOf(created)).toMatch(/^[a-f0-9]{64}$/);

    const patched = await bridge!.callTool('project_patch_file', { path: file, ...colors });
    expect(patched.isError).not.toBe(true);
    expect(text).toBe(initial.replace('blue', 'green'));
    createFile.mockReset();
  });

  it('keeps a no-op revision usable without writing or discarding its concurrency protection', async () => {
    const { revision } = await prepare();
    const noop = await bridge!.callTool('project_patch_file', { path: file, oldText: '"blue"', newText: '"blue"' });
    expect(noop.structuredContent).toMatchObject({ changed: false, revision });
    expect(saveFileContent).not.toHaveBeenCalled();

    const next = await bridge!.callTool('project_patch_file', { path: file, expectedRevision: revision, ...colors });
    expect(next.isError).not.toBe(true);
  });

  it('rechecks the saved file before committing, preserving a change that arrived during validation', async () => {
    await prepare();
    readFile
      .mockImplementationOnce(async () => new TextEncoder().encode(text))
      .mockImplementationOnce(async () => {
        setText(text + '// Arrived during validation\n');
        return new TextEncoder().encode(text);
      });

    const result = await bridge!.callTool('project_patch_file', { path: file, ...colors });
    expect(result.isError).toBe(true);
    expect(text).toBe(initial + '// Arrived during validation\n');
    expect(saveFileContent).not.toHaveBeenCalled();
  });

  it.each([{ edits: [] }, { edits: [colors], ...sizes }, { oldText: 'blue' }])(
    'rejects malformed edit requests without saving',
    async (args) => {
      await prepare();

      const result = await bridge!.callTool('project_patch_file', { path: file, ...args });
      expect(result.isError).toBe(true);
      expect(saveFileContent).not.toHaveBeenCalled();
    },
  );
});

function processWithOutput(output: string, exitCode: number | Promise<number>) {
  return {
    output: new ReadableStream<string>({
      start(controller) {
        controller.enqueue(output);
        controller.close();
      },
    }),
    exit: Promise.resolve(exitCode),
    kill: vi.fn(),
  };
}

describe('project command tools', () => {
  it('reuses the same running dev command instead of spawning another preview server', async () => {
    let finish!: (code: number) => void;

    const process = processWithOutput(
      'server ready\n',
      new Promise<number>((resolve) => {
        finish = resolve;
      }),
    );
    process.kill.mockImplementation(() => finish(143));
    spawn.mockClear();
    spawn.mockResolvedValueOnce(process);
    bridge = await createProjectMcpBridge();

    const first = await bridge.callTool('project_run_command', { command: 'npm run dev', purpose: 'run' });

    const second = await bridge.callTool('project_run_command', {
      command: 'cd /home/project && npm run dev',
      purpose: 'run',
    });
    expect(spawn).toHaveBeenCalledOnce();
    expect(second.structuredContent).toMatchObject({
      processId: (first.structuredContent as { processId: string }).processId,
      status: 'running',
      reused: true,
    });
  });
  it('executes in the default project directory and forwards real output to Bolt Terminal', async () => {
    spawn.mockResolvedValueOnce(processWithOutput('command-marker\n', 0));
    bridge = await createProjectMcpBridge();

    const result = await bridge.callTool('project_run_command', { command: 'echo command-marker' });

    expect(spawn).toHaveBeenCalledWith('/bin/jsh', ['-c', 'echo command-marker']);
    expect(toggleTerminal).toHaveBeenCalledWith(true);
    expect(writeToBoltTerminal).toHaveBeenCalledWith('command-marker\n');
    expect(result.structuredContent).toMatchObject({
      status: 'exited',
      exitCode: 0,
      output: 'command-marker\n',
      previewReady: false,
    });
    expect(result.isError).not.toBe(true);
  });

  it('preserves WebContainer plain-object spawn errors instead of reporting success', async () => {
    spawn.mockRejectedValueOnce({ code: 'ENOENT', message: 'no such file or directory' });
    bridge = await createProjectMcpBridge();

    const result = await bridge.callTool('project_run_command', { command: 'npm install' });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'no such file or directory' }]);
    expect(writeToBoltTerminal).toHaveBeenCalledWith(
      expect.stringContaining('Command failed: no such file or directory'),
    );
  });

  it('returns failed exit status and output through both launch and output tools', async () => {
    spawn.mockResolvedValueOnce(processWithOutput('npm error missing script\n', 1));
    bridge = await createProjectMcpBridge();

    const result = await bridge.callTool('project_run_command', { command: 'npm run dev' });

    const output = await bridge.callTool('project_get_process_output', {
      processId: (result.structuredContent as Record<string, unknown>).processId,
    });

    for (const response of [result, output]) {
      expect(response.isError).toBe(true);
      expect(response.structuredContent).toMatchObject({
        status: 'exited',
        exitCode: 1,
        output: 'npm error missing script\n',
        error: 'Command exited with code 1.',
      });
    }
  });

  it('retains a long-running server and its output without pretending it finished', async () => {
    let finish!: (code: number) => void;

    const process = processWithOutput(
      'server-listening\n',
      new Promise<number>((resolve) => {
        finish = resolve;
      }),
    );
    process.kill.mockImplementation(() => finish(143));
    spawn.mockResolvedValueOnce(process);
    bridge = await createProjectMcpBridge();

    const result = await bridge.callTool('project_run_command', { command: 'npm run dev' });

    expect(result.structuredContent).toMatchObject({ status: 'running', output: 'server-listening\n' });
    expect((result.structuredContent as Record<string, unknown>).exitCode).toBeUndefined();
    expect(process.kill).not.toHaveBeenCalled();
    finish(1);

    const output = await bridge.callTool('project_get_process_output', {
      processId: (result.structuredContent as Record<string, unknown>).processId,
    });
    expect(output.isError).toBe(true);
    expect(output.structuredContent).toMatchObject({ status: 'exited', exitCode: 1 });
  });

  it('reports a live preview as tool evidence while keeping the dev server running', async () => {
    let finish!: (code: number) => void;

    const process = processWithOutput(
      'server-listening\n',
      new Promise<number>((resolve) => {
        finish = resolve;
      }),
    );
    process.kill.mockImplementation(() => finish(143));
    spawn.mockResolvedValueOnce(process);
    workbenchStore.previews.set([{ port: 5173, ready: true, baseUrl: 'https://preview.example' }]);
    bridge = await createProjectMcpBridge();

    const result = await bridge.callTool('project_run_command', { command: 'npm run dev' });

    expect(result.structuredContent).toMatchObject({ status: 'running', previewReady: true });
    expect(process.kill).not.toHaveBeenCalled();
  });

  it('preserves verification purpose and the exact command through output polling', async () => {
    spawn.mockResolvedValueOnce(processWithOutput('checks passed\n', 0));
    bridge = await createProjectMcpBridge();

    const launched = await bridge.callTool('project_run_command', { command: 'npm run typecheck', purpose: 'test' });

    const polled = await bridge.callTool('project_get_process_output', {
      processId: (launched.structuredContent as Record<string, unknown>).processId,
    });

    for (const result of [launched, polled]) {
      expect(result.structuredContent).toMatchObject({
        command: 'npm run typecheck',
        purpose: 'test',
        exitCode: 0,
        status: 'exited',
      });
    }
  });
});

describe('project paths', () => {
  it('lists the project root and accepts absolute paths inside the project', async () => {
    workbenchStore.files.set({
      '/home/project/src/App.tsx': { type: 'file', content: 'page', isBinary: false },
      '/home/project/package.json': { type: 'file', content: '{}', isBinary: false },
    });
    readFile.mockResolvedValue(new TextEncoder().encode('page'));
    bridge = await createProjectMcpBridge();

    for (const prefix of ['', '.', '/home/project', '/home/project/']) {
      const result = await bridge.callTool('project_list_paths', { path: prefix });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ entries: [{ path: 'src/App.tsx' }, { path: 'package.json' }] });
    }

    const listing = await bridge.callTool('project_list_paths', { path: '/home/project/src' });
    expect(listing.structuredContent).toMatchObject({ entries: [{ path: 'src/App.tsx' }] });

    const read = await bridge.callTool('project_read_file', { path: '/home/project/src/App.tsx' });
    expect(read.isError).not.toBe(true);
    expect(read.structuredContent).toMatchObject({ path: 'src/App.tsx', content: 'page' });
    expect(readFile).toHaveBeenLastCalledWith('src/App.tsx');
  });

  it('rejects traversal, sibling roots, and deleting the project root', async () => {
    bridge = await createProjectMcpBridge();

    for (const outside of ['../private', '/home/project/../private', '/home/project-other/src', '/etc/passwd']) {
      const result = await bridge.callTool('project_list_paths', { path: outside });
      expect(result.isError).toBe(true);
    }

    for (const root of ['.', '/home/project']) {
      const result = await bridge.callTool('project_delete_path', { path: root, recursive: true });
      expect(result.isError).toBe(true);
    }
  });
});

describe('targeted project file edits', () => {
  const original = 'const styles = {\nbutton: blue\n};\n';

  const prepare = async () => {
    workbenchStore.files.set({ '/home/project/src/App.tsx': { type: 'file', content: original, isBinary: false } });
    readFile.mockResolvedValue(new TextEncoder().encode(original));
    saveFileContent.mockClear();
    createFile.mockClear();
    bridge = await createProjectMcpBridge();
  };

  it('rejects unnecessary full replacements of existing files without a reason', async () => {
    await prepare();

    const result = await bridge!.callTool('project_write_file', { path: 'src/App.tsx', content: 'rewritten app' });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: expect.stringContaining('project_patch_file') }]);
    expect(saveFileContent).not.toHaveBeenCalled();
  });

  it('patches only the exact target and preserves surrounding content', async () => {
    await prepare();

    const result = await bridge!.callTool('project_patch_file', {
      path: 'src/App.tsx',
      expectedContent: original,
      oldText: 'button: blue',
      newText: 'button: green',
    });
    expect(result.structuredContent).toMatchObject({ patched: true, changed: true });
    expect(saveFileContent).toHaveBeenCalledExactlyOnceWith(
      '/home/project/src/App.tsx',
      'const styles = {\nbutton: green\n};\n',
    );
    expect(createFile).not.toHaveBeenCalled();
  });

  it('refuses stale or ambiguous patches', async () => {
    await prepare();

    const stale = await bridge!.callTool('project_patch_file', {
      path: 'src/App.tsx',
      expectedContent: 'stale',
      oldText: 'button: blue',
      newText: 'button: green',
    });
    expect(stale.isError).toBe(true);
    readFile.mockResolvedValueOnce(new TextEncoder().encode('same same'));

    const ambiguous = await bridge!.callTool('project_patch_file', {
      path: 'src/App.tsx',
      expectedContent: 'same same',
      oldText: 'same',
      newText: 'other',
    });
    expect(ambiguous.isError).toBe(true);
    expect(saveFileContent).not.toHaveBeenCalled();
  });

  it('permits justified full replacements and reports no-op writes accurately', async () => {
    await prepare();

    const unchanged = await bridge!.callTool('project_write_file', { path: 'src/App.tsx', content: original });
    expect(unchanged.structuredContent).toMatchObject({ changed: false });
    expect(saveFileContent).not.toHaveBeenCalled();

    const replaced = await bridge!.callTool('project_write_file', {
      path: 'src/App.tsx',
      content: 'export const layout = "new";\n',
      replacementReason: 'The user requested replacing this entire starter page.',
    });
    expect(replaced.structuredContent).toMatchObject({ written: true, created: false, changed: true });
    expect(saveFileContent).toHaveBeenCalledExactlyOnceWith(
      '/home/project/src/App.tsx',
      'export const layout = "new";\n',
    );
  });

  it('patches with a read revision without reproducing the entire expected file', async () => {
    await prepare();

    const read = await bridge!.callTool('project_read_file', { path: 'src/App.tsx' });
    const revision = (read.structuredContent as { revision: string }).revision;
    expect(revision).toMatch(/^[a-f0-9]{64}$/);

    const result = await bridge!.callTool('project_patch_file', {
      path: 'src/App.tsx',
      expectedRevision: revision,
      oldText: 'button: blue',
      newText: 'button: green',
    });
    expect(result.isError).not.toBe(true);
    expect(saveFileContent).toHaveBeenCalledExactlyOnceWith(
      '/home/project/src/App.tsx',
      'const styles = {\nbutton: green\n};\n',
    );
  });

  it('uses the latest read revision when a patch omits expectedRevision', async () => {
    await prepare();

    await bridge!.callTool('project_read_file', { path: 'src/App.tsx' });

    const result = await bridge!.callTool('project_patch_file', {
      path: 'src/App.tsx',
      oldText: 'button: blue',
      newText: 'button: green',
    });

    expect(result.isError).not.toBe(true);
    expect(saveFileContent).toHaveBeenCalledExactlyOnceWith(
      '/home/project/src/App.tsx',
      'const styles = {\nbutton: green\n};\n',
    );
  });

  it('rejects a stale revision and a patch without any concurrency check', async () => {
    await prepare();

    const read = await bridge!.callTool('project_read_file', { path: 'src/App.tsx' });
    readFile.mockResolvedValue(new TextEncoder().encode(`${original}// user edit\n`));

    const stale = await bridge!.callTool('project_patch_file', {
      path: 'src/App.tsx',
      expectedRevision: (read.structuredContent as { revision: string }).revision,
      oldText: 'button: blue',
      newText: 'button: green',
    });
    expect(stale.isError).toBe(true);
    expect(stale.content).toEqual([{ type: 'text', text: expect.stringContaining('Read the file again') }]);

    const unchecked = await bridge!.callTool('project_patch_file', {
      path: 'src/App.tsx',
      oldText: 'button: blue',
      newText: 'button: green',
    });
    expect(unchecked.isError).toBe(true);
    expect(saveFileContent).not.toHaveBeenCalled();
  });

  it('rejects invalid patches and flattened source replacements before saving', async () => {
    await prepare();

    const patch = await bridge!.callTool('project_patch_file', {
      path: 'src/App.tsx',
      expectedContent: original,
      oldText: 'button: blue',
      newText: 'button: <',
    });
    const replacement = await bridge!.callTool('project_write_file', {
      path: 'src/App.tsx',
      replacementReason: 'Replace the starter with the requested page.',
      content:
        "import { ArrowRight } from 'lucide-react' function App() { return <main>Hello</main>; } export default App;",
    });

    for (const result of [patch, replacement]) {
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{ type: 'text', text: expect.stringContaining('File was not saved') }]);
    }
    expect(saveFileContent).not.toHaveBeenCalled();
    expect(workbenchStore.files.get()['/home/project/src/App.tsx']).toMatchObject({ content: original });
  });

  it('rejects malformed new source files before creating them', async () => {
    await prepare();
    readFile.mockRejectedValueOnce({ code: 'ENOENT' });

    const result = await bridge!.callTool('project_write_file', {
      path: 'src/Broken.tsx',
      content: 'export const Broken = () => <main>',
      overwrite: false,
    });
    expect(result.isError).toBe(true);
    expect(createFile).not.toHaveBeenCalled();
    expect(saveFileContent).not.toHaveBeenCalled();
  });
});
