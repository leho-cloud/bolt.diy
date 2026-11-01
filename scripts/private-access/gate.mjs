import { openPrivateAccess } from './store.mjs';
import { loginPage, accountPage, accessPage, page, enrollmentScript } from './pages.mjs';

const cookieName = '__Host-muhely_access';
// Only the product's existing public starters may use the shared template adapter.
const publicStarters = new Set(
  [
    'bolt-expo-template',
    'bolt-astro-basic-template',
    'bolt-nextjs-shadcn-template',
    'vite-shadcn',
    'bolt-qwik-ts-template',
    'bolt-remix-ts-template',
    'bolt-slidev-template',
    'bolt-sveltekit-template',
    'vanilla-vite-template',
    'bolt-vite-react-ts-template',
    'bolt-vite-ts-template',
    'bolt-vue-template',
    'bolt-angular-template',
    'solidjs-ts-tw',
  ].map((name) => 'blueberry-llm/' + name),
);
const age = 7 * 86400;
const commonHeaders = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};
export function safeDestination(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value))
    return '/muhely';
  const url = new URL(value, 'https://local.invalid');
  return url.origin === 'https://local.invalid' && !['/belepes', '/kijelentkezes'].includes(url.pathname)
    ? url.pathname + url.search + url.hash
    : '/muhely';
}
const sessionCookie = (secret) =>
  `${cookieName}=${secret}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${secret ? age : 0}`;
export async function createAccessGate(directory, options = {}) {
  const store = await openPrivateAccess(directory, options),
    now = options.now || Date.now,
    buckets = new Map();
  const json = (status, data) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...commonHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  const html = (text, status = 200) =>
    new Response(text, { status, headers: { ...commonHeaders, 'Content-Type': 'text/html; charset=utf-8' } });
  const redirect = (path, secret) =>
    new Response(null, {
      status: 303,
      headers: {
        ...commonHeaders,
        Location: path,
        ...(secret !== undefined ? { 'Set-Cookie': sessionCookie(secret) } : {}),
      },
    });
  function take(key, max) {
    const before = buckets.get(key),
      row = before && now() - before.at < 900000 ? before : { at: now(), count: 0 };
    if (row.count >= max)
      throw Object.assign(Error('Túl sok belépési próbálkozás. Kérjük, próbáld később.'), { status: 429 });
    row.count++;
    buckets.set(key, row);
    if (buckets.size > 3000) for (const [id, r] of buckets) if (now() - r.at >= 900000) buckets.delete(id);
  }
  const basicGuestApis = new Set([
    '/api/chat',
    '/api/llmcall',
    '/api/enhancer',
    '/api/visual-review',
    '/api/web-search',
    '/api/configured-providers',
    '/api/check-env-key',
    '/api/models',
  ]);
  return {
    store,
    async handle(request) {
      const url = new URL(request.url),
        path = url.pathname,
        raw = request.headers
          .get('cookie')
          ?.split(';')
          .map((c) => c.trim())
          .find((c) => c.startsWith(cookieName + '='))
          ?.slice(cookieName.length + 1),
        actor = store.session(raw);
      const mutating = !['GET', 'HEAD'].includes(request.method);
      if (mutating && request.headers.get('origin') !== url.origin)
        return json(403, { error: 'Idegen oldalról érkező kérés nem engedélyezett.' });
      if (path === '/private-access.js' && request.method === 'GET')
        return new Response(enrollmentScript, {
          headers: { ...commonHeaders, 'Content-Type': 'text/javascript; charset=utf-8' },
        });
      if (path === '/api/health' && ['GET', 'HEAD'].includes(request.method)) return null;
      if (path === '/api/private-access/me' && request.method === 'GET')
        return actor
          ? json(200, {
              user: { id: actor.id, username: actor.username, role: actor.role },
              database: actor.role === 'owner' ? 'boltHistory' : 'boltHistory-' + actor.id,
            })
          : json(401, { error: 'Jelentkezz be a Műhelybe.' });
      if (['/', '/nyito'].includes(path) && request.method === 'GET')
        return actor ? redirect('/muhely') : html(loginPage('/muhely', '', store.ready()));
      if (path === '/belepes') {
        if (request.method === 'GET')
          return actor
            ? redirect(safeDestination(url.searchParams.get('next')))
            : html(loginPage(safeDestination(url.searchParams.get('next')), '', store.ready()));
        if (request.method !== 'POST') return json(405, { error: 'POST szükséges.' });
        let next = '/muhely';
        try {
          take('all-login', 100);
          const data = new URLSearchParams(await request.text());
          next = safeDestination(data.get('next'));
          take('name:' + data.get('username'), 8);
          let result;
          if (data.get('action') === 'enroll')
            result = await store.enroll(data.get('username'), data.get('password'), data.get('token'));
          else if (data.get('action') === 'login')
            result = await store.login(data.get('username'), data.get('password'));
          else throw Object.assign(Error('Ismeretlen belépési művelet.'), { status: 400 });
          return redirect(next, result.secret);
        } catch (error) {
          return html(
            loginPage(next, error.status ? error.message : 'A belépés most nem sikerült. Próbáld újra.', store.ready()),
            error.status || 503,
          );
        }
      }
      if (!actor)
        return path.startsWith('/api/')
          ? json(401, { error: 'Jelentkezz be a Műhelybe.', loginUrl: '/belepes' })
          : redirect('/belepes?next=' + encodeURIComponent(safeDestination(path + url.search)));
      if (path === '/kijelentkezes') {
        if (request.method !== 'POST')
          return html(
            page(
              'Kijelentkezés',
              '<main><section class="card"><h1>Kijelentkezés</h1><form action="/kijelentkezes" method="post"><button class="primary">Kijelentkezés</button></form></section></main>',
            ),
          );
        await store.logout(raw);
        return redirect('/belepes', '');
      }
      if (path === '/fiokom') {
        if (request.method === 'GET') return html(accountPage(actor));
        if (request.method !== 'POST') return json(405, { error: 'POST szükséges.' });
        try {
          take('password:' + actor.id, 8);
          const data = new URLSearchParams(await request.text());
          await store.changePassword(actor, data.get('oldPassword'), data.get('password'));
          return redirect('/belepes', '');
        } catch (error) {
          return html(
            accountPage(actor, error.status ? error.message : 'A jelszó most nem módosítható.'),
            error.status || 503,
          );
        }
      }
      if (path === '/hozzaferesek') {
        if (actor.role !== 'owner')
          return html(
            page(
              'Hozzáférés',
              '<main><section class="card"><h1>Ezt a tulajdonos kezeli.</h1><p>A meghívókhoz és a hozzáférések kezeléséhez tulajdonosi belépés szükséges.</p><a class="button" href="/fiokom">Saját belépésem →</a></section></main>',
            ),
            403,
          );
        if (request.method === 'GET') return html(accessPage(actor, store.list(actor)));
        if (request.method !== 'POST') return json(405, { error: 'POST szükséges.' });
        try {
          const data = new URLSearchParams(await request.text());
          let invitation = null;
          if (data.get('action') === 'invite') {
            const result = await store.invite(actor, data.get('username'));
            invitation =
              url.origin + '/belepes#' + new URLSearchParams({ meghivo: result.secret, nev: result.username });
          } else if (data.get('action') === 'revoke') await store.revoke(actor, data.get('username'));
          else throw Object.assign(Error('Ismeretlen művelet.'), { status: 400 });
          return html(accessPage(actor, store.list(actor), invitation));
        } catch (error) {
          return html(
            accessPage(actor, store.list(actor), null, error.status ? error.message : 'A módosítás most nem menthető.'),
            error.status || 503,
          );
        }
      }
      if (
        path === '/api/github-template' &&
        request.method === 'GET' &&
        publicStarters.has(url.searchParams.get('repo'))
      )
        return null;
      if (
        path.startsWith('/api/') &&
        actor.role !== 'owner' &&
        !basicGuestApis.has(path) &&
        !path.startsWith('/api/models/')
      )
        return json(403, { error: 'Ezt a műveletet csak a Műhely tulajdonosa használhatja.' });
      return null;
    },
  };
}
