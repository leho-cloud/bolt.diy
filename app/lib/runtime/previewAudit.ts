import { z } from 'zod';

const reportSchema = z.object({
  checked: z.literal(true),
  viewport: z.object({ width: z.number().int().min(1).max(4096), height: z.number().int().min(1).max(4096) }),
  title: z.string().max(150).optional(),
  image: z
    .string()
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)
    .max(800000)
    .optional(),
  captureMethod: z.literal('dom-image-export').optional(),
  warnings: z.array(z.string().max(400)).max(10).optional(),
  pageWidth: z.number().min(0).max(10_000_000).optional(),
  issues: z
    .array(
      z.object({
        code: z.string().max(60),
        severity: z.enum(['error', 'suggestion']),
        selector: z.string().max(150),
        message: z.string().max(500),
      }),
    )
    .max(40),
});
export type PreviewAuditReport = z.infer<typeof reportSchema>;

function inspectFrame(frame: HTMLIFrameElement, signal: AbortSignal, capture = false): Promise<PreviewAuditReport> {
  const target = frame.contentWindow;
  const origin = new URL(frame.src).origin;
  const requestId = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      signal.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(new Error('Az ellenőrzést megszakították.'));
    };

    const onMessage = (event: MessageEvent) => {
      if (
        event.source !== target ||
        event.origin !== origin ||
        event.data?.type !== (capture ? 'MUHELY_PREVIEW_IMAGE_RESULT' : 'MUHELY_PREVIEW_AUDIT_RESULT') ||
        event.data.requestId !== requestId
      ) {
        return;
      }

      cleanup();

      const parsed = reportSchema.safeParse(event.data.report);

      if (!parsed.success) {
        reject(
          new Error(
            typeof event.data.report?.error === 'string'
              ? event.data.report.error.slice(0, 300)
              : 'Az előnézet nem adott érvényes ellenőrzési eredményt.',
          ),
        );
      } else {
        resolve(parsed.data);
      }
    };

    const timeout = setTimeout(
      () => {
        cleanup();
        reject(new Error('Az előnézet ellenőrzője nem válaszolt. Frissítsd az előnézetet, majd próbáld újra.'));
      },
      capture ? 30000 : 8000,
    );
    window.addEventListener('message', onMessage);
    signal.addEventListener('abort', onAbort, { once: true });

    if (signal.aborted) {
      onAbort();
      return;
    }

    target?.postMessage(
      {
        type: capture ? 'MUHELY_PREVIEW_IMAGE_REQUEST' : 'MUHELY_PREVIEW_AUDIT_REQUEST',
        requestId,
        ...(capture ? { viewport: { width: parseInt(frame.style.width), height: parseInt(frame.style.height) } } : {}),
      },
      origin,
    );
  });
}

/** Inspect the existing iframe at two real CSS viewports without navigation or submitting user data. */
export async function inspectProjectPreview(signal: AbortSignal, isCurrent: () => boolean, capture = false) {
  const frame = document.querySelector<HTMLIFrameElement>('iframe[title="preview"]');

  if (!frame?.contentWindow || !frame.src) {
    throw new Error('Nincs megnyitott előnézet. Indítsd el és nyisd meg az oldalt.');
  }

  const url = new URL(frame.src);

  if (url.protocol !== 'https:' || !url.hostname.endsWith('.webcontainer-api.io')) {
    throw new Error('Csak a projekt saját futó előnézete ellenőrizhető.');
  }

  const originalStyle = frame.getAttribute('style');
  const reports: Array<{ device: string; report: PreviewAuditReport }> = [];

  try {
    for (const viewport of [
      { device: 'desktop', width: 1280, height: 800 },
      { device: 'mobile', width: 375, height: 667 },
    ]) {
      if (!isCurrent() || signal.aborted || !frame.isConnected) {
        throw new Error('A projekt vagy az előnézet megváltozott az ellenőrzés közben.');
      }

      for (const [property, value] of Object.entries({
        width: `${viewport.width}px`,
        height: `${viewport.height}px`,
        'min-width': `${viewport.width}px`,
        'min-height': `${viewport.height}px`,
        'max-width': 'none',
        'max-height': 'none',
        'flex-shrink': '0',
      })) {
        frame.style.setProperty(property, value, 'important');
      }

      const report = await inspectFrame(frame, signal, capture);

      if (report.viewport?.width !== viewport.width || report.viewport?.height !== viewport.height) {
        throw new Error('Az előnézet mérete nem állt át, ezért az eredmény nem tekinthető ellenőrzöttnek.');
      }

      if (capture && (!report.image || report.captureMethod !== 'dom-image-export')) {
        throw new Error('Nem érkezett értékelhető kép az előnézetből.');
      }

      reports.push({ device: viewport.device, report });
    }

    if (!isCurrent() || signal.aborted) {
      throw new Error('A projekt megváltozott az ellenőrzés közben.');
    }

    return {
      checked: true,
      browserChecked: true,
      visualChecked: false,
      previewReady: true,
      isError: reports.some(({ report }) => report.issues?.some((issue) => issue.severity === 'error')),
      reports,
      next: 'Repair reported errors with small source patches, rerun real checks and this preview report after edits. This measured DOM report is not a screenshot or aesthetic approval.',
    };
  } finally {
    if (originalStyle === null) {
      frame.removeAttribute('style');
    } else {
      frame.setAttribute('style', originalStyle);
    }
  }
}
