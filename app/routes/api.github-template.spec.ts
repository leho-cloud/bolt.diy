import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loader } from './api.github-template';

describe('GitHub template loader', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the default branch archive when GitHub has no available release', async () => {
    const zip = new JSZip();
    zip.file('bolt-astro-basic-template-main/package.json', '{"scripts":{"dev":"astro dev"}}');

    const archive = await zip.generateAsync({ type: 'arraybuffer' });

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(archive));
    vi.stubGlobal('fetch', fetchMock);

    const response = await loader({
      request: new Request('http://localhost/api/github-template?repo=blueberry-llm/bolt-astro-basic-template'),
      context: { cloudflare: { ctx: { waitUntil: () => undefined } } },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        name: 'package.json',
        path: 'package.json',
        content: '{"scripts":{"dev":"astro dev"}}',
      },
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://codeload.github.com/blueberry-llm/bolt-astro-basic-template/zip/refs/heads/main',
    );
  });

  it('replaces a partial Cloudflare response with the complete public branch archive', async () => {
    const repo = 'blueberry-llm/bolt-nextjs-shadcn-template';
    const zip = new JSZip();
    zip.file('starter-main/package.json', '{"scripts":{"dev":"next dev"}}');
    zip.file('starter-main/app/page.tsx', 'export default function Page() {}');
    const archive = await zip.generateAsync({ type: 'arraybuffer' });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ default_branch: 'main' }))
      .mockResolvedValueOnce(Response.json({ tree: [{ type: 'blob', path: 'package.json', size: 50 }] }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(new Response(archive));
    vi.stubGlobal('fetch', fetchMock);

    const response = await loader({
      request: new Request(`http://localhost/api/github-template?repo=${repo}`),
      context: { cloudflare: { ctx: { waitUntil: () => undefined } } },
    });

    expect(response.status).toBe(200);
    const files = (await response.json()) as Array<{ path: string }>;
    expect(files.map(({ path }) => path)).toEqual(['package.json', 'app/page.tsx']);
    expect(fetchMock).toHaveBeenLastCalledWith(`https://codeload.github.com/${repo}/zip/refs/heads/main`);
  });
});
