import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { useGitHubDeploy } from '~/components/deploy/GitHubDeploy.client';
import { GitHubDeploymentDialog } from '~/components/deploy/GitHubDeploymentDialog';
import { streamingState } from '~/lib/stores/streaming';

export function DeployButton() {
  const isStreaming = useStore(streamingState);
  const { handleGitHubDeploy, isDeploying } = useGitHubDeploy();
  const [deployment, setDeployment] = useState<{ files: Record<string, string>; projectName: string }>();

  async function preparePublication() {
    const result = await handleGitHubDeploy();

    if (result && result.success && result.files) {
      setDeployment({ files: result.files, projectName: result.projectName });
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={isDeploying || isStreaming}
        onClick={() => void preparePublication()}
        className="flex shrink-0 items-center gap-1.5 rounded-md bg-[#b51d3d] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#a91836] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
        title="Közzététel a TZSVTAV szerverén"
      >
        <span aria-hidden="true" className="i-ph:globe-hemisphere-west" />
        {isDeploying ? 'Előkészítés…' : 'Közzététel'}
      </button>
      {deployment && (
        <GitHubDeploymentDialog
          isOpen
          onClose={() => setDeployment(undefined)}
          projectName={deployment.projectName}
          files={deployment.files}
        />
      )}
    </>
  );
}
