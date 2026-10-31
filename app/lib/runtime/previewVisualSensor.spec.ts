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

async function request(
  dom: ReturnType<typeof setup>,
  origin = 'https://muhely.example',
  viewport?: { width: number; height: number },
) {
  const win = dom.window;
  const post = vi.spyOn(win, 'postMessage');
  win.dispatchEvent(
    new win.MessageEvent('message', {
      source: win,
      origin,
      data: {
        type: 'MUHELY_PREVIEW_IMAGE_REQUEST',
        requestId: 'capture-one',
        viewport: viewport ?? { width: win.innerWidth, height: win.innerHeight },
      },
    }),
  );
  await vi.waitFor(() => expect(post).toHaveBeenCalled(), { timeout: 1500 });
  expect(post.mock.calls[0][1]).toBe('https://muhely.example');

  return post.mock.calls[0][0].report;
}

describe('preview image export', () => {
  it('waits for finite breakpoint transitions before freezing computed styles', async () => {
    let settled = false;

    const dom = setup('<nav>Menu</nav>', async () => {
      expect(settled).toBe(true);
      return { toDataURL: () => jpeg };
    });

    const finished = new Promise<void>((resolve) =>
      setTimeout(() => {
        settled = true;
        resolve();
      }, 100),
    );
    Object.defineProperty(dom.window.document, 'getAnimations', {
      value: () => [{ playState: 'running', effect: { getComputedTiming: () => ({ endTime: 300 }) }, finished }],
    });

    try {
      expect(await request(dom)).toMatchObject({ checked: true });
    } finally {
      dom.window.close();
    }
  });
  it('does not demand embedding unused fonts on a system-font page', async () => {
    const dom = setup('<main>System font page</main>');
    Object.defineProperty(dom.window.document, 'fonts', {
      value: new Set([{ family: 'Unused embedded inspector font' }]),
    });

    try {
      expect(await request(dom)).toMatchObject({ checked: true });
    } finally {
      dom.window.close();
    }
  });

  it('still refuses a used custom font when its embedding is missing', async () => {
    const dom = setup('<main>Custom font page</main>');
    Object.defineProperty(dom.window.document, 'fonts', { value: new Set([{ family: 'Custom' }]) });
    dom.window.getComputedStyle = (() => ({
      cssText: 'font-family: Custom;',
      fontFamily: 'Custom',
      getPropertyValue: () => '',
    })) as unknown as typeof dom.window.getComputedStyle;

    try {
      expect(await request(dom)).toMatchObject({ checked: false, code: 'fonts' });
    } finally {
      dom.window.close();
    }
  });
  it('waits for the actual iframe resize before recording the image dimensions', async () => {
    const dom = setup();

    try {
      setTimeout(() => {
        dom.window.innerWidth = 1280;
        dom.window.innerHeight = 800;
      }, 50);
      expect(await request(dom, 'https://muhely.example', { width: 1280, height: 800 })).toMatchObject({
        checked: true,
        viewport: { width: 1280, height: 800 },
      });
    } finally {
      dom.window.close();
    }
  });
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
