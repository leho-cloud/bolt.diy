import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState } from 'react';
import { buildStatus, formatBuildDuration } from './build-status-state';
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

  const state = buildStatus(
    messages,
    active,
    previews.some((preview) => preview.ready),
    error,
  );

  const lastUser = messages.findLastIndex((message) => message.role === 'user');
  const taskId = lastUser >= 0 ? (messages[lastUser].id ?? `turn-${lastUser}`) : undefined;
  const running = active || state.kind === 'waiting';
  const timing = useRef<{ taskId: string; startedAt: number; finishedAt?: number } | undefined>(undefined);
  const [elapsed, setElapsed] = useState<number>();

  useEffect((): (() => void) | undefined => {
    if (timing.current?.taskId !== taskId) {
      timing.current = undefined;
    }

    if (running && taskId && !timing.current) {
      timing.current = { taskId, startedAt: Date.now() };
    }

    const current = timing.current;

    if (!current) {
      setElapsed(undefined);
      return undefined;
    }

    if (running) {
      current.finishedAt = undefined;
    } else {
      current.finishedAt ??= Date.now();
    }

    const update = () => setElapsed(Math.max(0, (current.finishedAt ?? Date.now()) - current.startedAt));
    update();

    if (!running) {
      return undefined;
    }

    const interval = setInterval(update, 1000);

    return () => clearInterval(interval);
  }, [taskId, running]);

  return (
    <div className={`muhely-build-status muhely-build-status-${state.kind}`}>
      <span className="muhely-build-status-message" role="status" aria-live="polite">
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
      </span>
      {elapsed !== undefined && (
        <span
          className="muhely-build-time"
          role="timer"
          aria-live="off"
          aria-label="Eltelt idő"
          title="A mostani kérés teljes ideje"
        >
          <span aria-hidden="true" className="i-ph:clock" />
          {formatBuildDuration(elapsed)}
        </span>
      )}
    </div>
  );
}
