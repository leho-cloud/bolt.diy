import { createScopedLogger } from '~/utils/logger';

type Usage = { totalTokens?: number; inputTokens?: number; outputTokens?: number };

const logger = createScopedLogger('credit-meter');

export function createCreditMeter(request: Request) {
  const context = request.headers.get('x-muhely-credit-meter') || '';
  const match = /^(\d{1,5})\|([a-f0-9]{64})\|([a-f0-9-]{36})\|([a-f0-9-]{36})$/.exec(context);
  let total = 0;

  return async (usage: Usage | undefined) => {
    if (!match || !usage) return;
    const count = usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
    if (!Number.isSafeInteger(count) || count <= 0) return;
    total += count;
    const [, port, secret, accountId, requestId] = match;
    const body = JSON.stringify({ accountId, requestId, total });

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/usage`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
          body,
          signal: AbortSignal.timeout(3000),
        });
        if (response.ok) return;
      } catch {
        // A repeated cumulative report is safe if the first write already succeeded.
      }
    }
    logger.warn('Credit usage could not be recorded');
  };
}
