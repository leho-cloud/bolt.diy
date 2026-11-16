import { languageCookieName, languageFromCookie, localized } from '../../app/lib/common/localization/language.mjs';
import { join } from 'node:path';
import { createRenderQueue } from '../render/queue.mjs';
import { bundlePrefix, createPublisher, publishPath } from './publish.mjs';
import { welcomePage } from './welcome.mjs';
import { openPrivateAccess } from './store.mjs';
import { parseProjectPreferences, parseWorkspacePreferences, workspaceProjectId } from './workspace-preferences.mjs';
import { loginPage, registrationPage, accountPage, accessPage, page, enrollmentScript } from './pages.mjs';

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
  return url.origin === 'https://local.invalid' &&
    !['/belepes', '/regisztracio', '/kijelentkezes'].includes(url.pathname)
    ? url.pathname + url.search + url.hash
    : '/muhely';
}
const sessionCookie = (secret) =>
  `${cookieName}=${secret}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${secret ? age : 0}`;
export async function createAccessGate(directory, options = {}) {
  const store = await openPrivateAccess(directory, options),
    now = options.now || Date.now,
    buckets = new Map();
  const render = createRenderQueue(
    options.renderQueueDirectory ?? process.env.MUHELY_RENDER_QUEUE,
    join(directory, 'render-owners'),
  );
  const publisher = createPublisher(directory);
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
  function sessionToken(request) {
    return request.headers.get('cookie')?.split(';').map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  }

  function workspaceContext(request) {
    const actor = store.session(sessionToken(request));
    if (!actor) return undefined;
    const project = workspaceProjectId(request.headers.get('x-muhely-project'));
    const { preferences, memory } = store.workspace(actor, project);
    return {
      memoryEnabled: preferences.memoryEnabled,
      repairEnabled: preferences.repairEnabled,
      repairRounds: preferences.repairRounds,
      ...(preferences.ledEnabled ? { led: (preferences.memoryEnabled && memory?.led) || preferences.led } : {}),
      ...(preferences.memoryEnabled && memory ? { notes: memory.notes, repairs: memory.repairs } : {}),
    };
  }

  return {
    store,
    workspaceContext,
    async handle(request) {
      const url = new URL(request.url), path = url.pathname, raw = sessionToken(request);
      const actor = store.session(raw);
      const language = languageFromCookie(request.headers.get('cookie'));
      const pathWithSearch = path + url.search;
      const localization = { language, path: pathWithSearch };

      if (path === '/nyelv' && request.method === 'GET') {
        const choice = url.searchParams.get('lang') === 'en' ? 'en' : 'hu';
        const next = url.searchParams.get('next') || '/';
        let target = '/';
        if (next.startsWith('/') && !next.startsWith('//') && !/[\\\r\n]/.test(next)) {
          const destination = new URL(next, url.origin);
          if (destination.origin === url.origin && destination.pathname !== '/nyelv')
            target = destination.pathname + destination.search + destination.hash;
        }
        const response = redirect(target);
        response.headers.append('Set-Cookie',
          `${languageCookieName}=${choice}; Path=/; Max-Age=31536000; SameSite=Lax${url.protocol === 'https:' ? '; Secure' : ''}`,
        );
        return response;
      }
      const mutating = !['GET', 'HEAD'].includes(request.method);
      if (mutating && request.headers.get('origin') !== url.origin)
        return json(403, { error: 'Idegen oldalról érkező kérés nem engedélyezett.' });
      if (path === '/private-access.js' && request.method === 'GET')
        return new Response(enrollmentScript, {
          headers: { ...commonHeaders, 'Content-Type': 'text/javascript; charset=utf-8' },
        });
      if (path.startsWith(bundlePrefix)) return publisher.handleBundle(request);
      if (path === '/api/health' && ['GET', 'HEAD'].includes(request.method)) return null;
      if (path === '/api/private-access/me' && request.method === 'GET')
        return actor
          ? json(200, {
              user: { id: actor.id, username: actor.username, role: actor.role },
              database: actor.role === 'owner' ? 'boltHistory' : 'boltHistory-' + actor.id,
            })
          : json(401, { error: 'Jelentkezz be a Műhelybe.' });
      if (['/', '/nyito'].includes(path) && ['GET', 'HEAD'].includes(request.method))
        return html(welcomePage({ signedIn: Boolean(actor), registrationAvailable: store.ready(), ...localization }));
      if (path === '/belepes') {
        if (request.method === 'GET')
          return actor
            ? redirect(safeDestination(url.searchParams.get('next')))
            : html(loginPage(safeDestination(url.searchParams.get('next')), '', store.ready(), localization));
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
            loginPage(next, error.status ? error.message : 'A belépés most nem sikerült. Próbáld újra.', store.ready(), localization),
            error.status || 503,
          );
        }
      }
      if (path === '/regisztracio') {
        if (request.method === 'GET')
          return html(
            registrationPage({ received: url.searchParams.get('allapot') === 'beerkezett', ready: store.ready(), ...localization }),
          );
        if (request.method !== 'POST') return json(405, { error: 'POST szükséges.' });
        if (actor) return redirect('/fiokom');
        let values = {};
        try {
          take('all-registration', 30);
          const data = new URLSearchParams(await request.text());
          values = {
            username: data.get('username')?.slice(0, 40),
            name: data.get('name')?.slice(0, 100),
            email: data.get('email')?.slice(0, 254),
          };
          await store.register({
            username: data.get('username'),
            name: data.get('name'),
            email: data.get('email'),
            password: data.get('password'),
          });
          return redirect('/regisztracio?allapot=beerkezett');
        } catch (error) {
          return html(
            registrationPage({
              ...localization,
              values,
              ready: store.ready(),
              error: error.status ? error.message : 'A kérelem most nem küldhető el. Próbáld újra később.',
            }),
            error.status || 503,
          );
        }
      }
      if (!actor)
        return path.startsWith('/api/')
          ? json(401, { error: 'Jelentkezz be a Műhelybe.', loginUrl: '/belepes' })
          : redirect('/belepes?next=' + encodeURIComponent(safeDestination(path + url.search)));
      if (path === publishPath)
        return actor.role === 'owner'
          ? publisher.handle(request)
          : json(403, { error: 'A közzétételt csak a Műhely tulajdonosa indíthatja.' });
      if (path === '/api/workspace-preferences') {
        if (request.method === 'GET') return json(200, workspaceContext(request));
        if (request.method !== 'POST') return json(405, { error: 'A művelet nem érhető el.' });
        const project = workspaceProjectId(request.headers.get('x-muhely-project'));
        if (!project) return json(400, { error: 'Érvénytelen projekt.' });
        try {
          const repair = JSON.parse(await request.text());
          const checks = ['project_run_command', 'project_quality_report', 'project_preview_report', 'project_visual_review'];
          if (!repair || typeof repair.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(repair.id) ||
            !checks.includes(repair.check) || !Array.isArray(repair.files) || repair.files.length > 5 ||
            !repair.files.every((file) => typeof file === 'string' && /^[\w./ @+-]{1,100}$/.test(file)))
            return json(400, { error: 'Érvénytelen javítási bejegyzés.' });
          await store.rememberRepair(actor, project, { id: repair.id, check: repair.check, files: repair.files });
          return json(200, { saved: true });
        } catch {
          return json(400, { error: 'A javítás nem menthető.' });
        }
      }
      if (path === '/api/media-render') return render(request, actor);
      if (path === '/kijelentkezes') {
        const label = localized(language, 'Kijelentkezés', 'Sign out');
        if (request.method !== 'POST')
          return html(
            page(
              label,
              `<main><section class="card"><h1>${label}</h1><form action="/kijelentkezes" method="post"><button class="primary">${label}</button></form></section></main>`,
              localization,
            ),
          );
        await store.logout(raw);
        return redirect('/belepes', '');
      }
      if (path === '/fiokom') {
        const project = workspaceProjectId(url.searchParams.get('projekt'));
        const destination = project ? '/fiokom?projekt=' + encodeURIComponent(project) : '/fiokom';
        const account = (error = '', status = 200, notice = '') =>
          html(accountPage(actor, error, { ...store.workspace(actor, project), project, notice, ...localization }), status);
        if (request.method === 'GET')
          return account('', 200, url.searchParams.get('mentve') === '1' ? 'A beállítások mentve.' : '');
        if (request.method !== 'POST') return json(405, { error: 'POST szükséges.' });
        try {
          const data = new URLSearchParams(await request.text());
          const action = data.get('action');
          if (action === 'workspace') {
            await store.updateWorkspace(actor, parseWorkspacePreferences(data));
            return redirect(destination + (project ? '&' : '?') + 'mentve=1#muhelybeallitasok');
          }
          if (action === 'memory' || action === 'forget') {
            if (!project) return account('Nyisd meg ezt a beállítást a projektből.', 400);
            await store.updateProjectMemory(actor, project, action === 'forget' ? null : parseProjectPreferences(data));
            return redirect(destination + '&mentve=1#projektmemoria');
          }
          take('password:' + actor.id, 8);
          await store.changePassword(actor, data.get('oldPassword'), data.get('password'));
          return redirect('/belepes', '');
        } catch (error) {
          return account(error.status ? error.message : 'A módosítás most nem menthető.', error.status || 503);
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
        if (request.method === 'GET') {
          const notice = {
            jovahagyva: 'A fiókot jóváhagytad. A jelentkező már beléphet a saját jelszavával.',
            elutasitva: 'A regisztrációs kérelmet elutasítottad.',
          }[url.searchParams.get('allapot')];
          return html(accessPage(actor, store.list(actor), null, '', typeof notice === 'string' ? notice : '', localization));
        }
        if (request.method !== 'POST') return json(405, { error: 'POST szükséges.' });
        try {
          const data = new URLSearchParams(await request.text());
          let invitation = null;
          if (data.get('action') === 'invite') {
            const result = await store.invite(actor, data.get('username'));
            invitation =
              url.origin + '/belepes#' + new URLSearchParams({ meghivo: result.secret, nev: result.username });
          } else if (['approve-registration', 'reject-registration'].includes(data.get('action'))) {
            const approve = data.get('action') === 'approve-registration';
            await store.reviewRegistration(actor, data.get('registrationId'), approve);
            return redirect('/hozzaferesek?allapot=' + (approve ? 'jovahagyva' : 'elutasitva'));
          } else if (data.get('action') === 'revoke') await store.revoke(actor, data.get('username'));
          else throw Object.assign(Error('Ismeretlen művelet.'), { status: 400 });
          return html(accessPage(actor, store.list(actor), invitation, '', '', localization));
        } catch (error) {
          return html(
            accessPage(actor, store.list(actor), null, error.status ? error.message : 'A módosítás most nem menthető.', '', localization),
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
