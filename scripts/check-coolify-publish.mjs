import test from 'node:test';
import assert from 'node:assert/strict';
import { action } from '../app/routes/api.coolify-publish.ts';
const env = {
  COOLIFY_API_URL: 'https://coolify.invalid',
  COOLIFY_API_TOKEN: 'contract-provider-token',
  COOLIFY_PROJECT_UUID: 'project-test',
  COOLIFY_SERVER_UUID: 'server-test',
  COOLIFY_PUBLISH_KEY: 'contract-publish-key',
  COOLIFY_GITHUB_OWNER: 'leho-cloud',
};
const body = { repository: 'https://github.com/leho-cloud/demo', slug: 'demo', branch: 'dev/release-1' };
async function run({
  input = body,
  key = env.COOLIFY_PUBLISH_KEY,
  apps = [],
  detail = { git_repository: body.repository, git_branch: body.branch },
  fail = false,
  method = 'POST',
} = {}) {
  const previous = globalThis.fetch,
    calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    assert.ok(url.startsWith('https://coolify.invalid/api/v1/'));
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, 'Bearer ' + env.COOLIFY_API_TOKEN);
    if (fail) return new Response(JSON.stringify({ message: 'secret ' + env.COOLIFY_API_TOKEN }), { status: 500 });
    if (url.endsWith('/applications')) return Response.json(apps);
    if (url.endsWith('/applications/existing-app')) return Response.json(detail);
    if (url.endsWith('/applications/public')) return Response.json({ uuid: 'new-app' });
    if (url.includes('/deploy?uuid=')) return Response.json({ deployments: [{ deployment_uuid: 'deployment-test' }] });
    throw Error('Unexpected test URL');
  };
  try {
    const request = new Request('https://publisher.invalid/api/coolify-publish', {
      method,
      headers: { 'Content-Type': 'application/json', 'x-publish-key': key },
      ...(method === 'POST' ? { body: JSON.stringify(input) } : {}),
    });
    const response = await action({ request, context: { cloudflare: { env } } });
    return { status: response.status, data: await response.json(), calls };
  } finally {
    globalThis.fetch = previous;
  }
}
test('unauthorized and malformed requests do not touch Coolify', async () => {
  assert.equal((await run({ key: 'wrong' })).status, 403);
  assert.equal((await run({ key: 'wrong' })).calls.length, 0);
  for (const input of [
    null,
    [],
    42,
    { ...body, slug: 42 },
    { ...body, repository: 42 },
    { ...body, branch: '../main' },
    { ...body, branch: 'dev//one' },
    { ...body, branch: 'dev/.hidden' },
    { ...body, branch: 'dev/name.lock' },
    { ...body, repository: 'https://github.com/other/demo' },
  ]) {
    const result = await run({ input });
    assert.equal(result.status, 400);
    assert.equal(result.calls.length, 0);
  }
  assert.equal((await run({ method: 'GET' })).status, 405);
});
test('new application receives the explicit development branch; queueing is not a build success', async () => {
  const result = await run();
  assert.equal(result.status, 200);
  assert.equal(result.data.status, 'queued');
  assert.equal(result.data.branch, body.branch);
  assert.equal(result.calls.find((c) => c.url.endsWith('/applications/public')).body.git_branch, body.branch);
  assert.equal(result.calls.at(-1).method, 'POST');
  const legacy = await run({ input: { repository: body.repository, slug: 'demo' } });
  assert.equal(legacy.calls.find((c) => c.url.endsWith('/applications/public')).body.git_branch, 'main');
});
test('existing domain is reused only after authoritative exact repository and branch checks', async () => {
  for (const git_repository of ['https://github.com/LEHO-CLOUD/DEMO.git/', 'git@github.com:leho-cloud/demo.git']) {
    const result = await run({
      apps: [{ uuid: 'existing-app', fqdn: ' http://demo.builder.tzsvtav.com/ ' }],
      detail: { git_repository, git_branch: body.branch },
    });
    assert.equal(result.status, 200);
    assert.equal(result.calls.filter((c) => c.method === 'POST').length, 1);
    assert.match(result.calls.at(-1).url, /deploy\?uuid=existing-app/);
  }
});
test('prefix collisions, missing source, wrong branch and ambiguous domains cannot deploy or create', async () => {
  for (const detail of [
    { git_repository: 'https://github.com/leho-cloud/demo-old', git_branch: body.branch },
    { git_branch: body.branch },
    { git_repository: body.repository },
    { git_repository: body.repository, git_branch: 'main' },
  ]) {
    const result = await run({ apps: [{ uuid: 'existing-app', fqdn: 'https://demo.builder.tzsvtav.com' }], detail });
    assert.equal(result.status, 409);
    assert.equal(
      result.calls.some((c) => c.method === 'POST'),
      false,
    );
  }
  for (const apps of [
    [{ fqdn: 'https://demo.builder.tzsvtav.com' }],
    [
      { uuid: 'existing-app', fqdn: 'https://demo.builder.tzsvtav.com' },
      { uuid: 'second-app', domains: 'demo.builder.tzsvtav.com' },
    ],
  ]) {
    const result = await run({ apps });
    assert.equal(result.status, 409);
    assert.equal(
      result.calls.some((c) => c.method === 'POST'),
      false,
    );
  }
});
test('malformed application list and upstream errors fail closed without provider secrets', async () => {
  const malformed = await run({ apps: { unexpected: true } });
  assert.equal(malformed.status, 502);
  assert.equal(
    malformed.calls.some((c) => c.method === 'POST'),
    false,
  );
  const failed = await run({ fail: true });
  assert.equal(failed.status, 502);
  assert.doesNotMatch(JSON.stringify(failed.data), /contract-provider-token/);
  assert.equal(failed.calls.length, 1);
});
