import { uiText } from '~/lib/common/localization/ui';
import { useStore } from '@nanostores/react';
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState, type FormEvent } from 'react';
import { chatId, description } from '~/lib/persistence/useChatHistory';
import { collectProjectBuild } from '~/lib/runtime/previewExport';
import { streamingState } from '~/lib/stores/streaming';

const endpoint = '/api/project-publish';
const domainSuffix = '.builder.tzsvtav.com';
const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

const actionClass =
  'inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#b51d3d] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#a91836] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60';

type Deployment = { deploymentId: string; domain: string; digest: string; slug: string };
type Stage = 'idle' | 'building' | 'deploying' | 'checking' | 'ready' | 'failed';

export function DeployButton() {
  const projectId = useStore(chatId);
  const projectName = useStore(description);
  const isStreaming = useStore(streamingState);

  if (!projectId) {
    return null;
  }

  return <PublishDialog key={projectId} projectId={projectId} projectName={projectName} disabled={isStreaming} />;
}

function PublishDialog({
  projectId,
  projectName,
  disabled,
}: {
  projectId: string;
  projectName?: string;
  disabled: boolean;
}) {
  const [slug, setSlug] = useState(() => {
    const name = (projectName || '')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 48)
      .replace(/^-+|-+$/g, '');

    return name || ('projekt-' + projectId.toLowerCase()).slice(0, 48).replace(/-+$/, '');
  });

  const [stage, setStage] = useState<Stage>('idle');
  const [deployment, setDeployment] = useState<Deployment>();
  const [error, setError] = useState('');
  const busy = stage === 'building' || stage === 'deploying' || stage === 'checking';

  useEffect(() => {
    if (!deployment) {
      return undefined;
    }

    const controller = new AbortController();
    const { slug, deploymentId, digest } = deployment;
    const query = new URLSearchParams({ slug, id: deploymentId, digest });
    const deadline = Date.now() + 240000;

    let timer: ReturnType<typeof setTimeout>;

    async function check() {
      try {
        const response = await fetch(endpoint + '?' + query, { signal: controller.signal, cache: 'no-store' });
        const result = (await response.json()) as { state?: Stage; error?: string };

        if (!response.ok) {
          throw new Error(result.error);
        }

        if (controller.signal.aborted) {
          return;
        }

        if (result.state === 'ready') {
          setStage('ready');
          return;
        }

        if (result.state === 'failed') {
          setStage('failed');
          setError(uiText("A szerveres telepítés megszakadt. Újraindíthatod a közzétételt.", "Publishing was interrupted. You can try again."));

          return;
        }

        setStage(result.state === 'checking' ? 'checking' : 'deploying');
      } catch {
        if (controller.signal.aborted) {
          return;
        }
      }

      if (Date.now() < deadline) {
        timer = setTimeout(() => void check(), 4000);
      } else {
        setStage('failed');
        setError(uiText("A szerver még nem igazolta vissza, hogy az oldal megnyitható. Ellenőrizd később az elérhetőséget.", "The server has yet to confirm the site is live. Check the public address again later."));
      }
    }

    timer = setTimeout(() => void check(), 1500);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [deployment]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!slugPattern.test(slug) || busy || disabled) {
      return;
    }

    setStage('building');
    setDeployment(undefined);
    setError('');

    try {
      const files = await collectProjectBuild(AbortSignal.timeout(120000), { publication: true });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(110000),
        body: JSON.stringify({ slug, projectId, files }),
      });

      const result = (await response.json()) as Partial<Deployment> & { error?: string };

      if (!response.ok || !result.deploymentId || !result.domain || !result.digest) {
        throw new Error(result.error || uiText("A közzététel nem indult el.", "Publishing could not start."));
      }

      setDeployment({ deploymentId: result.deploymentId, domain: result.domain, digest: result.digest, slug });
      setStage('deploying');
    } catch (error) {
      setStage('failed');
      setError(
        error instanceof Error && error.name !== 'TimeoutError'
          ? error.message
          : uiText("A közzététel túllépte a várakozási időt.", "Publishing timed out."),
      );
    }
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className={actionClass} disabled={disabled} title={uiText("Közzététel a TZSVTAV szerverén", "Publish on the TZSVTAV server")}>
          <span aria-hidden="true" className="i-ph:globe-hemisphere-west" />
          {uiText("Közzététel", "Publish")}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[300] bg-black/65" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[301] w-[min(94vw,30rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 text-bolt-elements-textPrimary shadow-xl">
          <Dialog.Title className="text-lg font-semibold">{uiText("Közzététel saját szerveren", "Publish to your server")}</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-bolt-elements-textSecondary">
            {uiText("A projekt kész fájljai nyilvánosan megnyithatók lesznek az alábbi címen.", "Your published project will be publicly accessible at this address.")}
          </Dialog.Description>
          <form onSubmit={publish} className="mt-5 space-y-4">
            <div>
              <label htmlFor="bolt-publish-slug" className="block text-sm font-medium">
                {uiText("Webcím", "Web address")}
              </label>
              <input
                id="bolt-publish-slug"
                required
                maxLength={48}
                pattern="[a-z0-9](?:[a-z0-9\\-]{0,46}[a-z0-9])?"
                className="mt-1.5 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm focus:outline focus:outline-2"
                value={slug}
                onChange={(event) => setSlug(event.target.value.toLowerCase())}
                disabled={busy}
                aria-describedby="bolt-publish-domain"
              />
              <p id="bolt-publish-domain" className="mt-1 break-all text-sm text-bolt-elements-textSecondary">
                https://{slug}
                {domainSuffix}
              </p>
            </div>
            {busy && (
              <p role="status" className="text-sm">
                {stage === 'building'
                  ? uiText("A projekt fordítása…", "Building the project…")
                  : stage === 'checking'
                    ? uiText("A nyilvános cím ellenőrzése…", "Checking the public address…")
                    : uiText("Telepítés a szerverre…", "Deploying to the server…")}
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-bolt-elements-textPrimary">
                {error}
              </p>
            )}
            {stage === 'ready' && deployment && (
              <a
                href={deployment.domain}
                target="_blank"
                rel="noreferrer"
                className="block text-sm font-medium underline"
                role="status"
              >
                {uiText("Az oldal megnyitása ↗", "Open website ↗")}
              </a>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Dialog.Close className="rounded-md px-3 py-1.5 text-sm text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3">
                {uiText("Bezárás", "Close")}
              </Dialog.Close>
              <button type="submit" disabled={busy || disabled || !slugPattern.test(slug)} className={actionClass}>
                {stage === 'ready' ? uiText("Új verzió közzététele", "Publish new version") : uiText("Közzététel indítása", "Start publishing")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
