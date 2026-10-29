import { describe, it, expect, vi } from 'vitest';
import { captureReference, normalizeReferenceUrl, referenceUrls, readLimited } from './reference';

describe('reference service boundary', () => {
  it('extracts explicit user URLs and normalizes fragments without accepting credentials or query strings', () => {
    expect(referenceUrls('Minta: https://mingai.hu/, https://mingai.hu/')).toEqual(['https://mingai.hu/']);
    expect(normalizeReferenceUrl('https://mingai.hu/#main')).toBe('https://mingai.hu/');

    for (const url of ['http://mingai.hu', 'https://user:secret@mingai.hu', 'https://mingai.hu/?key=secret']) {
      expect(() => normalizeReferenceUrl(url)).toThrow();
    }
  });
  it('sends only the scoped bridge token to Műhely and returns the actual model image', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        sourceUrl: 'https://mingai.hu/',
        method: 'oxylabs-screenshot',
        referenceText: 'layout',
        image: 'data:image/webp;base64,UklGRg==',
      }),
    );
    const result = await captureReference({
      url: 'https://mingai.hu/',
      bridgeUrl: 'https://muhely.example/',
      token: 'bridge-only',
      owner: 'owner',
      fetcher,
    });

    const [url, options] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe('https://muhely.example/api/integrations/bolt/reference');
    expect(options.redirect).toBe('error');
    expect(options.headers).toMatchObject({ Authorization: 'Bearer bridge-only' });
    expect(JSON.parse(String(options.body))).toEqual({ url: 'https://mingai.hu/', owner: 'owner' });
    expect(JSON.stringify(result)).not.toContain('bridge-only');
    expect(result.image).toContain('data:image/webp');
  });
  it('does not follow redirects or retry a provider quota failure', async () => {
    const fetcher = vi.fn(async () => new Response('quota', { status: 429 }));
    await expect(
      captureReference({
        url: 'https://mingai.hu/',
        bridgeUrl: 'https://muhely.example',
        token: 'secret',
        owner: 'owner',
        fetcher,
      }),
    ).rejects.toThrow('keret');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects an image-less response and bounds the response stream', async () => {
    const fetcher = vi.fn(async () => Response.json({ method: 'oxylabs-screenshot', referenceText: 'text-only' }));
    await expect(
      captureReference({
        url: 'https://mingai.hu/',
        bridgeUrl: 'https://muhely.example',
        token: 'secret',
        owner: 'owner',
        fetcher,
      }),
    ).rejects.toThrow('kép');
    await expect(readLimited(new Response('too large'), 2)).rejects.toThrow('túl nagy');
  });
});
