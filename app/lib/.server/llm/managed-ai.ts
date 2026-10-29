/** AI routing is an operator setting, never a browser preference or credential. */
export function managedAI(env?: unknown, purpose: 'build' | 'assist' = 'assist') {
  const settings = (env ?? {}) as Record<string, unknown>;
  const key = purpose === 'build' ? 'BOLT_AI_MODEL' : 'BOLT_AI_ASSIST_MODEL';
  const fallback = purpose === 'build' ? 'anthropic/claude-sonnet-5.5' : 'openai/gpt-4o-mini';
  const configured = settings[key] ?? process.env[key];

  const model =
    typeof configured === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]*\/[a-zA-Z0-9_:.\/-]+$/.test(configured) ? configured : fallback;

  return { model, provider: 'OpenRouter', apiKeys: {}, providerSettings: {} };
}
