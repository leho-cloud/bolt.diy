import { describe, expect, it, vi } from 'vitest';
import { ensureProjectDependencies } from './projectDependencies';

const manifest = JSON.stringify({
  scripts: { dev: 'vite' },
  dependencies: { react: '^18.3.1' },
  devDependencies: { typescript: '^5.5.3' },
});
const process = (code: number) => ({
  output: new ReadableStream<string>({
    start(c) {
      c.enqueue('install output\n');
      c.close();
    },
  }),
  exit: Promise.resolve(code),
  kill: vi.fn(),
});

describe('project dependency preparation', () => {
  it('installs declared runtime and development packages before running a fresh project', async () => {
    const runtime = {
      fs: { readdir: vi.fn().mockRejectedValue({ code: 'ENOENT' }) },
      spawn: vi.fn().mockResolvedValue(process(0)),
    };

    const write = vi.fn();
    await ensureProjectDependencies(runtime, 'npm run dev', manifest, write);
    expect(runtime.spawn).toHaveBeenCalledWith('/bin/jsh', ['-c', 'npm install --include=dev --no-audit --no-fund'], {
      env: { CI: 'true', npm_config_yes: 'false' },
    });
    expect(write).toHaveBeenCalledWith('install output\n');
  });
  it('reuses installed packages and does not start another install for tests', async () => {
    const runtime = { fs: { readdir: vi.fn().mockResolvedValue(['.bin', 'typescript', 'react']) }, spawn: vi.fn() };
    await ensureProjectDependencies(runtime, 'npx tsc --noEmit', manifest, vi.fn());
    expect(runtime.spawn).not.toHaveBeenCalled();
  });
  it('never reports a failed installation as an executable project', async () => {
    const runtime = { fs: { readdir: vi.fn().mockResolvedValue([]) }, spawn: vi.fn().mockResolvedValue(process(1)) };
    await expect(ensureProjectDependencies(runtime, 'npm run build', manifest, vi.fn())).rejects.toThrow(
      'telepítése nem sikerült',
    );
  });
  it('does not turn non-Node commands or an explicit installation into another npm install', async () => {
    const runtime = { fs: { readdir: vi.fn() }, spawn: vi.fn() };

    for (const command of ['npm install', 'node server.js', 'python app.py', 'cat package.json']) {
      await ensureProjectDependencies(runtime, command, manifest, vi.fn());
    }
    expect(runtime.fs.readdir).not.toHaveBeenCalled();
    expect(runtime.spawn).not.toHaveBeenCalled();
  });
  it('does not install after cancellation', async () => {
    const runtime = { fs: { readdir: vi.fn().mockResolvedValue([]) }, spawn: vi.fn() };
    await expect(
      ensureProjectDependencies(runtime, 'npm run dev', manifest, vi.fn(), AbortSignal.abort()),
    ).rejects.toThrow();
    expect(runtime.spawn).not.toHaveBeenCalled();
  });
});
