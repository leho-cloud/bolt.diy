import { afterEach, describe, expect, it, vi } from 'vitest';
import { inspectProjectPreview } from './previewAudit';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function preview() {
  document.body.innerHTML =
    '<iframe title="preview" style="width: 80%; height: 100%" src="https://app.local-credentialless.webcontainer-api.io/path"></iframe>';
  return document.querySelector('iframe')!;
}

function respond(frame: HTMLIFrameElement, change: (report: any) => any = (report) => report) {
  return vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation((request: any) => {
    const report = change({
      checked: true,
      viewport: { width: parseInt(frame.style.width), height: parseInt(frame.style.height) },
      issues: [],
    });
    window.dispatchEvent(
      new MessageEvent('message', {
        source: frame.contentWindow,
        origin: new URL(frame.src).origin,
        data: { type: 'MUHELY_PREVIEW_AUDIT_RESULT', requestId: request.requestId, report },
      }),
    );
  });
}

describe('rendered preview audit bridge', () => {
  it('captures two bounded images through the trusted frame channel and restores the viewport', async () => {
    const frame = preview();
    const original = frame.getAttribute('style');
    vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation((request: any) => {
      expect(request.type).toBe('MUHELY_PREVIEW_IMAGE_REQUEST');
      window.dispatchEvent(
        new MessageEvent('message', {
          source: frame.contentWindow,
          origin: new URL(frame.src).origin,
          data: {
            type: 'MUHELY_PREVIEW_IMAGE_RESULT',
            requestId: request.requestId,
            report: {
              checked: true,
              viewport: { width: parseInt(frame.style.width), height: parseInt(frame.style.height) },
              image: 'data:image/jpeg;base64,/9j/AA==',
              captureMethod: 'dom-image-export',
              issues: [],
            },
          },
        }),
      );
    });

    const report = await inspectProjectPreview(new AbortController().signal, () => true, true);
    expect(report.reports).toHaveLength(2);
    expect(report.visualChecked).toBe(false);
    expect(frame.getAttribute('style')).toBe(original);
  });
  it('measures desktop and mobile in the existing frame, restoring its size and path', async () => {
    const frame = preview();
    const original = frame.getAttribute('style');
    const post = respond(frame);
    const result = await inspectProjectPreview(new AbortController().signal, () => true);
    expect(result).toMatchObject({ checked: true, browserChecked: true, visualChecked: false, isError: false });
    expect(result.reports.map(({ report }) => report.viewport)).toEqual([
      { width: 1280, height: 800 },
      { width: 375, height: 667 },
    ]);
    expect(post).toHaveBeenCalledTimes(2);
    expect(frame.getAttribute('style')).toBe(original);
    expect(frame.src).toContain('/path');
  });
  it('rejects wrong measured dimensions and restores the frame even on failure', async () => {
    const frame = preview();
    const original = frame.getAttribute('style');
    respond(frame, (report) => ({ ...report, viewport: { width: 1, height: 1 } }));
    await expect(inspectProjectPreview(new AbortController().signal, () => true)).rejects.toThrow('mérete');
    expect(frame.getAttribute('style')).toBe(original);
  });
  it('keeps reported browser errors as errors, not visual approval', async () => {
    const frame = preview();
    respond(frame, (report) => ({
      ...report,
      issues: [{ code: 'blank-page', severity: 'error', selector: 'body', message: 'Üres oldal' }],
    }));
    expect(await inspectProjectPreview(new AbortController().signal, () => true)).toMatchObject({
      isError: true,
      visualChecked: false,
    });
  });
  it('does not accept an oversized report', async () => {
    const frame = preview();
    respond(frame, (report) => ({
      ...report,
      issues: Array.from({ length: 41 }, () => ({
        code: 'bad',
        severity: 'error',
        selector: 'body',
        message: 'error',
      })),
    }));
    await expect(inspectProjectPreview(new AbortController().signal, () => true)).rejects.toThrow('érvényes');
  });
  it('ignores another frame or origin and stops cleanly on abort', async () => {
    const frame = preview();
    const original = frame.getAttribute('style');
    const abort = new AbortController();
    vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation((request: any) => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: frame.contentWindow,
          origin: 'https://untrusted.example',
          data: {
            type: 'MUHELY_PREVIEW_AUDIT_RESULT',
            requestId: request.requestId,
            report: { checked: true, issues: [] },
          },
        }),
      );
      abort.abort();
    });
    await expect(inspectProjectPreview(abort.signal, () => true)).rejects.toThrow('megszakították');
    expect(frame.getAttribute('style')).toBe(original);
  });
  it('times out missing inspection support and leaves preview unchanged', async () => {
    vi.useFakeTimers();

    const frame = preview();
    const original = frame.getAttribute('style');
    vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => undefined);

    const result = expect(inspectProjectPreview(new AbortController().signal, () => true)).rejects.toThrow(
      'nem válaszolt',
    );
    await vi.advanceTimersByTimeAsync(8001);
    await result;
    expect(frame.getAttribute('style')).toBe(original);
  });
  it('refuses absent, foreign or changed projects', async () => {
    await expect(inspectProjectPreview(new AbortController().signal, () => true)).rejects.toThrow('Nincs');

    const frame = preview();
    frame.src = 'https://external.example';
    await expect(inspectProjectPreview(new AbortController().signal, () => true)).rejects.toThrow('saját');
    frame.src = 'https://app.webcontainer-api.io/';
    await expect(inspectProjectPreview(new AbortController().signal, () => false)).rejects.toThrow('megváltozott');
  });
});
