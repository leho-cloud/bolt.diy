export const escapeHTML = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const css = `*{box-sizing:border-box}body{margin:0;background:#101114;color:#f2f2f5;font:14px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}header,footer{max-width:1080px;margin:auto;padding:22px 28px;display:flex;align-items:center;justify-content:space-between;gap:16px}header{border-bottom:1px solid #282930}.brand{display:flex;gap:10px;align-items:center;font-weight:650}.mark{display:grid;place-items:center;width:31px;height:31px;border-radius:9px;background:#df1945;color:#fff;font-size:18px}.brand small,footer,.muted{color:#9696a3;font-weight:400}a{color:#dddde5;text-decoration:none}a:hover{color:white}main{max-width:1080px;min-height:calc(100svh - 154px);margin:auto;padding:70px 28px;display:grid;align-content:center;gap:32px}.intro{max-width:480px}.eyebrow{font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:#e68a9f}h1{font-size:clamp(27px,4vw,38px);line-height:1.22;letter-spacing:-.035em;margin:14px 0 18px;font-weight:650}h2{font-size:20px;line-height:1.3;margin:0 0 12px;letter-spacing:-.02em}p{color:#aaaab7;margin:10px 0 20px}.card{border:1px solid #303139;background:#17181d;border-radius:16px;padding:28px;min-width:0}.login-grid{grid-template-columns:1.1fr .9fr;align-items:center}.card form{display:grid;gap:17px}label{display:grid;gap:7px;font-size:13px;color:#d3d3dc}input,textarea{width:100%;min-width:0;background:#101115;border:1px solid #3d3f49;border-radius:8px;padding:11px 12px;font:inherit;color:white}input:focus{outline:2px solid #e15a7b;outline-offset:2px}button,.button{cursor:pointer;font:inherit;border:1px solid #42434e;background:#24252d;border-radius:8px;padding:10px 15px;color:#f7f7fa;text-align:center;display:inline-block}.primary{background:#da1944;border-color:#da1944;font-weight:600}.primary:hover{background:#ed2550}.small{font-size:12px;padding:7px 10px}.error{padding:12px 14px;background:#401e29;border-radius:8px;color:#ffc7d4}.success{padding:14px;border:1px solid #28684f;background:#172f27;border-radius:10px}.actions{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.person{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:17px 0;border-bottom:1px solid #2c2d34}.person form{display:block}.person b{font-weight:600}.person small{display:block;color:#a6a6b3;overflow-wrap:anywhere}.registration-row{flex-wrap:wrap}.registration-row .actions{gap:8px}.contact{color:#ecd3db;text-decoration:underline;text-underline-offset:2px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.inline{display:flex;gap:12px}.note{font-size:12px}.back{font-size:13px}.hidden,[hidden]{display:none!important}footer{border-top:1px solid #282930;font-size:12px}a:focus-visible,button:focus-visible{outline:2px solid #f0a3b6;outline-offset:4px}@media(max-width:720px){.login-grid,.grid{grid-template-columns:1fr}main{padding:36px 20px;gap:24px}.card{padding:24px}header,footer{padding:20px}.person{align-items:flex-start}.inline{flex-direction:column}}`;
export function page(title, body, { error = '', script = false, user = null } = {}) {
  return `<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHTML(title)} · Műhely</title><style>${css}</style>${script ? '<script src="/private-access.js" defer></script>' : ''}</head><body><header><a class="brand" href="/nyito"><span class="mark">T</span>Műhely <small>by TZSVTAV</small></a>${user ? '<a class="back" href="/muhely">Vissza a Műhelybe →</a>' : '<span class="muted note">Saját alkotói tér</span>'}</header>${body.replace('<!--feedback-->', error ? `<p class="error" role="alert">${escapeHTML(error)}</p>` : '')}<footer><span>TZSVT Hosting</span><span>Műhely</span></footer></body></html>`;
}
export function loginPage(next = '/muhely', error = '', ready = true) {
  return page(
    'Belépés',
    `<main class="login-grid"><section class="intro"><span class="eyebrow">A saját Műhelyed</span><h1>Ötletből valami saját.</h1><p>Készíts weboldalt vagy alkalmazást, és alakítsd tovább a saját elképzelésed szerint.</p></section><section class="card"><h2 id="login-title">Lépj be a Műhelybe.</h2><p class="note" id="login-note">A korábbi munkáid a belépés után várnak.</p><!--feedback--><form method="post" action="/belepes"><input type="hidden" name="action" value="login" id="access-action"><input type="hidden" name="token" id="access-token"><input type="hidden" name="next" value="${escapeHTML(next)}"><label>Felhasználónév<input name="username" id="access-username" required minlength="3" maxlength="40" autocomplete="username" pattern="[a-z0-9][a-z0-9._\\-]{2,39}"></label><label>Jelszó<input name="password" id="access-password" type="password" required maxlength="256" autocomplete="current-password"></label><button class="primary" id="access-submit">Belépés →</button></form><p class="note muted" id="access-help">${ready ? 'Ha elfelejtetted a jelszavad, kérj új meghívót a Műhely tulajdonosától.' : 'A tulajdonosi belépés beállítása folyamatban.'}</p>${ready ? '<p class="note" id="registration-link"><a class="contact" href="/regisztracio">Regisztráció →</a></p>' : ''}</section></main>`,
    { error, script: true },
  );
}
export function registrationPage({ received = false, ready = true, values = {}, error = '' } = {}) {
  return page(
    received ? 'Kérelem beérkezett' : 'Regisztráció',
    `<main class="login-grid">
      <section class="intro">
        <h1>Regisztráció a Műhelybe</h1>
        <p><strong>A regisztráció elfogadása egyeztetést igényel.</strong></p>
        <p>A megadott e-mail-címen egyeztetünk veled. Jóváhagyás után a saját felhasználóneveddel és jelszavaddal léphetsz be.</p>
        <a class="contact" href="/belepes">Vissza a belépéshez</a>
      </section>
      <section class="card">
        <h2>${received ? 'Beérkezett a kérelmed' : 'Hozzáférés igénylése'}</h2>
        <!--feedback-->
        ${
          received
            ? '<p class="success">Köszönjük. A fiókod jóváhagyásra vár.</p>'
            : !ready
              ? '<p>A regisztráció jelenleg nem érhető el.</p>'
              : `
        <form method="post" action="/regisztracio">
          <label>Teljes név<input name="name" required maxlength="100" autocomplete="name" value="${escapeHTML(values.name)}"></label>
          <label>E-mail-cím<input name="email" type="email" required maxlength="254" autocomplete="email" value="${escapeHTML(values.email)}"></label>
          <label>Felhasználónév<input name="username" required minlength="3" maxlength="40" pattern="[a-z0-9][a-z0-9._\\-]{2,39}" autocomplete="username" aria-describedby="username-hint" value="${escapeHTML(values.username)}"></label>
          <small id="username-hint" class="note muted">3–40 karakter. Kisbetű, szám, pont, kötőjel vagy aláhúzás.</small>
          <label>Jelszó<input name="password" type="password" required minlength="12" maxlength="256" autocomplete="new-password" aria-describedby="registration-password-hint"></label>
          <small id="registration-password-hint" class="note muted">Legalább 12 karakter.</small>
          <button class="primary">Regisztrációs kérelem elküldése</button>
        </form>`
        }
      </section>
    </main>`,
    { error },
  );
}

export const enrollmentScript = `const query=new URLSearchParams(location.hash.slice(1)),secret=query.get('elso')||query.get('meghivo');if(secret&&/^[a-f0-9]{64}$/.test(secret)){history.replaceState(null,'',location.pathname+location.search);document.querySelector('#access-action').value='enroll';document.querySelector('#access-token').value=secret;document.querySelector('#login-title').textContent=query.has('elso')?'Állítsd be saját belépésedet.':'Üdv a Műhelyben.';const registration=document.querySelector('#registration-link');if(registration)registration.hidden=true;document.querySelector('#login-note').textContent='Válassz legalább 12 karakteres saját jelszót.';const password=document.querySelector('#access-password');password.minLength=12;password.autocomplete='new-password';document.querySelector('#access-submit').textContent='Belépés beállítása →';document.querySelector('#access-help').textContent='A meghívó egyszer használható. A jelszavadat nem kell elküldened senkinek.';if(query.get('nev')){const name=document.querySelector('#access-username');name.value=query.get('nev');name.readOnly=true;}}`;
export function accountPage(user, error = '') {
  return page(
    'Saját belépésem',
    `<main><section class="intro"><span class="eyebrow">Saját belépésem</span><h1>${escapeHTML(user.username)}</h1><p>A belépésed egy hétig megmarad. Bármikor kijelentkezhetsz.</p><div class="actions"><a class="button primary" href="/muhely">Műhely megnyitása →</a>${user.role === 'owner' ? '<a class="button" href="/hozzaferesek">Hozzáférések kezelése</a><a class="button" href="https://xzmy2phls5uwuhltjhadbcbg.187.126.2.206.sslip.io/" target="_blank" rel="noopener noreferrer">Korábbi munkák ↗</a>' : ''}<form method="post" action="/kijelentkezes"><button>Kijelentkezés</button></form></div></section><section class="card"><h2>Jelszó módosítása</h2><!--feedback--><form method="post" action="/fiokom"><label>Jelenlegi jelszó<input name="oldPassword" type="password" required autocomplete="current-password" maxlength="256"></label><label>Új jelszó<input name="password" type="password" required minlength="12" maxlength="256" autocomplete="new-password"></label><p class="note">A módosítás után az új jelszóval kell belépned az eszközeiden.</p><button class="primary">Új jelszó mentése</button></form></section></main>`,
    { user, error },
  );
}
export function accessPage(user, data, invitation = null, error = '', notice = '') {
  const emailLink = (email) =>
    `<a class="contact" href="mailto:${escapeHTML(encodeURIComponent(email).replace('%40', '@'))}">${escapeHTML(email)}</a>`;
  const date = new Intl.DateTimeFormat('hu-HU', { dateStyle: 'medium', timeZone: 'Europe/Budapest' });
  const registrations = data.registrations
    .map(
      (entry) => `
      <div class="person registration-row">
        <div>
          <b>${escapeHTML(entry.name)}</b>
          <small>${emailLink(entry.email)}</small>
          <small>${escapeHTML(entry.username)} · ${date.format(entry.requestedAt)}</small>
        </div>
        <form method="post" action="/hozzaferesek">
          <input type="hidden" name="registrationId" value="${escapeHTML(entry.id)}">
          <div class="actions">
            <button class="small" name="action" value="reject-registration">Elutasítás</button>
            <button class="small primary" name="action" value="approve-registration">Jóváhagyás</button>
          </div>
        </form>
      </div>`,
    )
    .join('');
  const persons = data.users
    .map(
      (u) =>
        `<div class="person"><div><b>${escapeHTML(u.username)}</b>${u.email ? `<small>${emailLink(u.email)}</small>` : ''}<small>${u.role === 'owner' ? 'Tulajdonos' : u.disabled ? 'Visszavonva' : 'Aktív hozzáférés'}</small></div>${u.role !== 'owner' && !u.disabled ? `<form action="/hozzaferesek" method="post"><input type="hidden" name="action" value="revoke"><input type="hidden" name="username" value="${escapeHTML(u.username)}"><button class="small">Hozzáférés visszavonása</button></form>` : ''}</div>`,
    )
    .join('');
  const pending = data.invites
    .map(
      (i) =>
        `<div class="person"><div><b>${escapeHTML(i.username)}</b><small>Meghívó elküldhető · 3 napig érvényes</small></div><form action="/hozzaferesek" method="post"><input type="hidden" name="action" value="revoke"><input type="hidden" name="username" value="${escapeHTML(i.username)}"><button class="small">Meghívó visszavonása</button></form></div>`,
    )
    .join('');
  return page(
    'Hozzáférések',
    `<main><section class="intro"><span class="eyebrow">Te döntöd el, ki léphet be.</span><h1>Hozzáférések.</h1><p>Itt hagyhatod jóvá a regisztrációkat, készíthetsz meghívót és vonhatod vissza a hozzáférést. A tagok AI-használata a te szolgáltatói keretedből fogy.</p></section><!--feedback-->${notice ? `<p class="success" role="status">${escapeHTML(notice)}</p>` : ''}<section class="card" id="regisztracios-kerelmek"><h2>Regisztrációs kérelmek</h2>${registrations || '<p class="note">Nincs függő regisztrációs kérelem.</p>'}</section>${invitation ? `<section class="success"><b>A meghívó elkészült.</b><p class="note">Másold ki a linket, és küldd el annak, akinek hozzáférést adsz. E-mailt nem küldtünk. A link egyszer használható, három napig érvényes.</p><label>Meghívólink<textarea readonly rows="3">${escapeHTML(invitation)}</textarea></label></section>` : ''}<div class="grid"><section class="card"><h2>Új meghívó</h2><form method="post" action="/hozzaferesek"><input type="hidden" name="action" value="invite"><label>Felhasználónév<input name="username" minlength="3" maxlength="40" pattern="[a-z0-9][a-z0-9._\\-]{2,39}" required placeholder="például: anna" autocomplete="off"></label><p class="note">Kisbetű, szám, pont, kötőjel vagy aláhúzás. Meglévő meghívottnak új linkkel a jelszavát is visszaállíthatod.</p><button class="primary">Meghívó készítése →</button></form></section><section class="card"><h2>Akik beléphetnek</h2>${persons}${pending ? '<h2>Fel nem használt meghívók</h2>' + pending : ''}</section></div></main>`,
    { user, error },
  );
}
