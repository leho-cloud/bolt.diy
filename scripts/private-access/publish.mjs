import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import JSZip from 'jszip';

const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
const idPattern = /^[a-z0-9-]{1,100}$/i;
const bundlePattern = /^[0-9a-f]{64}\.zip$/;
const digestPattern = /^[0-9a-f]{64}$/;
const extension =
  /\.(?:html|[cm]?js|css|json|svg|png|jpe?g|webp|avif|gif|ico|woff2?|ttf|otf|mp4|webm|txt|xml|webmanifest|pdf|wasm|mp3|ogg|wav)$/i;
const maxBytes = 23 * 1024 * 1024;
const maxBody = 32 * 1024 * 1024;
const publishPath = '/api/project-publish';
export const bundlePrefix = '/api/project-publish-bundle/';

const publicDomain = (slug) => `https://${slug}.builder.tzsvtav.com`;
const json = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

async function readBuildRequest(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json') || !request.body) {
    fail(400, 'Hiányzik a közzéteendő projektcsomag.');
  }

  const chunks = [];
  let size = 0;
  const reader = request.body.getReader();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBody) fail(413, 'A projektcsomag mérete legfeljebb 23 MB lehet.');
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error.status) throw error;
    fail(400, 'A projektcsomag nem olvasható.');
  } finally {
    reader.releaseLock();
  }
}

async function zipBuild(files) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 1000) {
    fail(400, 'A közzéteendő projektcsomag nem érvényes.');
  }

  const zip = new JSZip();
  const seen = new Set();
  let size = 0;

  for (const entry of files) {
    const { path, base64 } = entry || {};
    if (
      typeof path !== 'string' ||
      path.length > 220 ||
      !extension.test(path) ||
      path === 'bolt-release.txt' ||
      path
        .split('/')
        .some(
          (part) =>
            !part || part.startsWith('.') || part === 'node_modules' || !/^[\p{L}\p{M}\p{N}_.()@+ -]+$/u.test(part),
        ) ||
      seen.has(path) ||
      typeof base64 !== 'string' ||
      base64.length % 4 !== 0 ||
      /[^A-Za-z0-9+/=]/.test(base64)
    ) {
      fail(400, 'A projektcsomag érvénytelen fájlt tartalmaz.');
    }

    const bytes = Buffer.from(base64, 'base64');
    if (bytes.toString('base64') !== base64) fail(400, 'A projektcsomag sérült fájlt tartalmaz.');
    size += bytes.length;
    if (size > maxBytes) fail(413, 'A projektcsomag mérete legfeljebb 23 MB lehet.');
    seen.add(path);
    zip.file(path, bytes);
  }

  if (!seen.has('index.html')) fail(400, 'A lefordított projektből hiányzik az index.html.');
  return zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
}

function dockerfile(bundleUrl, digest) {
  return Buffer.from(
    [
      'FROM nginx:alpine',
      `ADD ${bundleUrl} /tmp/bolt-site.zip`,
      `RUN echo '${digest}  /tmp/bolt-site.zip' | sha256sum -c -`,
      'RUN rm -rf /usr/share/nginx/html && mkdir -p /usr/share/nginx/html && unzip -q /tmp/bolt-site.zip -d /usr/share/nginx/html && rm /tmp/bolt-site.zip',
      `RUN printf '%s' '${digest}' > /usr/share/nginx/html/bolt-release.txt`,
      'RUN printf "%s\\n" \'server { listen 80; root /usr/share/nginx/html; index index.html; add_header X-Content-Type-Options nosniff always; location = /bolt-release.txt { add_header Cache-Control no-store; } location ~ \\. { try_files $uri =404; } location / { try_files $uri $uri/ $uri.html /index.html; } }\' > /etc/nginx/conf.d/default.conf',
      'EXPOSE 80',
    ].join('\n') + '\n',
  ).toString('base64');
}

export function createPublisher(directory, env = process.env, fetcher = fetch) {
  const pending = new Set();
  const bundles = join(directory, 'publish-bundles');
  const configured = ['COOLIFY_API_URL', 'COOLIFY_API_TOKEN', 'COOLIFY_PROJECT_UUID', 'COOLIFY_SERVER_UUID'].every(
    (key) => env[key]?.trim(),
  );

  async function coolify(endpoint, method = 'GET', body) {
    const base = env.COOLIFY_API_URL.replace(/\/+$/, '').replace(/\/api\/v1$/, '') + '/api/v1';
    const response = await fetcher(base + endpoint, {
      method,
      headers: {
        Authorization: `Bearer ${env.COOLIFY_API_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error',
      signal: AbortSignal.timeout(25000),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload) {
      console.warn('Bolt Coolify publish:', method, endpoint.split('?')[0], response.status);
      fail(502, 'A szerver elutasította a közzétételi kérést. Próbáld újra később.');
    }
    return payload;
  }

  async function handleBundle(request) {
    const [slug, name, extra] = new URL(request.url).pathname.slice(bundlePrefix.length).split('/');
    if (
      request.method !== 'GET' ||
      extra !== undefined ||
      !slugPattern.test(slug || '') ||
      !bundlePattern.test(name || '')
    )
      return json(404, { error: 'A csomag nem található.' });

    const path = join(bundles, slug, name);
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) return json(404, { error: 'A csomag nem található.' });

    return new Response(Readable.toWeb(createReadStream(path)), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(info.size),
        'Content-Disposition': 'attachment; filename="bolt-site.zip"',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  }

  async function publish(request) {
    const body = await readBuildRequest(request);
    const { slug, projectId, files } = body || {};
    if (
      typeof slug !== 'string' ||
      !slugPattern.test(slug) ||
      typeof projectId !== 'string' ||
      !idPattern.test(projectId)
    )
      fail(400, 'Adj meg egy érvényes webcímet, és mentsd el a projektet.');

    if (pending.has(slug)) fail(409, 'Ezen a címen már folyamatban van egy közzététel.');
    pending.add(slug);
    try {
      const zip = await zipBuild(files);
      const digest = createHash('sha256').update(zip).digest('hex');
      const domain = publicDomain(slug);
      const marker = `Muhely statikus projekt / ${projectId}`;
      const legacyMarker = `Bolt statikus projekt: ${projectId}`;
      const rawList = await coolify('/applications');
      const list = Array.isArray(rawList) ? rawList : rawList.data;
      if (!Array.isArray(list)) fail(502, 'A szerver alkalmazáslistája nem olvasható.');
      const existing = list.find((app) =>
        (app.fqdn || app.domains || '').split(',').some(
          (name) =>
            name
              .trim()
              .replace(/^https?:\/\//, '')
              .replace(/\/$/, '')
              .toLowerCase() === new URL(domain).hostname,
        ),
      );

      if (
        existing &&
        (![marker, legacyMarker].includes(existing.description) ||
          existing.build_pack !== 'dockerfile' ||
          !idPattern.test(existing.uuid || ''))
      )
        fail(409, 'Ez a webcím már foglalt. Válassz másikat.');

      if (existing) {
        const history = await coolify('/deployments/applications/' + existing.uuid + '?take=10');
        if (history.deployments?.some(({ status }) => status === 'queued' || status === 'in_progress'))
          fail(409, 'Ezen a címen még tart a korábbi közzététel. Várd meg, amíg befejeződik.');
      }

      const folder = join(bundles, slug);
      await mkdir(folder, { recursive: true, mode: 0o700 });
      const name = randomBytes(32).toString('hex') + '.zip';
      await writeFile(join(folder, name), zip, { flag: 'wx', mode: 0o600 });
      const definition = dockerfile('https://builder.tzsvthosting.com' + bundlePrefix + slug + '/' + name, digest);
      let uuid = existing?.uuid;

      if (uuid) {
        await coolify('/applications/' + uuid, 'PATCH', { dockerfile: definition, description: marker });
      } else {
        const result = await coolify('/applications/dockerfile', 'POST', {
          project_uuid: env.COOLIFY_PROJECT_UUID,
          server_uuid: env.COOLIFY_SERVER_UUID,
          environment_name: env.COOLIFY_ENVIRONMENT_NAME || 'production',
          name: 'Muhely - ' + slug,
          description: marker,
          dockerfile: definition,
          domains: domain,
          autogenerate_domain: false,
          instant_deploy: false,
        });
        uuid = result.uuid;
      }

      if (typeof uuid !== 'string' || !idPattern.test(uuid))
        fail(502, 'A szerver nem adott vissza alkalmazásazonosítót.');
      const queued = await coolify('/deploy?uuid=' + uuid + '&force=true', 'POST');
      const deploymentId = queued.deployments?.find((item) => item.resource_uuid === uuid)?.deployment_uuid;
      if (typeof deploymentId !== 'string' || !idPattern.test(deploymentId))
        fail(502, 'A szerver nem igazolta vissza a telepítés indítását.');

      // Keep the three latest packages available for rebuilds and rolling deploys.
      const stored = await readdir(folder).catch(() => []);
      const previous = await Promise.all(
        stored
          .filter((file) => file !== name && bundlePattern.test(file))
          .map(async (file) => ({ file, time: (await stat(join(folder, file)).catch(() => null))?.mtimeMs || 0 })),
      );
      await Promise.all(
        previous
          .sort((a, b) => b.time - a.time)
          .slice(2)
          .map(({ file }) => unlink(join(folder, file)).catch(() => {})),
      );

      return json(202, { deploymentId, domain, digest });
    } finally {
      pending.delete(slug);
    }
  }

  async function status(url) {
    const slug = url.searchParams.get('slug') || '';
    const id = url.searchParams.get('id') || '';
    const digest = url.searchParams.get('digest') || '';
    if (!slugPattern.test(slug) || !idPattern.test(id) || !digestPattern.test(digest))
      fail(400, 'Érvénytelen telepítési azonosító.');
    const job = await coolify('/deployments/' + id);
    if (['failed', 'cancelled', 'canceled', 'cancelled-by-user'].includes(job.status))
      return json(200, { state: 'failed' });
    if (job.status !== 'finished') return json(200, { state: 'deploying' });

    const response = await fetcher(publicDomain(slug) + '/bolt-release.txt', {
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    }).catch(() => null);
    const confirmed =
      response?.ok && response.headers.get('content-length') === '64' && (await response.text()) === digest;
    if (response && !response.bodyUsed) await response.body?.cancel().catch(() => {});
    return json(200, { state: confirmed ? 'ready' : 'checking' });
  }

  return {
    handleBundle,
    async handle(request) {
      if (!configured) return json(503, { error: 'A szerveres közzététel még nincs beállítva.' });
      try {
        if (request.method === 'POST') return await publish(request);
        if (request.method === 'GET') {
          const url = new URL(request.url);
          if (url.search) return await status(url);
          const applications = await coolify('/applications');
          return json(200, { available: Array.isArray(applications) || Array.isArray(applications.data) });
        }
        return json(405, { error: 'Nem támogatott kérés.' });
      } catch (error) {
        return json(error.status || 502, {
          error: error.status ? error.message : 'A közzététel közben megszakadt a szerverkapcsolat.',
        });
      }
    },
  };
}
export { publishPath };
