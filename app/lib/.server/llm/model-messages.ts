import { convertToModelMessages, pruneMessages, type UIMessage, type ToolSet } from 'ai';

/** Pruning uses model-message content; UI messages carry their content in parts. */
export async function prepareModelMessages(messages: UIMessage[], tools?: ToolSet) {
  return pruneMessages({
    messages: await convertToModelMessages(messages, { ignoreIncompleteToolCalls: true, tools }),
  });
}
