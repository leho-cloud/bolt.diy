import type { WebContainer } from '@webcontainer/api';
import { atom } from 'nanostores';
import { workbenchStore } from '~/lib/stores/workbench';
import { webcontainer } from '~/lib/webcontainer';

export const videoFrameRates = [25, 30, 50, 60] as const;
export type VideoFrameRate = (typeof videoFrameRates)[number];

export type MediaSettings = {
  format: 'mp4' | 'png' | 'jpeg';
  width: number;
  height: number;
  seconds: number;
  fps?: VideoFrameRate;
};

export type MediaJob = MediaSettings & {
  state: 'queued' | 'running' | 'ready' | 'failed';
  error?: string;
};

export const mediaExportOpen = atom(false);
export const agentMediaExport = atom<{ projectId: string; id: string; settings: MediaSettings } | undefined>(undefined);

const endpoint = '/api/media-render';
const mediaFiles = /\.(html|js|mjs|css|json|svg|png|jpe?g|webp|avif|gif|ico|woff2?|ttf|mp4|webm)$/i;
const maxBytes = 23 * 1024 * 1024;

async function request<T>(url: string, signal: AbortSignal, settings?: object): Promise<T> {
  const response = await fetch(url, {
    signal,
    ...(settings
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) }
      : {}),
  });

  const result = (await response.json().catch(() => null)) as { error?: string } | null;

  if (!response.ok || !result) {
    throw new Error(result?.error ?? 'A renderelő szolgáltatás nem érhető el.');
  }

  return result as T;
}

export function mediaDownloadUrl(id: string) {
  return `${endpoint}?id=${encodeURIComponent(id)}&download=1`;
}

export function readMediaJob(id: string, signal: AbortSignal) {
  return request<MediaJob>(`${endpoint}?id=${encodeURIComponent(id)}`, signal);
}

function toBase64(bytes: Uint8Array) {
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }

  return btoa(binary);
}

async function collectBuild(wc: WebContainer, directory: string, signal: AbortSignal, publication = false) {
  const files: { path: string; base64: string }[] = [];

  let total = 0;

  async function walk(prefix: string) {
    for (const entry of await wc.fs.readdir(directory + prefix, { withFileTypes: true })) {
      signal.throwIfAborted();

      if (
        entry.name.startsWith('.') ||
        entry.name === 'node_modules' ||
        (publication && directory === '.' && /^(?:server|api|tests?|dist|build|config)$/i.test(entry.name)) ||
        (publication && /(?:^|[.-])config\.[cm]?js$/i.test(entry.name))
      ) {
        continue;
      }

      const path = prefix + '/' + entry.name;

      if (entry.isDirectory()) {
        await walk(path);
      } else if (
        entry.isFile() &&
        (mediaFiles.test(path) || (publication && /\.(?:txt|xml|webmanifest|pdf|otf|wasm|mp3|ogg|wav)$/i.test(path)))
      ) {
        const bytes = await wc.fs.readFile(directory + path);
        total += bytes.length;

        if (total > maxBytes || files.length >= 1000) {
          throw new Error('A projekt médiafájljai meghaladják a renderelő csomagméretét.');
        }

        files.push({ path: path.slice(1), base64: toBase64(bytes) });
      }
    }
  }

  await walk('');

  if (!files.some(({ path }) => path === 'index.html')) {
    throw new Error('Hiányzik a fordításból az index.html. Statikusan buildelhető webes projekt szükséges.');
  }

  return files;
}

export async function collectProjectBuild(signal: AbortSignal, options?: { publication?: boolean }) {
  const generation = workbenchStore.projectGeneration.get();

  const assertCurrent = () => {
    signal.throwIfAborted();

    if (generation !== workbenchStore.projectGeneration.get()) {
      throw new Error('A projekt megváltozott a fordítás közben.');
    }
  };

  const files = await workbenchStore.queueProjectMutation(async () => {
    assertCurrent();

    const wc = await webcontainer;

    assertCurrent();
    await workbenchStore.saveAllFiles();

    const packageJson = await wc.fs.readFile('package.json', 'utf-8').catch(() => undefined);

    if (!packageJson) {
      return collectBuild(wc, '.', signal, options?.publication);
    }

    const { scripts, dependencies, devDependencies } = JSON.parse(packageJson);

    if (typeof scripts?.build !== 'string' || !(dependencies?.vite || devDependencies?.vite)) {
      throw new Error('Ehhez a projekthez Vite build vagy önálló HTML szükséges a közvetlen rendereléshez.');
    }

    // Run Vite and read its files through the same project-relative WebContainer path.
    const output = 'node_modules/.cache/muhely-render-' + crypto.randomUUID();

    try {
      const process = await wc.spawn('npm', ['run', 'build', '--', '--outDir', output]);
      const stop = () => process.kill();
      signal.addEventListener('abort', stop, { once: true });

      try {
        if (signal.aborted) {
          stop();
        }

        const log = process.output.pipeTo(new WritableStream());
        const [code] = await Promise.all([process.exit, log]);
        assertCurrent();

        if (code !== 0) {
          throw new Error('A projekt fordítása sikertelen. Ellenőrizd, hogy a függőségek telepítve vannak-e.');
        }
      } finally {
        signal.removeEventListener('abort', stop);
      }

      try {
        return await collectBuild(wc, output, signal, options?.publication);
      } catch (error) {
        if ((error as { code?: string })?.code === 'ENOENT') {
          throw new Error('A fordítás nem hozta létre a várt exportmappát. Ellenőrizd a Vite build beállításait.');
        }

        throw error;
      }
    } finally {
      await wc.fs.rm(output, { recursive: true, force: true });
    }
  });

  assertCurrent();

  return files;
}

export async function createMediaJob(settings: MediaSettings, signal: AbortSignal) {
  await request(endpoint, signal);

  const files = await collectProjectBuild(signal);

  return request<{ id: string }>(endpoint, signal, { ...settings, files });
}
