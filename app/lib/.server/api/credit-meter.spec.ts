import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCreditMeter } from './credit-meter';

afterEach(() => vi.unstubAllGlobals());

describe('credit usage reporting', () => {
  it('uses one request identifier and retries the same cumulative count', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('connection closed'))
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetcher);
    const account = '01234567-89ab-4321-aaaa-111111111111';
    const id = '01234567-89ab-4321-aaaa-111111111112';
    const request = new Request('https://builder.example/api/chat', {
      headers: { 'x-muhely-credit-meter': ['43100', 'a'.repeat(64), account, id].join('|') },
    });
    const record = createCreditMeter(request);
    await record({ totalTokens: 120 });
    await record({ inputTokens: 15, outputTokens: 5 });
    await record(undefined);
    expect(fetcher.mock.calls.map(([, init]) => JSON.parse(init.body))).toEqual([
      { accountId: account, requestId: id, total: 120 },
      { accountId: account, requestId: id, total: 120 },
      { accountId: account, requestId: id, total: 140 },
    ]);
  });
});
