import { readFileSync } from 'node:fs';

import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (html: string, options: { runScripts: string; url: string }) => { window: Window & typeof globalThis };
};

const script = readFileSync('public/preview-audit.js', 'utf8');

function page(html: string, width = 1280, pageWidth = width) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://test.webcontainer-api.io/' });
  const win = dom.window;
  Object.defineProperty(win, 'innerWidth', { value: width });
  Object.defineProperty(win.document.documentElement, 'scrollWidth', { value: pageWidth });
  Object.defineProperty(win.document.body, 'scrollWidth', { value: pageWidth });
  Object.defineProperty(win.document.body, 'innerText', { get: () => win.document.body.textContent });
  win.HTMLElement.prototype.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 80,
    bottom: 20,
    width: 80,
    height: 20,
    toJSON: () => ({}),
  });

  for (const image of Array.from(win.document.images) as HTMLImageElement[]) {
    Object.defineProperty(image, 'complete', { value: true });
    Object.defineProperty(image, 'naturalWidth', { value: image.id === 'broken' ? 0 : 80 });
  }
  win.eval(script.replace("'__MUHELY_PARENT_ORIGIN__'", JSON.stringify('https://muhely.example')));

  return dom;
}

async function audit(dom: ReturnType<typeof page>) {
  const win = dom.window;
  const post = vi.spyOn(win, 'postMessage');
  win.dispatchEvent(
    new win.MessageEvent('message', {
      source: win,
      origin: 'https://muhely.example',
      data: { type: 'MUHELY_PREVIEW_AUDIT_REQUEST', requestId: 'audit-one' },
    }),
  );
  await vi.waitFor(
    () =>
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 'audit-one', type: 'MUHELY_PREVIEW_AUDIT_RESULT' }),
        '*',
      ),
    { timeout: 2500 },
  );

  return post.mock.calls[0][0].report as { checked: boolean; issues: Array<{ code: string; severity: string }> };
}

describe('injected preview diagnostics', () => {
  it('detects broken images, missing anchors, overflow and actual uncaught errors', async () => {
    const dom = page(
      '<main><h1>Oldal</h1><img id="broken" src="/missing.jpg"><a href="#missing">Kapcsolat</a><button></button><video></video></main>',
      375,
      600,
    );

    try {
      Object.defineProperty(dom.window.document.querySelector('video'), 'error', { value: { code: 4 } });
      dom.window.dispatchEvent(new dom.window.ErrorEvent('error', { message: 'Render failed' }));

      const report = await audit(dom);
      expect(report.checked).toBe(true);
      expect(report.issues.map((issue) => issue.code)).toEqual(
        expect.arrayContaining([
          'broken-image',
          'missing-anchor',
          'horizontal-overflow',
          'runtime-error',
          'broken-media',
          'unnamed-button',
        ]),
      );
    } finally {
      dom.window.close();
    }
  });
  it('accepts a page with real content, valid image, anchor and named controls', async () => {
    const dom = page(
      '<main id="top"><h1>Üdv</h1><img src="/ok.jpg" alt="Kép"><a href="#top">Fel</a><button aria-label="Menü"><svg></svg></button></main>',
    );

    try {
      expect((await audit(dom)).issues).toEqual([]);
    } finally {
      dom.window.close();
    }
  });
  it('reports an empty page and ignores messages from other windows', async () => {
    const dom = page('<body></body>');

    try {
      const post = vi.spyOn(dom.window, 'postMessage');
      dom.window.dispatchEvent(
        new dom.window.MessageEvent('message', {
          source: null,
          data: { type: 'MUHELY_PREVIEW_AUDIT_REQUEST', requestId: 'spoof' },
        }),
      );
      dom.window.dispatchEvent(
        new dom.window.MessageEvent('message', {
          source: dom.window,
          origin: 'https://other.example',
          data: { type: 'MUHELY_PREVIEW_AUDIT_REQUEST', requestId: 'wrong-origin' },
        }),
      );
      expect(post).not.toHaveBeenCalled();
      expect((await audit(dom)).issues.map((issue) => issue.code)).toContain('blank-page');
    } finally {
      dom.window.close();
    }
  });
});
