import { tool, type UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { prepareModelMessages } from './model-messages';

describe('prepareModelMessages', () => {
  it('omits old deliberation but preserves user preferences and the entire current signed tool loop', async () => {
    const result = await prepareModelMessages([
      { id: 'original', role: 'user', parts: [{ type: 'text', text: 'Preserve the green design and all pages' }] },
      {
        id: 'old',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 'old private deliberation' },
          { type: 'text', text: 'The design is saved.' },
        ],
      },
      { id: 'new', role: 'user', parts: [{ type: 'text', text: 'Fix the menu' }] },
      {
        id: 'working',
        role: 'assistant',
        parts: [
          {
            type: 'reasoning',
            text: 'current signed reasoning',
            providerMetadata: { anthropic: { signature: 'signed' } },
          },
          {
            type: 'tool-project_list_paths',
            toolCallId: 'current-call',
            state: 'output-available',
            input: {},
            output: { entries: [{ path: 'src/App.jsx', type: 'file' }] },
          },
        ],
      },
    ]);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('old private deliberation');
    expect(serialized).toContain('Preserve the green design and all pages');
    expect(serialized).toContain('The design is saved.');
    expect(serialized).toContain('current signed reasoning');
    expect(serialized).toContain('signed');
    expect(result.at(-1)).toMatchObject({
      role: 'tool',
      content: [expect.objectContaining({ toolCallId: 'current-call' })],
    });
  });
  it('passes reference screenshots to the vision model rather than flattening them to base64 text', async () => {
    const referenceTool = tool({
      inputSchema: z.object({}),
      toModelOutput: () => ({
        type: 'content' as const,
        value: [
          { type: 'text' as const, text: 'reference layout' },
          { type: 'image-data' as const, data: 'UklGRg==', mediaType: 'image/webp' },
        ],
      }),
    });

    const tools = { website_reference: referenceTool };

    const result = await prepareModelMessages(
      [
        {
          id: 'ref',
          role: 'assistant',
          parts: [
            {
              type: 'tool-website_reference',
              toolCallId: 'reference',
              state: 'output-available',
              input: {},
              output: { sourceUrl: 'https://mingai.hu/' },
            },
          ],
        },
      ],
      tools,
    );
    expect(result[1].content).toEqual([
      expect.objectContaining({
        output: expect.objectContaining({
          type: 'content',
          value: expect.arrayContaining([expect.objectContaining({ type: 'image-data', mediaType: 'image/webp' })]),
        }),
      }),
    ]);
  });
  it('preserves consecutive completed tool calls when the recent context has no text messages', async () => {
    const messages: UIMessage[] = Array.from({ length: 3 }, (_, index) => ({
      id: `assistant-${index}`,
      role: 'assistant',

      // Tool-only assistant replies have empty legacy content in persisted chats.
      content: '',
      parts: [
        {
          type: 'tool-project_list_paths',
          toolCallId: `call-${index}`,
          state: 'output-available',
          input: {},
          output: { entries: [{ path: 'package.json', type: 'file' }] },
        },
      ],
    }));

    const result = await prepareModelMessages(messages);

    expect(result.map((message) => message.role)).toEqual([
      'assistant',
      'tool',
      'assistant',
      'tool',
      'assistant',
      'tool',
    ]);
    expect(result[0].content).toEqual([
      expect.objectContaining({ type: 'tool-call', toolCallId: 'call-0', toolName: 'project_list_paths' }),
    ]);
    expect(result[5].content).toEqual([expect.objectContaining({ type: 'tool-result', toolCallId: 'call-2' })]);
  });

  it('preserves a user request while dropping empty assistant messages', async () => {
    const result = await prepareModelMessages([
      { id: 'user', role: 'user', parts: [{ type: 'text', text: 'Start the preview' }] },
      { id: 'empty', role: 'assistant', parts: [] },
    ]);

    expect(result).toEqual([{ role: 'user', content: [{ type: 'text', text: 'Start the preview' }] }]);
  });

  it('drops interrupted tool calls so a later user request does not require missing tool results', async () => {
    const result = await prepareModelMessages([
      { id: 'user', role: 'user', parts: [{ type: 'text', text: 'Start the preview' }] },
      {
        id: 'interrupted',
        role: 'assistant',
        parts: [
          {
            type: 'tool-project_run_command',
            toolCallId: 'unfinished',
            state: 'input-available',
            input: { command: 'npm run dev', purpose: 'run' },
          },
        ],
      },
      { id: 'retry', role: 'user', parts: [{ type: 'text', text: 'Continue the preview' }] },
    ]);

    expect(result.map((message) => message.role)).toEqual(['user', 'user']);
    expect(JSON.stringify(result)).not.toContain('unfinished');
  });
});
