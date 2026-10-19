import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublisherServer } from './tzsvtav-publisher-server.mjs';
async function run(env, check) {
  let calls = 0;
  const server = createPublisherServer({
    env,
    handler: async ({ request }) => {
      calls++;
      assert.equal(request.headers.get('x-publish-key'), 'test-key');
      return Response.json({ status: 'queued', commit: 'a'.repeat(40) });
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await check('http://127.0.0.1:' + server.address().port, () => calls);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
test('adapter defaults disabled and never calls publishing route; health exposes no secrets', async () => {
  await run({ COOLIFY_API_TOKEN: 'secret' }, async (base, calls) => {
    const health = await (await fetch(base + '/health')).json();
    assert.equal(health.publishingEnabled, false);
    assert.equal(JSON.stringify(health).includes('secret'), false);
    assert.equal((await fetch(base + '/api/coolify-publish', { method: 'POST' })).status, 503);
    assert.equal(calls(), 0);
  });
});
test('enabled adapter rejects browser requests, legacy sources and oversized bodies before dispatch', async () => {
  await run({ TZSVTAV_PUBLISH_ENABLED: '1' }, async (base, calls) => {
    const post = (data, headers = {}) =>
      fetch(base + '/api/coolify-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(data),
      });
    assert.equal((await post({ source: 'private-github-app' }, { Origin: 'https://other.invalid' })).status, 403);
    assert.equal((await post({})).status, 400);
    assert.equal((await post({ source: 'private-github-app', extra: 'x'.repeat(9000) })).status, 413);
    assert.equal(calls(), 0);
    assert.equal((await post({ source: 'private-github-app' }, { 'x-publish-key': 'test-key' })).status, 200);
    assert.equal(calls(), 1);
  });
});
