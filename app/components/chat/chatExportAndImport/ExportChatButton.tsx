import { useStore } from '@nanostores/react';
import * as RadixDialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Dialog, DialogDescription, DialogTitle } from '~/components/ui/Dialog';
import { uiText } from '~/lib/common/localization/ui';
import { useProjectOutput } from '~/lib/hooks/useProjectOutput';
import { useWorkspacePreferences } from '~/lib/hooks/useWorkspacePreferences';
import { chatId } from '~/lib/persistence/useChatHistory';
import {
  agentMediaExport,
  createMediaJob,
  mediaDownloadUrl,
  mediaExportOpen,
  readMediaJob,
  videoFrameRates,
  type MediaJob,
  type MediaSettings,
  type VideoFrameRate,
} from '~/lib/runtime/previewExport';
import { workbenchStore } from '~/lib/stores/workbench';

const itemClass =
  'cursor-pointer flex items-center gap-2 px-4 py-2 text-sm text-bolt-elements-textPrimary outline-none data-[highlighted]:bg-bolt-elements-item-backgroundActive data-[disabled]:opacity-50';
const inputClass =
  'w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2';

export function ExportChatButton({ exportChat, streaming }: { exportChat?: () => void; streaming: boolean }) {
  const projectId = useStore(chatId);
  const { output, setOutput } = useProjectOutput();
  const workspace = useWorkspacePreferences(projectId);
  const manuallyConfigured = useRef(false);
  const storageKey = projectId ? 'muhely-render:' + projectId : undefined;
  const [zipBusy, setZipBusy] = useState(false);
  const open = useStore(mediaExportOpen);
  const agentJob = useStore(agentMediaExport);

  const [settings, setSettings] = useState<MediaSettings>({
    format: 'mp4',
    width: 1080,
    height: 1920,
    seconds: 20,
    fps: 25,
  });

  const [creating, setCreating] = useState(false);
  const [id, setId] = useState<string>();
  const [job, setJob] = useState<MediaJob>();
  const [error, setError] = useState('');
  const submit = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    if (output === 'web') {
      mediaExportOpen.set(false);
    }

    setSettings((current) => ({
      ...current,
      format: output === 'image' ? (current.format === 'mp4' ? 'png' : current.format) : 'mp4',
    }));
  }, [output]);

  useEffect(
    () => () => {
      submit.current?.abort();
      mediaExportOpen.set(false);
    },
    [],
  );
  useEffect(() => {
    if (workspace?.led && !manuallyConfigured.current) {
      setSettings({ format: 'mp4', ...workspace.led });
    }
  }, [workspace]);

  useEffect(() => {
    if (storageKey) {
      setId(window.sessionStorage.getItem(storageKey) ?? undefined);
    }
  }, [storageKey]);
  useEffect(() => {
    if (agentJob && storageKey && agentJob.projectId === projectId) {
      setOutput(agentJob.settings.format === 'mp4' ? 'video' : 'image');
      manuallyConfigured.current = true;
      setId(agentJob.id);
      setSettings(agentJob.settings);
      setError('');
      setJob(undefined);
      window.sessionStorage.setItem(storageKey, agentJob.id);
      mediaExportOpen.set(true);
      agentMediaExport.set(undefined);
    }
  }, [agentJob, projectId, storageKey]);
  useEffect(() => {
    if (!id) {
      return undefined;
    }

    const controller = new AbortController();

    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll(jobId: string) {
      try {
        const next = await readMediaJob(jobId, controller.signal);
        setJob(next);

        if (next.state === 'running' || next.state === 'queued') {
          timer = setTimeout(() => void poll(jobId), 2000);
        }
      } catch (failure) {
        if (!controller.signal.aborted) {
          setError(
            failure instanceof Error
              ? failure.message
              : uiText('A renderelés állapota nem érhető el.', 'Export status is unavailable.'),
          );
        }
      }
    }

    void poll(id);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id]);

  async function downloadZip() {
    setZipBusy(true);

    try {
      await workbenchStore.downloadZip();
    } catch {
      toast.error(uiText('A projekt letöltése nem sikerült.', 'Could not download the project.'));
    } finally {
      setZipBusy(false);
    }
  }

  async function startRender() {
    if (submit.current) {
      return;
    }

    const area = settings.width * settings.height;

    if (!Number.isFinite(area) || area > 4096 * 2160) {
      setError(
        uiText(
          'A kért méret meghaladja a renderelő 8 847 360 képpontos kapacitását.',
          'The requested size exceeds the export limit of 8,847,360 pixels.',
        ),
      );
      return;
    }

    const controller = new AbortController();
    submit.current = controller;
    setCreating(true);
    setError('');
    setId(undefined);
    setJob(undefined);

    try {
      const result = await createMediaJob(settings, controller.signal);
      setId(result.id);

      if (storageKey) {
        window.sessionStorage.setItem(storageKey, result.id);
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(
          failure instanceof Error
            ? failure.message
            : uiText('A renderelést nem sikerült elindítani.', 'Could not start the export.'),
        );
      }
    } finally {
      submit.current = undefined;
      setCreating(false);
    }
  }

  const rendering = Boolean(id && !error && job?.state !== 'ready' && job?.state !== 'failed');

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          type="button"
          disabled={zipBusy}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-1.5 text-xs font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
        >
          {zipBusy ? uiText('Mentés…', 'Saving…') : uiText('Letöltés', 'Download')}
          <span className="i-ph:caret-down" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="z-[1100] min-w-[190px] rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 py-1 shadow-lg"
            sideOffset={5}
            align="end"
          >
            <DropdownMenu.Item className={itemClass} onSelect={() => void downloadZip()}>
              {uiText('Projektfájlok (ZIP)', 'Project files (ZIP)')}
            </DropdownMenu.Item>
            {output !== 'web' && (
              <DropdownMenu.Item className={itemClass} onSelect={() => mediaExportOpen.set(true)}>
                {job?.state === 'ready'
                  ? uiText('Kész kép vagy videó letöltése', 'Download image or video')
                  : uiText('Kép vagy videó készítése', 'Export an image or video')}
              </DropdownMenu.Item>
            )}
            {projectId && (
              <DropdownMenu.Item asChild className={itemClass}>
                <a href={`/fiokom?projekt=${encodeURIComponent(projectId)}#projektmemoria`}>
                  {uiText('Projektmemória', 'Project memory')}
                </a>
              </DropdownMenu.Item>
            )}
            {exportChat && (
              <DropdownMenu.Item className={itemClass} onSelect={exportChat}>
                {uiText('Beszélgetés exportálása', 'Export conversation')}
              </DropdownMenu.Item>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <RadixDialog.Root open={open} onOpenChange={mediaExportOpen.set}>
        {open && (
          <Dialog className="max-w-[calc(100vw-2rem)]">
            <form
              className="space-y-4 p-6"
              onSubmit={(event) => {
                event.preventDefault();
                void startRender();
              }}
            >
              <DialogTitle>{uiText('Kép vagy videó készítése', 'Export an image or video')}</DialogTitle>
              <DialogDescription>
                {uiText(
                  'Add meg a kész fájl pontos méretét képpontban.',
                  'Enter the exact dimensions of the output file in pixels.',
                )}
              </DialogDescription>
              <fieldset
                disabled={creating || rendering}
                className="grid grid-cols-2 gap-3 text-sm"
                onChange={() => {
                  manuallyConfigured.current = true;
                }}
              >
                <label className="col-span-2 grid gap-1">
                  {uiText('Fájlformátum', 'File format')}
                  <select
                    className={inputClass}
                    value={settings.format}
                    onChange={(event) =>
                      setSettings({ ...settings, format: event.target.value as MediaSettings['format'] })
                    }
                  >
                    <option value="mp4">{uiText('MP4-videó', 'MP4 video')}</option>
                    <option value="png">{uiText('PNG-kép', 'PNG image')}</option>
                    <option value="jpeg">{uiText('JPEG-kép', 'JPEG image')}</option>
                  </select>
                </label>
                <label className="grid gap-1">
                  {uiText('Szélesség (px)', 'Width (px)')}
                  <input
                    className={inputClass}
                    type="number"
                    min={1}
                    max={4096}
                    step={1}
                    required
                    value={settings.width || ''}
                    onChange={(event) => setSettings({ ...settings, width: event.target.valueAsNumber })}
                  />
                </label>
                <label className="grid gap-1">
                  {uiText('Magasság (px)', 'Height (px)')}
                  <input
                    className={inputClass}
                    type="number"
                    min={1}
                    max={4096}
                    step={1}
                    required
                    value={settings.height || ''}
                    onChange={(event) => setSettings({ ...settings, height: event.target.valueAsNumber })}
                  />
                </label>
                {settings.format === 'mp4' && (
                  <>
                    <label className="grid gap-1">
                      {uiText('Videó hossza (másodperc)', 'Video length (seconds)')}
                      <input
                        className={inputClass}
                        type="number"
                        min={1}
                        max={60}
                        step={1}
                        required
                        value={settings.seconds || ''}
                        onChange={(event) => setSettings({ ...settings, seconds: event.target.valueAsNumber })}
                      />
                    </label>
                    <label className="grid gap-1">
                      {uiText('Képkockasebesség', 'Frame rate')}
                      <select
                        className={inputClass}
                        value={settings.fps ?? 25}
                        onChange={(event) =>
                          setSettings({ ...settings, fps: Number(event.target.value) as VideoFrameRate })
                        }
                      >
                        {videoFrameRates.map((fps) => (
                          <option key={fps} value={fps}>
                            {fps} fps
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
              </fieldset>
              {(creating || rendering) && (
                <p role="status" className="text-sm">
                  {creating
                    ? uiText('A projekt fordítása…', 'Building the project…')
                    : job?.state === 'running'
                      ? uiText('A fájl készül…', 'Rendering the file…')
                      : uiText('Vár a renderelőre…', 'Waiting to render…')}
                </p>
              )}
              {(error || job?.state === 'failed') && (
                <p role="alert" className="text-sm text-red-400">
                  {error || job?.error}
                </p>
              )}
              {streaming && (
                <p className="text-sm">
                  {uiText(
                    'A renderelés a folyamatban lévő szerkesztés után indítható.',
                    'Export is available once the current edit finishes.',
                  )}
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={streaming || creating || rendering}
                  className="rounded-md bg-accent-500 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  {uiText('Fájl készítése', 'Create file')}
                </button>
                {id && job?.state === 'ready' && (
                  <a
                    href={mediaDownloadUrl(id)}
                    download
                    className="rounded-md border border-bolt-elements-borderColor px-3 py-2 text-sm"
                  >
                    {job.width} × {job.height}
                    {job.format === 'mp4' && job.fps ? ` · ${job.fps} fps` : ''} · {job.format.toUpperCase()}{' '}
                    {uiText('letöltése', 'download')}
                  </a>
                )}
              </div>
            </form>
          </Dialog>
        )}
      </RadixDialog.Root>
    </>
  );
}
