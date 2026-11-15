import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';

export const maxUploadBytes = 32 * 1024 * 1024;
const maxAge = 24 * 60 * 60 * 1000;
const workerFreshness = 30_000;
const jobIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const formats = { png: 'image/png', jpeg: 'image/jpeg', mp4: 'video/mp4' };
const allowedAsset = /\.(html|js|mjs|css|json|svg|png|jpe?g|webp|avif|gif|ico|woff2?|ttf|mp4|webm)$/i;

const json = (body, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

export async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}

export async function writeJson(path, value) {
  const temp = path + '.' + randomUUID();
  await writeFile(temp, JSON.stringify(value), { mode: 0o640 });
  await rename(temp, path);
}

function parseSettings({ format, width, height, seconds }) {
  if (
    typeof format !== 'string' ||
    !Object.hasOwn(formats, format) ||
    ![width, height].every((size) => Number.isInteger(size) && size >= 1 && size <= 4096) ||
    width * height > 4096 * 2160 ||
    (format === 'mp4' && (!Number.isInteger(seconds) || seconds < 1 || seconds > 60))
  ) {
    throw new Error('Érvénytelen formátum, pixelméret vagy videóhossz.');
  }
  return { format, width, height, seconds: format === 'mp4' ? seconds : 1, fps: 25 };
}

async function parseUpload(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json') || !request.body) {
    throw new Error('A rendereléshez JSON projektcsomag szükséges.');
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request.body) {
    bytes += chunk.byteLength;
    if (bytes > maxUploadBytes) throw new Error('A renderelendő csomag túl nagy.');
    chunks.push(chunk);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const settings = parseSettings(body);
  if (!Array.isArray(body.files) || body.files.length > 1000 || body.files.length === 0) {
    throw new Error('A projektcsomagnak 1–1000 fájlt kell tartalmaznia.');
  }
  const files = new Map();
  for (const entry of body.files) {
    const { path, base64 } = entry ?? {};
    if (
      typeof path !== 'string' ||
      path.length > 400 ||
      !allowedAsset.test(path) ||
      !path.split('/').every((part) => part && !part.startsWith('.') && !/[\\\x00-\x1f]/.test(part)) ||
      typeof base64 !== 'string' ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) ||
      base64.length % 4 !== 0 ||
      files.has(path)
    ) {
      throw new Error('A projektcsomag érvénytelen fájlt tartalmaz.');
    }
    files.set(path, base64);
  }
  if (!files.has('index.html')) throw new Error('A csomagból hiányzik az index.html.');
  return { files, settings };
}

export function createRenderQueue(directory, ownershipDirectory) {
  if (!directory) return async () => json({ error: 'A renderelő szolgáltatás még nincs bekapcsolva.' }, 503);

  let receiving = false;
  let initialized;

  async function prepare() {
    await Promise.all([
      mkdir(directory, { recursive: true, mode: 0o750 }),
      mkdir(ownershipDirectory, { recursive: true, mode: 0o700 }),
    ]);
  }

  return async function handle(request, actor) {
    initialized ??= prepare().catch((error) => {
      initialized = undefined;
      throw error;
    });
    await initialized;
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (request.method === 'GET' && id === null) {
      const heartbeat = await stat(join(directory, 'heartbeat')).catch(() => null);
      return heartbeat && Date.now() - heartbeat.mtimeMs < workerFreshness
        ? json({ available: true })
        : json({ error: 'A renderelő szolgáltatás pillanatnyilag nem elérhető.' }, 503);
    }

    if (request.method === 'POST' && id === null) {
      const heartbeat = await stat(join(directory, 'heartbeat')).catch(() => null);

      if (!heartbeat || Date.now() - heartbeat.mtimeMs >= workerFreshness) {
        return json({ error: 'A renderelő szolgáltatás pillanatnyilag nem elérhető.' }, 503);
      }

      if (receiving) return json({ error: 'Egy projektcsomag éppen feltöltés alatt van. Próbáld újra.' }, 429);
      receiving = true;
      const jobId = randomUUID();
      const folder = join(directory, jobId);
      const ownerPath = join(ownershipDirectory, jobId + '.json');

      try {
        const records = await readdir(ownershipDirectory);
        let active = 0;
        for (const name of records) {
          const previousId = name.slice(0, -5);
          if (!jobIdPattern.test(previousId)) continue;
          const refPath = join(ownershipDirectory, name);
          const ref = await readJson(refPath);
          if (!ref) continue;
          if (Date.now() - ref.created > maxAge) {
            await rm(refPath, { force: true });
            continue;
          }
          const status = await readJson(join(directory, previousId, 'status.json'));
          if (status?.state === 'queued' || status?.state === 'running') {
            if (ref.actorId === actor.id) return json({ error: 'Már készül egy fájl.', id: previousId }, 409);
            active++;
          }
        }
        if (active >= 4) return json({ error: 'A renderelő foglalt. Próbáld újra később.' }, 429);
        let upload;
        try {
          upload = await parseUpload(request);
        } catch (error) {
          return json({ error: error instanceof SyntaxError ? 'Érvénytelen projektcsomag.' : error.message }, 400);
        }
        await mkdir(join(folder, 'input'), { recursive: true, mode: 0o770 });
        for (const [path, base64] of upload.files) {
          const destination = join(folder, 'input', path);
          await mkdir(dirname(destination), { recursive: true, mode: 0o770 });
          await writeFile(destination, Buffer.from(base64, 'base64'), { mode: 0o640, flag: 'wx' });
        }
        await writeJson(ownerPath, { actorId: actor.id, created: Date.now() });
        await writeJson(join(folder, 'status.json'), { state: 'queued', ...upload.settings });
        return json({ id: jobId }, 202);
      } catch {
        await Promise.all([rm(folder, { recursive: true, force: true }), rm(ownerPath, { force: true })]);
        return json({ error: 'A projektet nem sikerült átadni a renderelőnek.' }, 500);
      } finally {
        receiving = false;
      }
    }

    if (request.method !== 'GET' || id === null || !jobIdPattern.test(id))
      return json({ error: 'Ismeretlen művelet.' }, 404);
    const owner = await readJson(join(ownershipDirectory, id + '.json'));
    if (owner?.actorId !== actor.id || Date.now() - owner.created > maxAge) {
      return json({ error: 'Ez a renderelt fájl nem érhető el.' }, 404);
    }
    const folder = join(directory, id);
    const status = await readJson(join(folder, 'status.json'));
    if (!status) return json({ error: 'A feladat már nem érhető el.' }, 404);
    if (url.searchParams.get('download') !== '1') return json(status);
    if (status.state !== 'ready' || !Object.hasOwn(formats, status.format)) {
      return json({ error: 'A fájl még nem készült el.' }, 409);
    }
    const path = join(folder, 'output.' + status.format);
    const file = await stat(path).catch(() => null);
    if (!file?.isFile()) return json({ error: 'A kész fájl már nem érhető el.' }, 404);
    return new Response(Readable.toWeb(createReadStream(path)), {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': formats[status.format],
        'Content-Length': String(file.size),
        'Content-Disposition': `attachment; filename="muhely-${status.width}x${status.height}.${status.format}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  };
}
