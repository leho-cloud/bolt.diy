import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import JSZip from 'jszip';
import { createPublisher } from './publish.mjs';

const origin = 'https://builder.tzsvthosting.com';
const endpoint = origin + '/api/project-publish';
const domain = 'https://iskola.builder.tzsvtav.com';
const entry = { path: 'index.html', base64: Buffer.from('<h1>Iskola</h1>').toString('base64') };
const request = (payload) =>
  new Request(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: '13-test-0', slug: 'iskola', files: [entry], ...payload }),
  });

async function setup(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'bolt-publish-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const calls = [];
  const fetcher = async (target, init) => {
    const url = new URL(target);
    calls.push({ method: init?.method || 'GET', path: url.pathname, data: init?.body && JSON.parse(init.body) });
    switch (url.pathname) {
      case '/api/v1/applications':
        return Response.json(options.applications || []);
      case '/api/v1/deployments/applications/app-id':
        return Response.json({ deployments: options.history || [] });
      case '/api/v1/applications/app-id':
      case '/api/v1/applications/dockerfile':
        return Response.json({ uuid: 'app-id' });
      case '/api/v1/deploy':
        return Response.json({ deployments: [{ resource_uuid: 'app-id', deployment_uuid: 'deploy-id' }] });
      case '/api/v1/deployments/deploy-id':
        return Response.json({ status: options.status ?? 'finished' });
      case '/bolt-release.txt':
        return new Response(options.digest || '', { headers: { 'Content-Length': '64' } });
      default:
        throw new Error('Unexpected request');
    }
  };
  const publisher = createPublisher(
    directory,
    {
      COOLIFY_API_URL: 'https://coolify.example.test/api/v1',
      COOLIFY_API_TOKEN: 'test-key',
      COOLIFY_PROJECT_UUID: 'test-project',
      COOLIFY_SERVER_UUID: 'test-server',
    },
    fetcher,
  );
  return { publisher, calls };
}

test('publishes a downloadable build bundle and returns ready only after HTTPS serves the matching version', async (t) => {
  const options = {};
  const { publisher, calls } = await setup(t, options);
  const result = await publisher.handle(request({}));
  assert.equal(result.status, 202);
  const { deploymentId, digest, domain: url } = await result.json();
  assert.equal(url, domain);
  assert.deepEqual(
    calls.map(({ method, path }) => [method, path]),
    [
      ['GET', '/api/v1/applications'],
      ['POST', '/api/v1/applications/dockerfile'],
      ['POST', '/api/v1/deploy'],
    ],
  );
  const definition = Buffer.from(calls[1].data.dockerfile, 'base64').toString('utf8');
  const address = definition.match(/^ADD (https:\/\/\S+) /m)?.[1];
  assert.match(
    address || '',
    /^https:\/\/builder\.tzsvthosting\.com\/api\/project-publish-bundle\/iskola\/[a-f0-9]{64}\.zip$/,
  );
  const bundle = await publisher.handleBundle(new Request(address));
  assert.equal(bundle.status, 200);
  assert.equal(bundle.headers.get('Content-Type'), 'application/zip');
  const bytes = Buffer.from(await bundle.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'), digest);
  const zip = await JSZip.loadAsync(bytes);
  assert.equal(await zip.file('index.html').async('string'), '<h1>Iskola</h1>');
  assert.equal(
    (await publisher.handleBundle(new Request(address.replace(/\w{64}\.zip$/, '0'.repeat(64) + '.zip')))).status,
    404,
  );
  const status = () =>
    publisher.handle(new Request(endpoint + '?' + new URLSearchParams({ slug: 'iskola', id: deploymentId, digest })));
  assert.deepEqual(await (await status()).json(), { state: 'checking' });
  options.digest = digest;
  assert.deepEqual(await (await status()).json(), { state: 'ready' });
});

test('rejects file escapes and foreign domains before changing anything on Coolify', async (t) => {
  const { publisher, calls } = await setup(t, { applications: [{ fqdn: domain, uuid: 'other-id' }] });
  for (const path of ['../index.html', '.env.json', '/index.html', 'assets\\bad.js']) {
    const result = await publisher.handle(request({ files: [{ ...entry, path }] }));
    assert.equal(result.status, 400);
  }
  assert.equal(calls.length, 0);
  assert.equal((await publisher.handle(request({}))).status, 409);
  assert.deepEqual(
    calls.map(({ method }) => method),
    ['GET'],
  );
});

test('updates only the existing project and waits for its previous deployment to finish', async (t) => {
  const options = {
    applications: [
      { fqdn: domain, uuid: 'app-id', build_pack: 'dockerfile', description: 'Bolt statikus projekt: 13-test-0' },
    ],
    history: [{ status: 'in_progress' }],
  };
  const { publisher, calls } = await setup(t, options);
  assert.equal((await publisher.handle(request({}))).status, 409);
  assert.ok(calls.every(({ method }) => method === 'GET'));
  options.history[0].status = 'finished';
  assert.equal((await publisher.handle(request({}))).status, 202);
  assert.equal(calls.at(-2).method, 'PATCH');
  assert.equal(calls.at(-2).path, '/api/v1/applications/app-id');
});
