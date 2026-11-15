import { chromium } from '@playwright/test';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createReadStream } from 'node:fs';
import { lstat, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';

const origin = 'https://project-render.invalid';
const assetTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

async function readAssets(directory) {
  const assets = new Map();
  let total = 0;

  async function walk(current, prefix) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const absolute = join(current, entry.name);
      const pathname = prefix + '/' + entry.name;
      if (entry.isDirectory()) {
        await walk(absolute, pathname);
        continue;
      }
      const type = assetTypes[extname(entry.name).toLowerCase()];
      if (!entry.isFile() || !type) continue;
      const details = await lstat(absolute);
      if (!details.isFile()) continue;
      total += details.size;
      if (total > 100 * 1024 * 1024 || assets.size >= 2000) {
        throw new Error('The compiled project exceeds 100 MB or 2,000 renderable files.');
      }
      assets.set(pathname, { path: absolute, contentType: type });
    }
  }

  await walk(directory, '');
  return assets;
}

async function encode(browserPage, outputPath, { width, height, frameCount, fps, ffmpeg }) {
  const animations = await browserPage.evaluateHandle(() => new WeakMap());
  const child = spawn(
    ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'image2pipe',
      '-framerate',
      String(fps),
      '-c:v',
      'png',
      '-i',
      'pipe:0',
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-pix_fmt',
      width % 2 || height % 2 ? 'yuv444p' : 'yuv420p',
      '-movflags',
      '+faststart',
      outputPath,
    ],
    { stdio: ['pipe', 'ignore', 'pipe'] },
  );
  let encoderError = '';
  child.stderr.on('data', (data) => {
    encoderError = (encoderError + String(data)).slice(-4096);
  });
  child.stdin.on('error', () => {});
  const finished = once(child, 'close');
  finished.catch(() => {});
  const exec = promisify(execFile);

  try {
    for (let frame = 0; frame < frameCount; frame++) {
      const previousTime = Math.round(((frame - 1) * 1000) / fps);
      const time = Math.round((frame * 1000) / fps);
      if (frame > 0) await browserPage.clock.runFor(time - previousTime);
      await browserPage.evaluate(
        ({ t, starts }) => {
          for (const animation of document.getAnimations()) {
            if (animation.timeline !== document.timeline) continue;
            if (!starts.has(animation)) starts.set(animation, t);
            animation.currentTime = t - starts.get(animation);
          }
        },
        { t: time, starts: animations },
      );
      const image = await browserPage.screenshot({ type: 'png', caret: 'hide', timeout: 15_000 });
      if (child.exitCode !== null || child.stdin.destroyed) throw new Error('The MP4 encoder closed early.');
      if (!child.stdin.write(image)) await Promise.race([once(child.stdin, 'drain'), finished]);
    }
    child.stdin.end();
    const [code] = await finished;
    if (code !== 0) throw new Error(encoderError || 'MP4 encoding failed.');
    await exec(ffmpeg, ['-v', 'error', '-xerror', '-i', outputPath, '-map', '0:v:0', '-f', 'null', '-'], {
      timeout: 60_000,
    });
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await finished.catch(() => {});
    await animations.dispose();
  }
}

export async function renderProject({
  directory,
  output,
  width,
  height,
  seconds = 20,
  fps = 30,
  pagePath = 'index.html',
  channel,
  ffmpeg = 'ffmpeg',
}) {
  const format = extname(output).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.mp4'].includes(format)) {
    throw new Error('Choose a .png, .jpeg or .mp4 output file.');
  }
  if (
    ![width, height].every((size) => Number.isInteger(size) && size >= 1 && size <= 4096) ||
    width * height > 4096 * 2160
  ) {
    throw new Error(
      'Choose valid integer pixel dimensions. The renderer supports up to 4096 pixels per side and 8,847,360 pixels total.',
    );
  }
  if (
    format === '.mp4' &&
    (!Number.isInteger(fps) ||
      fps < 1 ||
      fps > 60 ||
      !Number.isFinite(seconds) ||
      seconds < 0.2 ||
      Math.round(seconds * fps) < 1 ||
      seconds > 60)
  ) {
    throw new Error('Choose between 0.2 and 60 seconds at 1–60 frames per second.');
  }
  const assets = await readAssets(resolve(directory));
  const pathname = '/' + pagePath;
  if (assets.get(pathname)?.contentType !== assetTypes['.html']) {
    throw new Error('The compiled project has no HTML entry point at that path.');
  }

  const destination = resolve(output);
  const temp = await mkdtemp(join(dirname(destination), '.muhely-render-'));
  const workingOutput = join(temp, 'output' + format);
  let browser;

  try {
    browser = await chromium.launch({
      channel,
      chromiumSandbox: true,
      args: ['--host-resolver-rules=MAP * ~NOTFOUND', '--disable-background-networking'],
    });
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
      acceptDownloads: false,
    });
    const missing = new Set();
    const pageErrors = [];
    await context.routeWebSocket('**/*', (socket) => socket.close());
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      let asset;

      if (url.origin === origin) {
        try {
          asset = assets.get(decodeURIComponent(url.pathname));
        } catch {
          await route.abort();
          return;
        }
      }

      if (asset && route.request().method() === 'GET') {
        const range = route.request().headers()['range'];
        if (range && /^video\//.test(asset.contentType)) {
          const size = (await lstat(asset.path)).size;
          const parts = /^bytes=(\d+)-(\d*)$/.exec(range);
          const start = parts ? Number(parts[1]) : NaN;
          const end = parts?.[2] ? Math.min(Number(parts[2]), size - 1) : size - 1;
          if (!Number.isSafeInteger(start) || start > end) {
            await route.fulfill({ status: 416, headers: { 'content-range': 'bytes */' + size } });
            return;
          }
          const chunks = [];
          for await (const chunk of createReadStream(asset.path, { start, end })) chunks.push(chunk);
          await route.fulfill({
            status: 206,
            contentType: asset.contentType,
            body: Buffer.concat(chunks),
            headers: { 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${size}` },
          });
          return;
        }
        await route.fulfill(asset);
        return;
      }
      if (
        url.pathname !== '/favicon.ico' &&
        ['image', 'script', 'stylesheet', 'font', 'media'].includes(route.request().resourceType())
      ) {
        missing.add(url.origin === origin ? url.pathname : url.hostname);
      }
      await route.abort();
    });

    const page = await context.newPage();
    page.on('pageerror', (error) => {
      if (pageErrors.length === 0) pageErrors.push(error.message);
    });
    const start = Date.now();
    await page.clock.install({ time: start });
    await page.clock.pauseAt(start + 1000);
    await page.goto(origin + pathname.split('/').map(encodeURIComponent).join('/'), {
      waitUntil: 'load',
      timeout: 30_000,
    });
    await page.clock.runFor(32);
    await page.evaluate(() => document.fonts.ready);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Animation.enable');
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 0 });

    if (format === '.mp4') {
      await encode(page, workingOutput, { width, height, frameCount: Math.round(seconds * fps), fps, ffmpeg });
    } else {
      await page.screenshot({
        path: workingOutput,
        type: format === '.png' ? 'png' : 'jpeg',
        caret: 'hide',
        timeout: 15_000,
      });
    }
    if (pageErrors.length) throw new Error('The project failed during rendering: ' + pageErrors[0]);
    if (missing.size)
      throw new Error('The project has missing or external render assets: ' + [...missing].slice(0, 6).join(', '));
    await rename(workingOutput, destination);
  } finally {
    await browser?.close();
    await rm(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const { values } = parseArgs({
      options: {
        input: { type: 'string' },
        output: { type: 'string' },
        page: { type: 'string' },
        width: { type: 'string', default: '1080' },
        height: { type: 'string', default: '1920' },
        seconds: { type: 'string', default: '20' },
        fps: { type: 'string', default: '30' },
        channel: { type: 'string' },
        ffmpeg: { type: 'string' },
      },
    });
    if (!values.input || !values.output) throw new Error('Provide --input <compiled directory> and --output <file>.');
    await renderProject({
      directory: values.input,
      output: values.output,
      width: Number(values.width),
      height: Number(values.height),
      seconds: Number(values.seconds),
      fps: Number(values.fps),
      pagePath: values.page,
      channel: values.channel,
      ffmpeg: values.ffmpeg,
    });
    console.log('Rendered ' + values.output);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
