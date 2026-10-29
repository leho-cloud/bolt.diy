import { describe, expect, it } from 'vitest';
import { assertTextContinuation } from './continuation';
import OpenRouterProvider from '~/lib/modules/llm/providers/open-router';
describe('native file-write truncation', () => {
  it('stops incomplete tool JSON instead of recursively restarting a file write', () => {
    expect(() => assertTextContinuation(true)).toThrow('hosszkorlátot');
    expect(() => assertTextContinuation(false)).not.toThrow();
  });
  it('allocates a code-writing budget rather than the old 4096-token generic fallback', () => {
    const model = new OpenRouterProvider().staticModels.find((model) => model.name === 'anthropic/claude-sonnet-5.5');
    expect(model?.maxCompletionTokens).toBe(16384);
  });
});
