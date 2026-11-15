import { spawn } from 'node:child_process';
import { mkdir, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';
import { readJson, writeJson } from './queue.mjs';

const directory = process.env.MUHELY_RENDER_QUEUE;
if (!directory) throw new Error('MUHELY_RENDER_QUEUE is required.');
const renderer = fileURLToPath(new URL('./render-project.mjs', import.meta.url));
const heartbeat = join(directory, 'heartbeat');
const jobPattern = /^[0-9a-f-]{36}$/;
const timeout = 12 * 60_000;
await mkdir(directory, { recursive: true });
await writeFile(heartbeat, '', { flag: 'a' });
const refresh = () => {
  const current = new Date();
  return utimes(heartbeat, current, current);
};
const timer = setInterval(() => {
  void refresh().catch(() => {});
}, 5000);
let active;
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    stopping = true;
    stopChild();
  });
}

function stopChild() {
  if (active?.pid) {
    try {
      process.kill(-active.pid, 'SIGKILL');
    } catch {
      // The render process already exited.
    }
  }
}

async function run(folder, job) {
  const { format, width, height, fps, seconds } = job;
  await writeJson(join(folder, 'status.json'), { ...job, state: 'running', started: Date.now() });
  let detail = '';
  const code = await new Promise((resolve) => {
    active = spawn(
      process.execPath,
      [
        renderer,
        '--input',
        join(folder, 'input'),
        '--output',
        join(folder, 'output.' + format),
        '--width',
        String(width),
        '--height',
        String(height),
        '--fps',
        String(fps),
        '--seconds',
        String(seconds),
        ...(process.env.MUHELY_RENDER_CHROME_CHANNEL ? ['--channel', process.env.MUHELY_RENDER_CHROME_CHANNEL] : []),
        ...(process.env.MUHELY_RENDER_FFMPEG ? ['--ffmpeg', process.env.MUHELY_RENDER_FFMPEG] : []),
      ],
      { detached: true, stdio: ['ignore', 'ignore', 'pipe'] },
    );
    active.stderr.on('data', (data) => {
      detail = (detail + String(data)).slice(-2000);
    });
    const deadline = setTimeout(stopChild, timeout);
    active.on('error', () => resolve(null));
    active.on('close', (code) => {
      clearTimeout(deadline);
      resolve(code);
    });
  });
  active = undefined;
  const error = detail.includes('missing or external render assets')
    ? 'Néhány médiafájl hiányzik a csomagból. A képeket és videókat helyi fájlként add a projekthez.'
    : 'A projektet nem sikerült renderelni. Ellenőrizd az előnézetet, majd próbáld újra.';
  await writeJson(
    join(folder, 'status.json'),
    code === 0 ? { ...job, state: 'ready' } : { ...job, state: 'failed', error },
  );
  await rm(join(folder, 'input'), { recursive: true, force: true });
}

try {
  while (!stopping) {
    await refresh();
    const folders = (await readdir(directory)).filter((id) => jobPattern.test(id));
    for (const id of folders) {
      if (stopping) break;
      const folder = join(directory, id);
      const status = await readJson(join(folder, 'status.json'));
      if (status?.state === 'queued') {
        await run(folder, status);
      } else if (status?.state === 'running' && Date.now() - status.started > timeout) {
        await writeJson(join(folder, 'status.json'), {
          ...status,
          state: 'failed',
          error: 'A renderelés megszakadt. Próbáld újra.',
        });
        await rm(join(folder, 'input'), { recursive: true, force: true });
      } else {
        const info = await stat(folder).catch(() => null);
        if (info && Date.now() - info.mtimeMs > 86_400_000) await rm(folder, { recursive: true, force: true });
      }
    }
    await wait(1000);
  }
} finally {
  clearInterval(timer);
}
