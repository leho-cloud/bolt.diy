import { describe, it, expect } from 'vitest';
import { selectTaskModel } from './taskModel';
describe('task model quality routing', () => {
  const base = { selected: 'openrouter/auto', provider: 'OpenRouter', mode: 'economy' as const };
  it('uses the quality route for website and reference work even when an old economy preference is saved', () => {
    for (const text of ['Készíts iskolai weboldalt', 'Ez a minta: https://mingai.hu/', 'Javítsd a designt']) {
      expect(selectTaskModel({ ...base, text })).toBe('anthropic/claude-sonnet-5.5');
    }
  });
  it('preserves explicit manual choice and uses economical routing for small text work', () => {
    expect(selectTaskModel({ ...base, text: 'Cseréld a címet', mode: 'manual' })).toBe('openrouter/auto');
    expect(selectTaskModel({ ...base, text: 'Cseréld a címet' })).toBe('openai/gpt-4o-mini');
  });
});
