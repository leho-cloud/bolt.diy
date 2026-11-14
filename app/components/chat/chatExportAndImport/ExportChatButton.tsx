import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { saveAs } from 'file-saver';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { capturePreviewImage, getPreviewMp4MimeType, openPreviewCapture } from '~/lib/runtime/previewExport';
import { workbenchStore } from '~/lib/stores/workbench';

type ExportFormat = 'zip' | 'png' | 'jpeg' | 'mp4';

const itemClass =
  'cursor-pointer flex items-center gap-2 px-4 py-2 text-sm text-bolt-elements-textPrimary outline-none data-[highlighted]:bg-bolt-elements-item-backgroundActive data-[disabled]:opacity-50';

export function ExportChatButton({ exportChat, previewVisible }: { exportChat?: () => void; previewVisible: boolean }) {
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState(false);
  const activeCapture = useRef<AbortController | undefined>(undefined);
  const recorder = useRef<MediaRecorder | undefined>(undefined);

  useEffect(() => {
    if (!previewVisible) {
      activeCapture.current?.abort();
    }

    return () => activeCapture.current?.abort();
  }, [previewVisible]);

  async function download(format: ExportFormat) {
    setSaving(true);

    const capture = new AbortController();
    const stopTracks = (stream: MediaStream) => stream.getTracks().forEach((track) => track.stop());

    try {
      if (format === 'zip') {
        await workbenchStore.downloadZip();
        return;
      }

      const mp4MimeType = format === 'mp4' ? getPreviewMp4MimeType() : undefined;

      if (format === 'mp4' && !mp4MimeType) {
        throw new Error('Ez a böngésző nem tud MP4-et rögzíteni.');
      }

      activeCapture.current = capture;

      const stream = await openPreviewCapture();

      try {
        if (capture.signal.aborted) {
          return;
        }

        capture.signal.addEventListener('abort', () => stopTracks(stream), { once: true });

        const name = `muhely-elonezet-${Date.now()}`;

        if (format === 'png' || format === 'jpeg') {
          const image = await capturePreviewImage(stream, format === 'png' ? 'image/png' : 'image/jpeg');

          if (!capture.signal.aborted) {
            saveAs(image, `${name}.${format}`);
          }

          return;
        }

        const video = new MediaRecorder(stream, { mimeType: mp4MimeType });
        const chunks: Blob[] = [];

        const output = new Promise<Blob>((resolve, reject) => {
          video.ondataavailable = ({ data }) => {
            if (data.size) {
              chunks.push(data);
            }
          };
          video.onstop = () => resolve(new Blob(chunks, { type: 'video/mp4' }));
          video.onerror = () => reject(new Error('Az MP4-felvétel megszakadt.'));
        });
        recorder.current = video;
        video.start(1000);
        setRecording(true);

        const blob = await output;

        if (!capture.signal.aborted) {
          if (!blob.size) {
            throw new Error('A felvétel üres. Indíts új felvételt, és várj néhány másodpercet a mentéssel.');
          }

          saveAs(blob, `${name}.mp4`);
        }
      } finally {
        stopTracks(stream);
      }
    } catch (error) {
      if (!capture.signal.aborted && !(error instanceof DOMException && error.name === 'NotAllowedError')) {
        toast.error(format === 'zip' ? 'A projekt letöltése nem sikerült.' : (error as Error).message);
      }
    } finally {
      activeCapture.current = undefined;
      recorder.current = undefined;
      setRecording(false);
      setSaving(false);
    }
  }

  if (recording) {
    return (
      <button
        type="button"
        className="shrink-0 rounded-md bg-accent-500 px-3 py-1.5 text-xs text-white"
        onClick={() => {
          if (recorder.current?.state === 'recording') {
            recorder.current.stop();
          }
        }}
      >
        MP4 mentése ■
      </button>
    );
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        disabled={saving}
        className="flex shrink-0 items-center gap-1.5 rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-xs"
      >
        {saving ? 'Mentés…' : 'Letöltés'}
        <span className="i-ph:caret-down" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-[1100] min-w-[190px] rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 py-1 shadow-lg"
          sideOffset={5}
          align="end"
        >
          <DropdownMenu.Item className={itemClass} onSelect={() => void download('zip')}>
            Projektfájlok (ZIP)
          </DropdownMenu.Item>
          <DropdownMenu.Item className={itemClass} disabled={!previewVisible} onSelect={() => void download('png')}>
            Előnézet mentése (PNG)
          </DropdownMenu.Item>
          <DropdownMenu.Item className={itemClass} disabled={!previewVisible} onSelect={() => void download('jpeg')}>
            Előnézet mentése (JPEG)
          </DropdownMenu.Item>
          <DropdownMenu.Item className={itemClass} disabled={!previewVisible} onSelect={() => void download('mp4')}>
            Felvétel indítása (MP4)
          </DropdownMenu.Item>
          {exportChat && (
            <DropdownMenu.Item className={itemClass} onSelect={exportChat}>
              Beszélgetés exportálása
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
