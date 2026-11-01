import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openPrivateAccess } from './store.mjs';
import { createAccessGate, safeDestination } from './gate.mjs';
const origin = 'https://builder.tzsvthosting.com';
const password = 'Csak-helyi-jelszo-2026';
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'bolt-access-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const gate = await createAccessGate(dir);
  return { dir, gate, token: (await readFile(join(dir, 'owner-enrollment'), 'utf8')).trim() };
}
function request(path, { cookie, body, origin: source = origin, method = body ? 'POST' : 'GET' } = {}) {
  return new Request(origin + path, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { origin: source, 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: body ? new URLSearchParams(body) : undefined,
  });
}
const cookieOf = (response) => response.headers.get('Set-Cookie').split(';')[0];
async function owner(f) {
  return f.gate.handle(request('/belepes', { body: { action: 'enroll', username: 'leho', password, token: f.token } }));
}

test('anonymous welcome is public while deep pages and every sensitive API remain gated', async (t) => {
  const f = await fixture(t);
  const home = await f.gate.handle(request('/'));
  assert.equal(home.status, 200);
  assert.equal(home.headers.get('Referrer-Policy'), 'same-origin');
  const html = await home.text();
  assert.match(html, /Lépj be a Műhelybe/);
  assert.doesNotMatch(html, new RegExp(f.token));
  for (const path of [
    '/api/chat',
    '/api/llmcall',
    '/api/visual-review',
    '/api/export-api-keys',
    '/api/system/diagnostics',
    '/api/git-proxy/repo',
  ])
    assert.equal((await f.gate.handle(request(path))).status, 401, path);
  const deep = await f.gate.handle(request('/chat/6'));
  assert.equal(deep.status, 303);
  assert.equal(deep.headers.get('Location'), '/belepes?next=%2Fchat%2F6');
  assert.equal(await f.gate.handle(request('/api/health')), null);
});
test('owner setup is secret, atomic and one-use; credentials never appear in disk or public pages', async (t) => {
  const f = await fixture(t);
  assert.equal(
    (
      await f.gate.handle(
        request('/belepes', { body: { action: 'enroll', username: 'attacker', password, token: '0'.repeat(64) } }),
      )
    ).status,
    403,
  );
  const result = await owner(f);
  assert.equal(result.status, 303);
  assert.match(result.headers.get('Set-Cookie'), /Secure; HttpOnly; SameSite=Lax/);
  const contents = await readFile(join(f.dir, 'access-v1.json'), 'utf8');
  assert.doesNotMatch(contents, new RegExp(f.token));
  assert.doesNotMatch(contents, new RegExp(password));
  assert.equal((await stat(join(f.dir, 'access-v1.json'))).mode & 0o777, 0o600);
  const duplicate = await owner(f);
  assert.equal(duplicate.status, 403);
  assert.equal(f.gate.store.list(f.gate.store.session(cookieOf(result).split('=')[1])).users.length, 1);
});
test('login rejects forged cookies and wrong origin before any mutation', async (t) => {
  const f = await fixture(t);
  await owner(f);
  assert.equal(
    (await f.gate.handle(request('/api/chat', { cookie: '__Host-muhely_access=' + 'a'.repeat(64) }))).status,
    401,
  );
  const bad = await f.gate.handle(
    request('/belepes', { body: { action: 'login', username: 'leho', password }, origin: 'https://evil.test' }),
  );
  assert.equal(bad.status, 403);
  const wrong = await f.gate.handle(
    request('/belepes', { body: { action: 'login', username: 'leho', password: 'wrong-password' } }),
  );
  assert.equal(wrong.status, 401);
  const login = await f.gate.handle(
    request('/belepes', { body: { action: 'login', username: 'leho', password, next: 'https://evil.test' } }),
  );
  assert.equal(login.status, 303);
  assert.equal(login.headers.get('Location'), '/muhely');
  assert.equal(await f.gate.handle(request('/api/chat', { cookie: cookieOf(login) })), null);
});
test('invites are one-use, owner-only; members have separate browser database names and cannot administer deployment', async (t) => {
  const f = await fixture(t),
    login = await owner(f),
    ownerCookie = cookieOf(login),
    actor = f.gate.store.session(ownerCookie.split('=')[1]);
  const invite = await f.gate.store.invite(actor, 'anna');
  const result = await f.gate.handle(
    request('/belepes', { body: { action: 'enroll', username: 'anna', password, token: invite.secret } }),
  );
  const memberCookie = cookieOf(result);
  assert.equal(await f.gate.handle(request('/api/chat', { cookie: memberCookie })), null);
  assert.equal(
    await f.gate.handle(
      request('/api/github-template?repo=blueberry-llm/bolt-vite-react-ts-template', { cookie: memberCookie }),
    ),
    null,
  );
  assert.equal(
    (await f.gate.handle(request('/api/github-template?repo=leho-cloud/private-repo', { cookie: memberCookie })))
      .status,
    403,
  );
  for (const path of [
    '/api/coolify-publish',
    '/api/mcp-update-config',
    '/api/export-api-keys',
    '/api/system/diagnostics',
  ])
    assert.equal((await f.gate.handle(request(path, { cookie: memberCookie }))).status, 403, path);
  assert.equal((await f.gate.handle(request('/hozzaferesek', { cookie: memberCookie }))).status, 403);
  const profile = await (await f.gate.handle(request('/api/private-access/me', { cookie: memberCookie }))).json();
  assert.match(profile.database, /^boltHistory-[a-f0-9-]{36}$/);
  assert.equal(
    (await (await f.gate.handle(request('/api/private-access/me', { cookie: ownerCookie }))).json()).database,
    'boltHistory',
  );
  assert.equal(
    (
      await f.gate.handle(
        request('/belepes', { body: { action: 'enroll', username: 'anna', password, token: invite.secret } }),
      )
    ).status,
    403,
  );
  assert.doesNotMatch(await readFile(join(f.dir, 'access-v1.json'), 'utf8'), new RegExp(invite.secret));
  await f.gate.store.revoke(actor, 'anna');
  assert.equal((await f.gate.handle(request('/api/chat', { cookie: memberCookie }))).status, 401);
});
test('sessions survive restart, logout/revocation and password changes revoke existing sessions', async (t) => {
  const f = await fixture(t),
    login = await owner(f),
    cookie = cookieOf(login),
    reopened = await createAccessGate(f.dir);
  assert.equal(await reopened.handle(request('/api/chat', { cookie })), null);
  const changed = await reopened.handle(
    request('/fiokom', { cookie, body: { oldPassword: password, password: 'Uj-belépési-jelszo-2026' } }),
  );
  assert.equal(changed.status, 303);
  assert.equal((await reopened.handle(request('/api/chat', { cookie }))).status, 401);
  const fresh = await reopened.handle(
    request('/belepes', { body: { action: 'login', username: 'leho', password: 'Uj-belépési-jelszo-2026' } }),
  );
  assert.equal(fresh.status, 303);
  assert.equal((await reopened.handle(request('/kijelentkezes', { cookie: cookieOf(fresh), body: {} }))).status, 303);
  assert.equal((await reopened.handle(request('/api/chat', { cookie: cookieOf(fresh) }))).status, 401);
});
test('expired invitations/sessions fail closed and corrupt state cannot open access', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'bolt-access-clock-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let now = 1800000000000;
  const store = await openPrivateAccess(dir, { now: () => now }),
    token = await readFile(join(dir, 'owner-enrollment'), 'utf8'),
    login = await store.enroll('leho', password, token),
    inv = await store.invite(login.user, 'anna');
  now += 4 * 86400000;
  await assert.rejects(store.enroll('anna', password, inv.secret), (e) => e.status === 403);
  now += 4 * 86400000;
  assert.equal(store.session(login.secret), null);
  await writeFile(join(dir, 'access-v1.json'), '{broken');
  await assert.rejects(openPrivateAccess(dir));
});
test('login retries are bounded and unsafe redirects cannot escape the application', async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 8; i++)
    assert.equal(
      (await f.gate.handle(request('/belepes', { body: { action: 'login', username: 'none', password: 'wrong' } })))
        .status,
      401,
    );
  assert.equal(
    (await f.gate.handle(request('/belepes', { body: { action: 'login', username: 'none', password: 'wrong' } })))
      .status,
    429,
  );
  for (const path of ['https://evil.test', '//evil.test', '/\\evil.test', '/belepes', '/kijelentkezes', '\r\nX: bad'])
    assert.equal(safeDestination(path), '/muhely');
  assert.equal(safeDestination('/chat/6?x=1'), '/chat/6?x=1');
});
