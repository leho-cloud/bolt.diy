import { useStore } from '@nanostores/react';
import { atom } from 'nanostores';
import { useEffect } from 'react';
import { inferProjectOutput, type ProjectOutput } from '~/lib/common/projectOutput';
import { chatId, description } from '~/lib/persistence/useChatHistory';

const choices = atom<Record<string, ProjectOutput>>({});
const valid = (value: unknown): value is ProjectOutput => ['web', 'image', 'video'].includes(String(value));

export function useProjectOutput() {
  const id = useStore(chatId);
  const title = useStore(description);
  const selected = useStore(choices);
  const key = id ? `muhely-output:${id}` : undefined;

  useEffect(() => {
    if (!key || !id) {
      return;
    }

    try {
      const saved = localStorage.getItem(key);

      if (valid(saved)) {
        choices.set({ ...choices.get(), [id]: saved });
      }
    } catch {
      // The inferred choice remains available if browser storage is disabled.
    }
  }, [key, id]);

  const output = (id && selected[id]) || inferProjectOutput(title ?? '');

  return {
    output,
    setOutput(value: ProjectOutput) {
      if (!id || !key || !valid(value)) {
        return;
      }

      choices.set({ ...choices.get(), [id]: value });

      try {
        localStorage.setItem(key, value);
      } catch {
        /* Optional browser persistence. */
      }
    },
  };
}
