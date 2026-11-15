import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import test from 'node:test';
import { createRenderQueue, writeJson } from './queue.mjs';

const owner = { id: 'owner' };
const guest = { id: 'guest' };
const page = `<!doctype html><style>body{background:#513456;color:white;font:36px sans-serif}</style><main>Totem</main>
<script>let i=0;setInterval(()=>document.querySelector('main').textContent='Képkocka '+(++i),120);</script>`;
const request = (search = '', upload) =>
  new Request(
    'https://builder.tzsvthosting.com/api/media-render' + search,
    upload
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(upload),
        }
      : {},
  );
const payload = (format, path = 'index.html') => ({
  format,
  width: 769,
  height: 257,
  seconds: 1,
  files: [{ path, base64: Buffer.from(page).toString('base64') }],
});

test('exposes download only to the job owner and rejects unsafe or invalid packages', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'bolt-media-test-'));
  const queue = join(root, 'queue');
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(queue);
  const handle = createRenderQueue(queue, join(root, 'private'));

  assert.equal((await handle(request(), owner)).status, 503);
  await writeFile(join(queue, 'heartbeat'), '');
  assert.equal((await handle(request(), owner)).status, 200);
  assert.equal((await handle(request('', payload('png', '../index.html')), owner)).status, 400);
  assert.equal((await handle(request('', { ...payload('mp4'), width: 4097 }), owner)).status, 400);
  const created = await handle(request('', payload('png')), owner);
  assert.equal(created.status, 202);

  const { id } = await created.json();
  assert.equal((await handle(request('?id=' + id), guest)).status, 404);
  assert.equal((await handle(request('?id=' + id + '&download=1'), owner)).status, 409);
  assert.equal((await handle(request('', payload('png')), owner)).status, 409);
  assert.equal(await readFile(join(queue, id, 'input', 'index.html'), 'utf8'), page);
  await writeFile(join(queue, id, 'output.png'), 'fixture');
  await writeJson(join(queue, id, 'status.json'), { state: 'ready', format: 'png', width: 769, height: 257 });

  const output = await handle(request('?id=' + id + '&download=1'), owner);
  assert.equal(output.headers.get('content-disposition'), 'attachment; filename="muhely-769x257.png"');
  assert.equal(await output.text(), 'fixture');
});

test('preserves the selected MP4 frame rate and the legacy default', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'bolt-media-fps-test-'));
  const queue = join(root, 'queue');
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(queue);
  await writeFile(join(queue, 'heartbeat'), '');
  const handle = createRenderQueue(queue, join(root, 'private'));

  const invalid = await handle(request('', { ...payload('mp4'), fps: 59 }), { id: 'invalid-fps' });
  assert.equal(invalid.status, 400);

  for (const [index, fps] of [undefined, 30, 50, 60].entries()) {
    const actor = { id: `fps-test-${index}` };
    const response = await handle(request('', { ...payload('mp4'), fps }), actor);
    assert.equal(response.status, 202);
    const { id } = await response.json();
    const queued = await (await handle(request('?id=' + id), actor)).json();
    assert.equal(queued.fps, fps ?? 25);
  }
});

test(
  'worker renders an exact nonstandard MP4 and returns a downloadable file',
  {
    skip: !process.env.BOLT_TEST_LIVE_RENDER,
    timeout: 90_000,
  },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'bolt-media-test-'));
    const queue = join(root, 'queue');
    const proc = spawn(process.execPath, ['scripts/render/worker.mjs'], {
      env: { ...process.env, MUHELY_RENDER_QUEUE: queue },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    const exited = once(proc, 'exit');
    t.after(async () => {
      proc.kill('SIGTERM');
      await exited;
      await rm(root, { recursive: true, force: true });
    });
    const handle = createRenderQueue(queue, join(root, 'private'));
    for (let attempt = 0; attempt < 30 && (await handle(request(), owner)).status !== 200; attempt++) await wait(100);
    const queued = await handle(request('', { ...payload('mp4'), fps: 60 }), owner);
    assert.equal(queued.status, 202);
    const { id } = await queued.json();
    let status;
    for (let attempt = 0; attempt < 70; attempt++) {
      status = await (await handle(request('?id=' + id), owner)).json();
      if (['ready', 'failed'].includes(status.state)) break;
      await wait(1000);
    }
    assert.equal(status.state, 'ready', status.error);
    const output = await handle(request('?id=' + id + '&download=1'), owner);
    assert.equal(output.headers.get('content-type'), 'video/mp4');
    const frames = execFileSync(process.env.MUHELY_RENDER_FFMPEG || 'ffmpeg', [
      '-v',
      'error',
      '-i',
      join(queue, id, 'output.mp4'),
      '-f',
      'framemd5',
      '-',
    ]).toString();
    assert.match(frames, /dimensions 0: 769x257/);
    assert.equal(frames.split('\n').filter((line) => /^\d/.test(line)).length, 60);
    assert.ok(
      new Set(
        frames
          .split('\n')
          .filter((line) => /^\d/.test(line))
          .map((line) => line.split(',').at(-1)),
      ).size > 1,
    );
    await output.body.cancel();
  },
);
