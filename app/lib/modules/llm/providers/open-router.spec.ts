import { generateText } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OpenRouterProvider from './open-router';

afterEach(() => vi.unstubAllGlobals());

describe('OpenRouter model catalog', () => {
  it('uses exact prices for free models and excludes models without text output', async () => {
    const entry = {
      name: 'Model',
      context_length: 262144,
      architecture: { output_modalities: ['text'] },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          data: [
            { ...entry, id: 'free', pricing: { prompt: '0', completion: '0' } },
            { ...entry, id: 'paid', pricing: { prompt: '0.000000001', completion: '0.000000001' } },
            {
              ...entry,
              id: 'audio',
              architecture: { output_modalities: ['audio'] },
              pricing: { prompt: '0', completion: '0' },
            },
          ],
        }),
      ),
    );

    const models = await new OpenRouterProvider().getDynamicModels();
    expect(fetch).toHaveBeenCalledWith('https://eu.openrouter.ai/api/v1/models', expect.any(Object));
    expect(models).toHaveLength(2);
    expect(models.find((model) => model.name === 'free')?.isFree).toBe(true);
    expect(models.find((model) => model.name === 'paid')?.isFree).toBe(false);
    expect(models.find((model) => model.name === 'paid')?.label).toContain('in:$0.00');
  });

  it('sends inference to the EU endpoint with no global fallback', async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json({
        id: 'test',
        model: 'anthropic/claude-sonnet-5.5',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Rendben.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    );
    vi.stubGlobal('fetch', request);

    const model = new OpenRouterProvider().getModelInstance({
      model: 'anthropic/claude-sonnet-5.5',
      serverEnv: { OPEN_ROUTER_API_KEY: 'test-key-not-sent' } as Env,
    });

    const result = await generateText({ model, prompt: 'Endpoint test', maxRetries: 0 });
    expect(result.text).toBe('Rendben.');
    expect(String(request.mock.calls[0][0])).toBe('https://eu.openrouter.ai/api/v1/chat/completions');

    const sent = JSON.parse(request.mock.calls[0][1].body);
    expect(sent.model).toBe('anthropic/claude-sonnet-5.5');
    expect(sent.cache_control).toEqual({ type: 'ephemeral' });
    expect(new Headers(request.mock.calls[0][1].headers).get('X-Title')).toBe('TZSVTAV Muhely Bolt');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not send Anthropic cache options to other models', async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json({
        id: 'test',
        model: 'openai/gpt-4o-mini',
        choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    );
    vi.stubGlobal('fetch', request);
    await generateText({
      model: new OpenRouterProvider().getModelInstance({
        model: 'openai/gpt-4o-mini',
        serverEnv: { OPEN_ROUTER_API_KEY: 'test-key-not-sent' } as Env,
      }),
      prompt: 'Test',
      maxRetries: 0,
    });
    expect(JSON.parse(request.mock.calls[0][1].body)).not.toHaveProperty('cache_control');
  });
});
