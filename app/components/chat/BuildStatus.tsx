import { useStore } from '@nanostores/react';
import { buildStatus } from './build-status-state';
import type { AnyMessage } from '~/lib/persistence/messageMigration';
import { workbenchStore } from '~/lib/stores/workbench';
import type { ProgressAnnotation } from '~/types/context';

export function BuildStatus({
  messages,
  active,
  error,
}: {
  messages: AnyMessage[];
  active: boolean;
  error: boolean;
  progress?: ProgressAnnotation[];
}) {
  const previews = useStore(workbenchStore.previews);
  const state = buildStatus(messages, active, previews.length > 0, error);

  return (
    <div role="status" aria-live="polite" className={`muhely-build-status muhely-build-status-${state.kind}`}>
      <span
        aria-hidden="true"
        className={
          state.kind === 'working'
            ? 'i-svg-spinners:90-ring-with-bg'
            : state.kind === 'blocked'
              ? 'i-ph:warning-circle'
              : state.kind === 'ready'
                ? 'i-ph:check-circle'
                : 'i-ph:pause-circle'
        }
      />
      <span>{state.text}</span>
    </div>
  );
}
