import { useEffect, useRef, useState } from 'react';
import { inspectProjectPreview } from '~/lib/runtime/previewAudit';

/** Local image capture only: never sends a request to an AI provider. */
export function PreviewCaptureRetry() {
  const request = useRef<AbortController | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [images, setImages] = useState<Array<{ device: string; image?: string }>>([]);
  useEffect(() => () => request.current?.abort(), []);

  const retry = async () => {
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setMessage('A képrögzítést ellenőrzöm, AI-hívás nélkül…');
    setImages([]);

    try {
      const result = await inspectProjectPreview(controller.signal, () => !controller.signal.aborted, true);
      setImages(result.reports.map(({ device, report }) => ({ device, image: report.image })));
      setMessage('Mindkét kép elkészült. AI-értékelés nem indult.');
    } catch (error) {
      if (!controller.signal.aborted) {
        setMessage(error instanceof Error ? error.message : 'A képrögzítés nem sikerült.');
      }
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
      }
    }
  };

  return (
    <div className="ml-7 mt-2 text-xs">
      <button
        type="button"
        disabled={busy}
        onClick={retry}
        className="rounded border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary px-2 py-1 disabled:opacity-50"
      >
        {busy ? 'Képrögzítés folyamatban…' : 'Képrögzítés ellenőrzése (AI nélkül)'}
      </button>
      {message && (
        <p role="status" className="mt-2 break-words">
          {message}
        </p>
      )}
      <div className="flex items-start gap-2 overflow-x-auto">
        {images.map(
          ({ device, image }) =>
            image && (
              <img
                key={device}
                src={image}
                alt={device === 'desktop' ? 'Rögzített asztali nézet' : 'Rögzített telefonos nézet'}
                className="mt-2 h-auto shrink-0 max-w-[70%] rounded object-contain"
              />
            ),
        )}
      </div>
    </div>
  );
}
