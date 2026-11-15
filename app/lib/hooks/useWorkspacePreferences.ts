import { useEffect, useState } from 'react';
import { workspaceContextSchema, workspaceHeaders, type WorkspaceContext } from '~/lib/common/workspacePreferences';

export function useWorkspacePreferences(project: string | undefined) {
  const [workspace, setWorkspace] = useState<WorkspaceContext>();

  useEffect(() => {
    const controller = new AbortController();
    setWorkspace(undefined);
    void fetch('/api/workspace-preferences', { headers: workspaceHeaders(project), signal: controller.signal })
      .then(async (response) => {
        if (response.ok) {
          const workspace = workspaceContextSchema.safeParse(await response.json()).data;
          if (!controller.signal.aborted) setWorkspace(workspace);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [project]);

  return workspace;
}
