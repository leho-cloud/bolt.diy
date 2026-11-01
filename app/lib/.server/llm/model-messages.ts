import { convertToModelMessages, pruneMessages, type UIMessage, type ToolSet } from 'ai';

/** Pruning uses model-message content; UI messages carry their content in parts. */
export async function prepareModelMessages(messages: UIMessage[], tools?: ToolSet) {
  const converted = await convertToModelMessages(messages, { ignoreIncompleteToolCalls: true, tools });
  const currentTurn = converted.findLastIndex((message) => message.role === 'user');

  /*
   * Preserve the WHOLE current tool loop, including signed reasoning blocks.
   * Only earlier, completed turns lose private deliberation; requests, files,
   * references and complete tool call/result pairs remain untouched.
   */
  if (currentTurn <= 0) {
    return pruneMessages({ messages: converted });
  }

  return [
    ...pruneMessages({ messages: converted.slice(0, currentTurn), reasoning: 'all' }),
    ...pruneMessages({ messages: converted.slice(currentTurn) }),
  ];
}
