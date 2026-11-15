import { createUIMessageStream, generateId, type TextStreamPart, type ToolSet, type UIMessage } from 'ai';

/** Continue approved tool calls in the same assistant message and SDK stream state. */
export function createChatUIMessageStream(messages: UIMessage[], options: Parameters<typeof createUIMessageStream>[0]) {
  const lastMessage = messages[messages.length - 1];
  const messageId = lastMessage?.role === 'assistant' ? lastMessage.id : generateId();

  return createUIMessageStream({
    ...options,
    originalMessages: messages,
    execute: ({ writer }) => {
      writer.write({ type: 'start', messageId });
      return options.execute({ writer });
    },
  });
}

/** Keep tool execution errors distinct from failures of the model response stream. */
export class ChatToolStreamError extends Error {
  constructor(readonly toolName: string, cause: unknown) {
    super('Chat tool execution failed.', { cause });
  }
}

export function markChatToolStreamErrors<TOOLS extends ToolSet>(stream: ReadableStream<TextStreamPart<TOOLS>>) {
  return stream.pipeThrough(
    new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      transform(part, controller) {
        if (part.type === 'tool-error' && !part.providerExecuted) {
          controller.enqueue({ ...part, error: new ChatToolStreamError(part.toolName, part.error) });
        } else {
          controller.enqueue(part);
        }
      },
    }),
  );
}
