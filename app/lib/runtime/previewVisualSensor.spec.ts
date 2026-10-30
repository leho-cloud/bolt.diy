import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (html: string, options: { runScripts: string; url: string }) => { window: Window & typeof globalThis };
};

const script = readFileSync('public/preview-visual.js', 'utf8');
const jpeg = 'data:image/jpeg;base64,' + '/9j/' + 'a'.repeat(600);

function setup(
  html = '<main>Example</main>',
  exportImage: (element: HTMLElement) => Promise<unknown> = async () => ({ toDataURL: () => jpeg }),
) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://test.webcontainer-api.io/' });
  const win = dom.window;
  win.getComputedStyle = (() => ({
    cssText: 'color: black;',
    getPropertyValue: () => '',
  })) as unknown as typeof win.getComputedStyle;
  Object.assign(win, {
    AbortController,
    htmlToImage: { getFontEmbedCSS: async () => '', toCanvas: exportImage },
  });
  win.eval(script.replace("'__MUHELY_PARENT_ORIGIN__'", JSON.stringify('https://muhely.example')));

  return dom;
}

async function request(dom: ReturnType<typeof setup>, origin = 'https://muhely.example') {
  const win = dom.window;
  const post = vi.spyOn(win, 'postMessage');
  win.dispatchEvent(
    new win.MessageEvent('message', {
      source: win,
      origin,
      data: { type: 'MUHELY_PREVIEW_IMAGE_REQUEST', requestId: 'capture-one' },
    }),
  );
  await vi.waitFor(() => expect(post).toHaveBeenCalled(), { timeout: 1500 });
  expect(post.mock.calls[0][1]).toBe('https://muhely.example');

  return post.mock.calls[0][0].report;
}

describe('preview image export', () => {
  it('exports a clone, redacts form values, and restores the original DOM', async () => {
    const exportImage = vi.fn(async (element: HTMLElement) => {
      expect(element.querySelector('input')!.value).toBe('');
      expect(element.querySelector('textarea')!.value).toBe('');
      expect(element.querySelector('script')).toBeNull();

      return { toDataURL: () => jpeg };
    });

    const dom = setup(
      '<main><input value="private"><textarea>secret</textarea><script>nothing</script></main>',
      exportImage,
    );

    try {
      const original = dom.window.document.body.innerHTML;
      expect(await request(dom)).toMatchObject({ checked: true, captureMethod: 'dom-image-export', image: jpeg });
      expect(exportImage).toHaveBeenCalledOnce();
      expect(dom.window.document.body.innerHTML).toBe(original);
    } finally {
      dom.window.close();
    }
  });

  it('does not approve unavailable or incomplete exports, and cleans up the clone', async () => {
    for (const exporter of [
      async () => {
        throw Error('Missing font');
      },
      async () => ({ toDataURL: () => 'data:,' }),
    ]) {
      const dom = setup('<main>Example</main>', exporter);

      try {
        const original = dom.window.document.body.innerHTML;
        expect(await request(dom)).toMatchObject({ checked: false });
        expect(dom.window.document.body.innerHTML).toBe(original);
      } finally {
        dom.window.close();
      }
    }
  });

  it('ignores requests from a foreign parent origin', async () => {
    const dom = setup();

    try {
      const post = vi.spyOn(dom.window, 'postMessage');
      dom.window.dispatchEvent(
        new dom.window.MessageEvent('message', {
          source: dom.window,
          origin: 'https://foreign.example',
          data: { type: 'MUHELY_PREVIEW_IMAGE_REQUEST', requestId: 'bad' },
        }),
      );
      await Promise.resolve();
      expect(post).not.toHaveBeenCalled();
    } finally {
      dom.window.close();
    }
  });
});
