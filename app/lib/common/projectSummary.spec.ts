import type { UIMessage } from 'ai';
import { describe, it, expect } from 'vitest';
import { projectSummary } from './projectSummary';

const text = (value: string, role = 'assistant') =>
  ({ id: 'm', role, parts: [{ type: 'text', text: value }] }) as UIMessage;
describe('project file evidence', () => {
  it('does not turn plain conversations or user example code into projects', () => {
    expect(projectSummary([text('OXY connection verified')], { files: {} }).hasFiles).toBe(false);
    expect(
      projectSummary([text('<boltAction type="file" filePath="index.html">example</boltAction>', 'user')]).hasFiles,
    ).toBe(false);
  });
  it('recognizes snapshot-only and legacy generated projects irrespective of their name', () => {
    expect(projectSummary([], { files: { 'src/App.tsx': { type: 'file' }, src: { type: 'folder' } } })).toEqual({
      hasFiles: true,
      fileCount: 1,
    });
    expect(projectSummary([text('<boltAction type="file" filePath="index.html">site</boltAction>')]).hasFiles).toBe(
      true,
    );
  });
  it('counts successful native file writes and ignores failed writes and read-only tools', () => {
    const message = {
      id: 'm',
      role: 'assistant',
      parts: [
        {
          type: 'tool-project_write_file',
          state: 'output-available',
          toolCallId: '1',
          input: { path: 'src/App.tsx' },
          output: { ok: true },
        },
        {
          type: 'tool-project_write_file',
          state: 'output-available',
          toolCallId: '2',
          input: { path: 'bad.tsx' },
          output: { isError: true },
        },
        {
          type: 'tool-project_read_file',
          state: 'output-available',
          toolCallId: '3',
          input: { path: 'other.tsx' },
          output: { content: 'existing' },
        },
      ],
    } as UIMessage;
    expect(projectSummary([message])).toEqual({ hasFiles: true, fileCount: 1 });
  });
});
