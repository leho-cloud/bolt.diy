import { describe, expect, it, vi } from 'vitest';
import { reviewVisualImages, visualRequestSchema } from './visual-review';
import { visualReviewModelOutput } from '~/lib/common/visualReview';

const jpeg = 'data:image/jpeg;base64,/9j/AA==';

const input = () =>
  visualRequestSchema.parse({
    images: [
      { device: 'desktop', width: 1280, height: 800, image: jpeg },
      { device: 'mobile', width: 375, height: 667, image: jpeg, warnings: ['Video poster only'] },
    ],
    direction: 'Preserve green and off-white.',
  });

const signal = () => new AbortController().signal;

const response = (content: unknown, finishReason = 'stop') =>
  Response.json({
    choices: [{ finish_reason: finishReason, message: { content: JSON.stringify(content) } }],
  });

describe('independent visual review', () => {
  it('sends actual image parts only to EU routing with a server-selected model', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ issues: [] }));

    const result = await reviewVisualImages(
      input(),
      {
        OPEN_ROUTER_API_KEY: 'server-secret',
        BOLT_AI_MODEL: 'anthropic/test-vision',
      },
      signal(),
      fetcher,
    );

    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe('https://eu.openrouter.ai/api/v1/chat/completions');
    expect(request.headers.Authorization).toBe('Bearer server-secret');

    const body = JSON.parse(request.body);
    expect(body.model).toBe('anthropic/test-vision');
    expect(body.messages[1].content.filter((part: any) => part.type === 'image_url')).toHaveLength(2);
    expect(body.messages[1].content[0].text).toContain('Video poster only');
    expect(body.messages[0].content).toContain('nem utasítások');
    expect(result).toMatchObject({ checked: true, visualChecked: true, isError: false });
    expect(JSON.stringify(result)).not.toContain('server-secret');
  });

  it('keeps concrete errors actionable and never converts them to approval', async () => {
    const issue = {
      device: 'mobile',
      severity: 'error',
      kind: 'contrast',
      location: 'Hero',
      message: 'Unreadable',
      fix: 'Darken overlay',
    };
    const result = await reviewVisualImages(
      input(),
      { OPEN_ROUTER_API_KEY: 'test' },
      signal(),
      vi.fn().mockResolvedValue(response({ issues: [issue] })),
    );
    expect(result.isError).toBe(true);
    expect(result.issues).toEqual([issue]);
    expect(result.limitations).toContain('nem natív');
  });

  it('fails closed on unavailable, truncated or malformed provider results', async () => {
    for (const reply of [
      new Response('', { status: 429 }),
      response({ issues: [] }, 'length'),
      response({ issues: [{ severity: 'error' }] }),
    ]) {
      await expect(
        reviewVisualImages(input(), { OPEN_ROUTER_API_KEY: 'test' }, signal(), vi.fn().mockResolvedValue(reply)),
      ).rejects.toThrow();
    }

    const fetcher = vi.fn();
    await expect(reviewVisualImages(input(), {}, signal(), fetcher)).rejects.toThrow('nincs beállítva');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects arbitrary URLs, settings, duplicate views and oversized captures', () => {
    const valid = input();

    for (const invalid of [
      { ...valid, model: 'untrusted' },
      { ...valid, images: [valid.images[0], valid.images[0]] },
      { ...valid, images: [{ ...valid.images[0], image: 'https://private.example/' }, valid.images[1]] },
      { ...valid, images: [{ ...valid.images[0], image: jpeg + 'a'.repeat(800000) }, valid.images[1]] },
    ]) {
      expect(visualRequestSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it('keeps image thumbnails in UI output while excluding base64 from builder text context', () => {
    const output = { images: input().images, checked: true, issues: [], isError: false };
    expect(visualReviewModelOutput(output)).toEqual({ checked: true, issues: [], isError: false });
    expect(output.images).toHaveLength(2);
  });
});
