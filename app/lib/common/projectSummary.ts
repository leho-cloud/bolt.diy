import type { UIMessage } from 'ai';
import {
  getMessageParts,
  getMessageText,
  getToolInput,
  getToolName,
  getToolOutput,
} from '~/lib/persistence/messageMigration';

/** File evidence separates built projects from plain conversations; names do not. */
export function projectSummary(
  messages: UIMessage[],
  snapshot?: { files?: Record<string, { type?: string } | undefined> },
) {
  const paths = new Set(
    Object.entries(snapshot?.files ?? {})
      .filter(([, file]) => file?.type === 'file')
      .map(([path]) => path),
  );

  for (const message of messages) {
    if (message.role !== 'assistant') {
      continue;
    }

    for (const match of (getMessageText(message) ?? '').matchAll(
      /<boltAction\b(?=[^>]*\btype=["']file["'])[^>]*\bfilePath=["']([^"']+)["']/g,
    )) {
      paths.add(match[1]);
    }

    for (const part of getMessageParts(message) ?? []) {
      const name = getToolName(part);
      const output = getToolOutput(part) as { isError?: boolean } | undefined;

      if (
        part.state !== 'output-available' ||
        output?.isError ||
        !['project_write_file', 'project_patch_file'].includes(name ?? '')
      ) {
        continue;
      }

      const input = getToolInput(part) as { path?: string; filePath?: string } | undefined;
      const path = input?.path ?? input?.filePath;

      if (path) {
        paths.add(path);
      }
    }
  }

  return { hasFiles: paths.size > 0, fileCount: paths.size };
}
