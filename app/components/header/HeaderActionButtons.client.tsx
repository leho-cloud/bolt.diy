import { useStore } from '@nanostores/react';
import { DeployButton } from '~/components/deploy/DeployButton';
import { uiText } from '~/lib/common/localization/ui';
import type { ProjectOutput } from '~/lib/common/projectOutput';
import { useProjectOutput } from '~/lib/hooks/useProjectOutput';
import { mediaExportOpen } from '~/lib/runtime/previewExport';
import { workbenchStore } from '~/lib/stores/workbench';

export function HeaderActionButtons({ chatStarted }: { chatStarted: boolean }) {
  const files = useStore(workbenchStore.files);
  const { output, setOutput } = useProjectOutput();
  const hasProject = Object.values(files).some((file) => file?.type === 'file');

  if (!chatStarted || !hasProject) {
    return null;
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <select
        aria-label={uiText('Projekt kimenete', 'Project output')}
        value={output}
        onChange={(event) => setOutput(event.target.value as ProjectOutput)}
        className="max-w-36 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-2 py-1.5 text-xs text-bolt-elements-textPrimary"
      >
        <option value="web">{uiText('Weboldal / app', 'Website / app')}</option>
        <option value="image">{uiText('Önálló kép', 'Standalone image')}</option>
        <option value="video">{uiText('Önálló videó', 'Standalone video')}</option>
      </select>
      {output !== 'web' && (
        <button
          type="button"
          onClick={() => mediaExportOpen.set(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-1.5 text-xs font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span aria-hidden="true" className="i-ph:download-simple" />
          {output === 'image' ? uiText('Kép mentése', 'Save image') : uiText('Videó mentése', 'Save video')}
        </button>
      )}
      {output === 'web' && <DeployButton />}
    </div>
  );
}
