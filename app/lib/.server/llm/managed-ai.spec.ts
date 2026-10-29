import { afterEach, describe, expect, it, vi } from 'vitest';
import { managedAI } from './managed-ai';
import { isCustomerTab } from '~/components/@settings/core/customer-tabs';

afterEach(() => vi.unstubAllEnvs());

describe('operator-managed AI', () => {
  it('uses the quality model for building and the assist model for light tasks', () => {
    expect(managedAI({}, 'build').model).toBe('anthropic/claude-sonnet-5.5');
    expect(managedAI({}).model).toBe('openai/gpt-4o-mini');
  });

  it('accepts model changes only through the server configuration', () => {
    vi.stubEnv('BOLT_AI_MODEL', 'anthropic/operator-model');
    expect(managedAI({}, 'build').model).toBe('anthropic/operator-model');
    expect(managedAI({ BOLT_AI_MODEL: 'openai/worker-model' }, 'build').model).toBe('openai/worker-model');
  });

  it('ignores browser model, provider and credential overrides', () => {
    expect(
      managedAI(
        {
          model: 'expensive/arbitrary',
          provider: 'Other',
          apiKeys: { Other: 'browser-key' },
          providerSettings: { baseUrl: 'https://example.com' },
        },
        'build',
      ),
    ).toEqual({
      model: 'anthropic/claude-sonnet-5.5',
      provider: 'OpenRouter',
      apiKeys: {},
      providerSettings: {},
    });
  });

  it.each(['', 'https://example.com/model', 'bad model', '../model'])('rejects invalid server model %j', (model) => {
    expect(managedAI({ BOLT_AI_MODEL: model }, 'build').model).toBe('anthropic/claude-sonnet-5.5');
  });

  it('never returns server secrets in its routing settings', () => {
    expect(JSON.stringify(managedAI({ OPEN_ROUTER_API_KEY: 'server-secret' }))).not.toContain('server-secret');
  });

  it('blocks operator settings despite restored user preferences or direct tab names', () => {
    for (const tab of ['cloud-providers', 'local-providers', 'mcp', 'plugins']) {
      expect(isCustomerTab(tab)).toBe(false);
    }

    for (const tab of ['settings', 'profile', 'data', 'connectors']) {
      expect(isCustomerTab(tab)).toBe(true);
    }
  });
});
