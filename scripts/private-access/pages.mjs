import { languageSwitchUrl, localized } from '../../app/lib/common/localization/language.mjs';

export const escapeHTML = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const css = `*{box-sizing:border-box}body{margin:0;background:#101114;color:#f2f2f5;font:14px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}header,footer{max-width:1080px;margin:auto;padding:22px 28px;display:flex;align-items:center;justify-content:space-between;gap:16px}header{border-bottom:1px solid #282930}.brand{display:flex;gap:10px;align-items:center;font-weight:650}.mark{display:grid;place-items:center;width:31px;height:31px;border-radius:9px;background:#df1945;color:#fff;font-size:18px}.brand small,footer,.muted{color:#9696a3;font-weight:400}a{color:#dddde5;text-decoration:none}a:hover{color:white}main{max-width:1080px;min-height:calc(100svh - 154px);margin:auto;padding:70px 28px;display:grid;align-content:center;gap:32px}.intro{max-width:480px}.eyebrow{font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:#e68a9f}h1{font-size:clamp(27px,4vw,38px);line-height:1.22;letter-spacing:-.035em;margin:14px 0 18px;font-weight:650}h2{font-size:20px;line-height:1.3;margin:0 0 12px;letter-spacing:-.02em}p{color:#aaaab7;margin:10px 0 20px}.card{border:1px solid #303139;background:#17181d;border-radius:16px;padding:28px;min-width:0}.login-grid{grid-template-columns:1.1fr .9fr;align-items:center}.card form{display:grid;gap:17px}label{display:grid;gap:7px;font-size:13px;color:#d3d3dc}input,textarea{width:100%;min-width:0;background:#101115;border:1px solid #3d3f49;border-radius:8px;padding:11px 12px;font:inherit;color:white}input:focus{outline:2px solid #e15a7b;outline-offset:2px}button,.button{cursor:pointer;font:inherit;border:1px solid #42434e;background:#24252d;border-radius:8px;padding:10px 15px;color:#f7f7fa;text-align:center;display:inline-block}.primary{background:#da1944;border-color:#da1944;font-weight:600}.primary:hover{background:#ed2550}.small{font-size:12px;padding:7px 10px}.error{padding:12px 14px;background:#401e29;border-radius:8px;color:#ffc7d4}.success{padding:14px;border:1px solid #28684f;background:#172f27;border-radius:10px}.actions{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.person{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:17px 0;border-bottom:1px solid #2c2d34}.person form{display:block}.person b{font-weight:600}.person small{display:block;color:#a6a6b3;overflow-wrap:anywhere}.registration-row{flex-wrap:wrap}.registration-row .actions{gap:8px}.contact{color:#ecd3db;text-decoration:underline;text-underline-offset:2px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.inline{display:flex;gap:12px}.note{font-size:12px}.back{font-size:13px}.hidden,[hidden]{display:none!important}footer{border-top:1px solid #282930;font-size:12px}a:focus-visible,button:focus-visible{outline:2px solid #f0a3b6;outline-offset:4px}@media(max-width:720px){.login-grid,.grid{grid-template-columns:1fr}main{padding:36px 20px;gap:24px}.card{padding:24px}header,footer{padding:20px}.person{align-items:flex-start}.inline{flex-direction:column}}`;
const englishFeedback = new Map([
  ['Hibás felhasználónév vagy jelszó.', 'Incorrect username or password.'],
  ['A belépés most nem sikerült. Próbáld újra.', 'Could not sign in. Try again.'],
  ['Jelentkezz be újra.', 'Please sign in again.'],
  ['A meghívó nem érvényes vagy már lejárt.', 'This invitation is invalid or expired.'],
  ['Ez a felhasználónév már foglalt.', 'This username is already taken.'],
  ['A felhasználónév 3–40 kisbetű, szám, pont, kötőjel vagy aláhúzás lehet.', 'Use 3–40 lowercase letters, numbers, periods, hyphens or underscores for the username.'],
  ['Legalább 12 karakteres, legfeljebb 256 bájtos jelszót adj meg.', 'Choose a password with at least 12 characters and at most 256 bytes.'],
  ['Adj meg egy érvényes e-mail-címet az egyeztetéshez.', 'Enter a valid email address so we can contact you.'],
  ['Adj meg egy legfeljebb 100 karakteres nevet.', 'Enter a name up to 100 characters long.'],
  ['Ezekkel az adatokkal már van fiók, meghívó vagy függő kérelem.', 'An account, invitation or pending request already uses these details.'],
  ['A regisztráció jelenleg nem érhető el.', 'Registration is currently unavailable.'],
  ['A kérelem most nem küldhető el. Próbáld újra később.', 'Could not submit your request. Please try again later.'],
  ['Túl sok belépési próbálkozás. Kérjük, próbáld később.', 'Too many sign-in attempts. Please try again later.'],
  ['A jelenlegi jelszó hibás.', 'The current password is incorrect.'],
  ['A módosítás most nem menthető.', 'Could not save the changes.'],
  ['Ellenőrizd a számértékeket.', 'Check the numeric values.'],
  ['Az exporthoz érvényes pixelméret és 50 vagy 60 fps szükséges.', 'Enter valid pixel dimensions and select 50 or 60 fps.'],
  ['A projektjegyzet legfeljebb 2000 karakter lehet.', 'Project notes can contain up to 2,000 characters.'],
  ['Nyisd meg ezt a beállítást a projektből.', 'Open this setting from the project.'],
  ['A beállítások mentve.', 'Settings saved.'],
  ['A fiókot jóváhagytad. A jelentkező már beléphet a saját jelszavával.', 'Account approved. The applicant can now sign in.'],
  ['A regisztrációs kérelmet elutasítottad.', 'Registration request declined.'],
]);

function feedback(language, value) {
  return language === 'en' ? englishFeedback.get(value) || value : value;
}

export function page(title, body, { error = '', script = false, user = null, language = 'hu', path = '/' } = {}) {
  const t = (hu, en) => localized(language, hu, en);
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHTML(title)} · Műhely</title><style>${css}.setting-toggle{display:flex;align-items:center;gap:10px}.setting-toggle input{width:auto;accent-color:#e92b55}textarea,select{width:100%;padding:10px;border:1px solid #393a43;border-radius:8px;background:#17181e;color:inherit;font:inherit}details{margin-top:14px}</style>${script ? '<script src="/private-access.js" defer></script>' : ''}</head><body><header><a class="brand" href="/nyito"><span class="mark">T</span>Műhely <small>by TZSVTAV</small></a>${user ? `<a class="back" href="/muhely">${t("Vissza a Műhelybe →", "Back to Műhely →")}</a>` : `<span class="muted note">${t("Saját alkotói tér", "Your creative workspace")}</span>`}<a class="back" href="${escapeHTML(languageSwitchUrl(language, path))}" lang="${t('en', 'hu')}">${t('English', 'Magyar')}</a></header>${body.replace('<!--feedback-->', error ? `<p class="error" role="alert">${escapeHTML(feedback(language, error))}</p>` : '')}<footer><span>TZSVT Hosting</span><span>Műhely</span></footer></body></html>`;
}
export function loginPage(next = '/muhely', error = '', ready = true, { language = 'hu', path = '/belepes' } = {}) {
  const t = (hu, en) => localized(language, hu, en);
  return page(
    t("Belépés", "Sign in"),
    `<main class="login-grid"><section class="intro"><span class="eyebrow">${t("A saját Műhelyed", "Your Műhely")}</span><h1>${t("Ötletből valami saját.", "Make something of your own.")}</h1><p>${t("Készíts dizájnt, képet, videót, weboldalt vagy alkalmazást, majd alakítsd tovább az előnézetben.", "Create a design, image, video, website or app, then refine it in the preview.")}</p></section><section class="card"><h2 id="login-title">${t("Lépj be a Műhelybe.", "Sign in to Műhely.")}</h2><p class="note" id="login-note">${t("A korábbi munkáid a belépés után várnak.", "Sign in to pick up where you left off.")}</p><!--feedback--><form method="post" action="/belepes"><input type="hidden" name="action" value="login" id="access-action"><input type="hidden" name="token" id="access-token"><input type="hidden" name="next" value="${escapeHTML(next)}"><label>${t("Felhasználónév", "Username")}<input name="username" id="access-username" required minlength="3" maxlength="40" autocomplete="username" pattern="[a-z0-9][a-z0-9._\\-]{2,39}"></label><label>${t("Jelszó", "Password")}<input name="password" id="access-password" type="password" required maxlength="256" autocomplete="current-password"></label><button class="primary" id="access-submit">${t("Belépés →", "Sign in →")}</button></form><p class="note muted" id="access-help">${ready ? t("Ha elfelejtetted a jelszavad, kérj új meghívót a Műhely tulajdonosától.", "If you forgot your password, ask the workspace owner for a new invitation.") : t("A tulajdonosi belépés beállítása folyamatban.", "The workspace owner is setting up their account.")}</p>${ready ? `<p class="note" id="registration-link"><a class="contact" href="/regisztracio">${t("Regisztráció →", "Register →")}</a></p>` : ''}</section></main>`,
    { error, script: true, language, path },
  );
}
export function registrationPage({ received = false, ready = true, values = {}, error = '', language = 'hu', path = '/regisztracio' } = {}) {
  const t = (hu, en) => localized(language, hu, en);
  return page(
    received ? t("Kérelem beérkezett", "Request received") : t("Regisztráció", "Register"),
    `<main class="login-grid">
      <section class="intro">
        <h1>${t("Regisztráció a Műhelybe", "Register for Műhely")}</h1>
        <p><strong>${t("A regisztráció elfogadása egyeztetést igényel.", "Registration requires a follow-up before approval.")}</strong></p>
        <p>${t("A megadott e-mail-címen egyeztetünk veled. Jóváhagyás után a saját felhasználóneveddel és jelszavaddal léphetsz be.", "We will contact you at the email address you provide. Once approved, you can sign in with your username and password.")}</p>
        <a class="contact" href="/belepes">${t("Vissza a belépéshez", "Back to sign-in")}</a>
      </section>
      <section class="card">
        <h2>${received ? t("Beérkezett a kérelmed", "We received your request") : t("Hozzáférés igénylése", "Request access")}</h2>
        <!--feedback-->
        ${
          received
            ? `<p class="success">${t("Köszönjük. A fiókod jóváhagyásra vár.", "Thank you. Your account is awaiting approval.")}</p>`
            : !ready
              ? `<p>${t("A regisztráció jelenleg nem érhető el.", "Registration is currently unavailable.")}</p>`
              : `
        <form method="post" action="/regisztracio">
          <label>${t("Teljes név", "Full name")}<input name="name" required maxlength="100" autocomplete="name" value="${escapeHTML(values.name)}"></label>
          <label>${t("E-mail-cím", "Email address")}<input name="email" type="email" required maxlength="254" autocomplete="email" value="${escapeHTML(values.email)}"></label>
          <label>${t("Felhasználónév", "Username")}<input name="username" required minlength="3" maxlength="40" pattern="[a-z0-9][a-z0-9._\\-]{2,39}" autocomplete="username" aria-describedby="username-hint" value="${escapeHTML(values.username)}"></label>
          <small id="username-hint" class="note muted">${t("3–40 karakter. Kisbetű, szám, pont, kötőjel vagy aláhúzás.", "3–40 characters. Use lowercase letters, numbers, periods, hyphens or underscores.")}</small>
          <label>${t("Jelszó", "Password")}<input name="password" type="password" required minlength="12" maxlength="256" autocomplete="new-password" aria-describedby="registration-password-hint"></label>
          <small id="registration-password-hint" class="note muted">${t("Legalább 12 karakter.", "At least 12 characters.")}</small>
          <button class="primary">${t("Regisztrációs kérelem elküldése", "Submit registration request")}</button>
        </form>`
        }
      </section>
    </main>`,
    { error, language, path },
  );
}

export const enrollmentScript = `
const query = new URLSearchParams(location.hash.slice(1));
const token = query.get('elso') || query.get('meghivo');
if (token && /^[a-f0-9]{64}$/.test(token)) {
  const text = (hu, en) => document.documentElement.lang === 'en' ? en : hu;
  const languageLink = document.querySelector('a[href^="/nyelv?"]');
  if (languageLink) languageLink.hash = location.hash;
  history.replaceState(null, '', location.pathname + location.search);
  document.querySelector('#access-action').value = 'enroll';
  document.querySelector('#access-token').value = token;
  document.querySelector('#login-title').textContent = query.has('elso')
    ? text('Állítsd be saját belépésedet.', 'Set up your account.')
    : text('Üdv a Műhelyben.', 'Welcome to Műhely.');
  const registration = document.querySelector('#registration-link');
  if (registration) registration.hidden = true;
  document.querySelector('#login-note').textContent = text('Válassz legalább 12 karakteres saját jelszót.', 'Choose a password of at least 12 characters.');
  const password = document.querySelector('#access-password');
  password.minLength = 12;
  password.autocomplete = 'new-password';
  document.querySelector('#access-submit').textContent = text('Belépés beállítása →', 'Set up sign-in →');
  document.querySelector('#access-help').textContent = text('A meghívó egyszer használható. A jelszavadat nem kell elküldened senkinek.', 'This invitation works once. Keep your password private.');
  const username = query.get('nev');
  if (username) {
    const name = document.querySelector('#access-username');
    name.value = username;
    name.readOnly = true;
  }
}`;

const repairLabels = {
  project_run_command: 'Fordítás vagy működési ellenőrzés',
  project_quality_report: 'Kódellenőrzés',
  project_preview_report: 'Előnézet ellenőrzése',
  project_visual_review: 'Képi ellenőrzés',
};

function ledFields(led, language) {
  const t = (hu, en) => localized(language, hu, en);
  const numeric = (name, label, value, max) =>
    `<label>${label}<input type="number" name="${name}" min="1" max="${max}" required value="${value}"></label>`;
  return `<div class="grid">${numeric('width', t("Szélesség (px)", "Width (px)"), led.width, 4096)}
    ${numeric('height', t("Magasság (px)", "Height (px)"), led.height, 4096)}
    ${numeric('seconds', t("Videó hossza (mp)", "Video length (seconds)"), led.seconds, 60)}
    <label>${t("Képkockasebesség", "Frame rate")}<select name="fps"><option value="50"${led.fps === 50 ? ' selected' : ''}>50 fps</option>
      <option value="60"${led.fps === 60 ? ' selected' : ''}>60 fps</option></select></label></div>`;
}

function workspaceCards({ preferences, memory, projects = [], project, notice = '', language = 'hu' }) {
  const t = (hu, en) => localized(language, hu, en);
  if (!preferences) return '';
  const action = project ? '/fiokom?projekt=' + encodeURIComponent(project) : '/fiokom';
  const toggle = (name, label, checked) =>
    `<label class="setting-toggle"><input type="checkbox" name="${name}"${checked ? ' checked' : ''}><span>${label}</span></label>`;
  return `
    <section class="card" id="muhelybeallitasok">
      <h2>${t("Memória és skillek", "Memory and skills")}</h2>
      ${notice ? `<p class="success" role="status">${escapeHTML(feedback(language, notice))}</p>` : ''}
      <!--workspace-feedback-->
      <form method="post" action="${action}">
        <input type="hidden" name="action" value="workspace">
        ${toggle('memoryEnabled', t("Projektmemória", "Project memory"), preferences.memoryEnabled)}
        <p class="note">${t("A Builder a projektjegyzeteket és az ellenőrzött javításokat elküldheti a kiválasztott AI-nak. Kikapcsolva a mentett adatok megmaradnak.", "Builder may share project notes and verified fixes with the selected AI model. Turning memory off keeps your saved information.")}</p>
        ${toggle('repairEnabled', t("Automatikus javítás skill", "Automatic repair skill"), preferences.repairEnabled)}
        <label>${t("Javítási körök hibánként", "Repair attempts per issue")}
          <select name="repairRounds">${[1, 2, 3].map((n) => `<option value="${n}"${preferences.repairRounds === n ? ' selected' : ''}>${n}</option>`).join('')}</select>
        </label>
        ${toggle('ledEnabled', t("LED-fal videó skill", "LED wall video skill"), preferences.ledEnabled)}
        <p class="note">${t("Alapértékek az MP4-exporthoz. Az exportablakban módosíthatod őket.", "Default settings for MP4 exports. You can change them in the export dialog.")}</p>
        ${ledFields(preferences.led, language)}
        <button class="primary">${t("Beállítások mentése", "Save settings")}</button>
      </form>
    </section>
    <section class="card" id="projektmemoria">
      <h2>${t("Projektmemória", "Project memory")}</h2>
      ${project ? `
        <p class="note">${escapeHTML(project)} · <a class="contact" href="/chat/${encodeURIComponent(project)}">${t("Vissza a projekthez →", "Back to project →")}</a></p>
        <form method="post" action="${action}">
          <input type="hidden" name="action" value="memory">
          <label>${t("Megjegyzések a projekthez", "Project notes")}
            <textarea name="notes" rows="5" maxlength="2000" placeholder="${t("Jóváhagyott stílus, méretek vagy tartalmi döntések", "Approved style, dimensions or content decisions")}">${escapeHTML(memory?.notes || '')}</textarea>
          </label>
          ${toggle('useProjectLed', t("Saját LED-exportbeállítás ehhez a projekthez", "Use custom LED export settings for this project"), Boolean(memory?.led))}
          ${ledFields(memory?.led || preferences.led, language)}
          <button class="primary">${t("Projektmemória mentése", "Save project memory")}</button>
        </form>
        ${memory?.repairs?.length ? `<h3>${t("Ellenőrzött javítások", "Verified fixes")}</h3><ul>${memory.repairs.map((repair) =>
          `<li>${escapeHTML((language === 'en' ? { project_run_command: 'Build or runtime check', project_quality_report: 'Code check', project_preview_report: 'Preview check', project_visual_review: 'Visual check' } : repairLabels)[repair.check] || t('Ellenőrzés', 'Check'))}${repair.files.length ? ` · ${escapeHTML(repair.files.join(', '))}` : ''}</li>`
        ).join('')}</ul>` : ''}
        ${memory ? `<form method="post" action="${action}"><button name="action" value="forget">${t("Projektmemória törlése", "Delete project memory")}</button></form>` : ''}
      ` : `<p class="note">${t("Új projektmemóriát az adott munka „Projektmemória” gombjáról nyithatsz meg.", "Open Project memory from a project to add its notes and settings.")}</p>`}
      ${projects.length ? `<details><summary>${t("Mentett projektmemóriák", "Saved project memories")} (${projects.length})</summary><ul>${projects.map((id) =>
        `<li><a class="contact" href="/fiokom?projekt=${encodeURIComponent(id)}#projektmemoria">${escapeHTML(id)}</a></li>`
      ).join('')}</ul></details>` : ''}
    </section>`;
}

export function accountPage(user, error = '', workspace = {}) {
  const { language = 'hu', path = '/fiokom' } = workspace;
  const t = (hu, en) => localized(language, hu, en);
  return page(
    t("Saját belépésem", "My account"),
    `<main><section class="intro"><span class="eyebrow">${t("Saját belépésem", "My account")}</span><h1>${escapeHTML(user.username)}</h1><p>${t("A belépésed egy hétig megmarad. Bármikor kijelentkezhetsz.", "You stay signed in for one week. You can sign out at any time.")}</p><div class="actions"><a class="button primary" href="/muhely">${t("Műhely megnyitása →", "Open Műhely →")}</a>${user.role === 'owner' ? `<a class="button" href="/hozzaferesek">${t("Hozzáférések kezelése", "Manage access")}</a><a class="button" href="https://xzmy2phls5uwuhltjhadbcbg.187.126.2.206.sslip.io/" target="_blank" rel="noopener noreferrer">${t("Korábbi munkák ↗", "Previous projects ↗")}</a>` : ''}<form method="post" action="/kijelentkezes"><button>${t("Kijelentkezés", "Sign out")}</button></form></div></section>${workspaceCards(workspace)}<section class="card"><h2>${t("Jelszó módosítása", "Change password")}</h2>${workspace.preferences ? '' : '<!--feedback-->'}<form method="post" action="/fiokom"><label>${t("Jelenlegi jelszó", "Current password")}<input name="oldPassword" type="password" required autocomplete="current-password" maxlength="256"></label><label>${t("Új jelszó", "New password")}<input name="password" type="password" required minlength="12" maxlength="256" autocomplete="new-password"></label><p class="note">${t("A módosítás után az új jelszóval kell belépned az eszközeiden.", "After changing your password, sign in again on your devices.")}</p><button class="primary">${t("Új jelszó mentése", "Save new password")}</button></form></section></main>`,
    { user, error, language, path },
  ).replace('<!--workspace-feedback-->', error ? `<p class="error" role="alert">${escapeHTML(feedback(language, error))}</p>` : '');
}
export function accessPage(user, data, invitation = null, error = '', notice = '', { language = 'hu', path = '/hozzaferesek' } = {}) {
  const t = (hu, en) => localized(language, hu, en);
  const emailLink = (email) =>
    `<a class="contact" href="mailto:${escapeHTML(encodeURIComponent(email).replace('%40', '@'))}">${escapeHTML(email)}</a>`;
  const date = new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'hu-HU', { dateStyle: 'medium', timeZone: 'Europe/Budapest' });
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
            <button class="small" name="action" value="reject-registration">${t("Elutasítás", "Decline")}</button>
            <button class="small primary" name="action" value="approve-registration">${t("Jóváhagyás", "Approve")}</button>
          </div>
        </form>
      </div>`,
    )
    .join('');
  const persons = data.users
    .map(
      (u) =>
        `<div class="person"><div><b>${escapeHTML(u.username)}</b>${u.email ? `<small>${emailLink(u.email)}</small>` : ''}<small>${u.role === 'owner' ? t("Tulajdonos", "Owner") : u.disabled ? t("Visszavonva", "Revoked") : t("Aktív hozzáférés", "Active access")}</small></div>${u.role !== 'owner' && !u.disabled ? `<form action="/hozzaferesek" method="post"><input type="hidden" name="action" value="revoke"><input type="hidden" name="username" value="${escapeHTML(u.username)}"><button class="small">${t("Hozzáférés visszavonása", "Revoke access")}</button></form>` : ''}</div>`,
    )
    .join('');
  const pending = data.invites
    .map(
      (i) =>
        `<div class="person"><div><b>${escapeHTML(i.username)}</b><small>${t("Meghívó elküldhető · 3 napig érvényes", "Invitation ready to share · Valid for 3 days")}</small></div><form action="/hozzaferesek" method="post"><input type="hidden" name="action" value="revoke"><input type="hidden" name="username" value="${escapeHTML(i.username)}"><button class="small">${t("Meghívó visszavonása", "Revoke invitation")}</button></form></div>`,
    )
    .join('');
  return page(
    t("Hozzáférések", "Access management"),
    `<main><section class="intro"><span class="eyebrow">${t("Te döntöd el, ki léphet be.", "Manage who can sign in.")}</span><h1>${t("Hozzáférések.", "Access management")}</h1><p>${t("Itt hagyhatod jóvá a regisztrációkat, készíthetsz meghívót és vonhatod vissza a hozzáférést. A tagok AI-használata a te szolgáltatói keretedből fogy.", "Approve registrations, create invitations and revoke access. Members’ AI usage counts towards your provider allowance.")}</p></section><!--feedback-->${notice ? `<p class="success" role="status">${escapeHTML(feedback(language, notice))}</p>` : ''}<section class="card" id="regisztracios-kerelmek"><h2>${t("Regisztrációs kérelmek", "Registration requests")}</h2>${registrations || `<p class="note">${t("Nincs függő regisztrációs kérelem.", "No pending registration requests.")}</p>`}</section>${invitation ? `<section class="success"><b>${t("A meghívó elkészült.", "Invitation ready.")}</b><p class="note">${t("Másold ki a linket, és küldd el annak, akinek hozzáférést adsz. E-mailt nem küldtünk. A link egyszer használható, három napig érvényes.", "Copy the link and share it with the person you want to invite. The single-use link expires in three days.")}</p><label>${t("Meghívólink", "Invitation link")}<textarea readonly rows="3">${escapeHTML(invitation)}</textarea></label></section>` : ''}<div class="grid"><section class="card"><h2>${t("Új meghívó", "New invitation")}</h2><form method="post" action="/hozzaferesek"><input type="hidden" name="action" value="invite"><label>${t("Felhasználónév", "Username")}<input name="username" minlength="3" maxlength="40" pattern="[a-z0-9][a-z0-9._\\-]{2,39}" required placeholder="${t("például: anna", "e.g. anna")}" autocomplete="off"></label><p class="note">${t("Kisbetű, szám, pont, kötőjel vagy aláhúzás. Meglévő meghívottnak új linkkel a jelszavát is visszaállíthatod.", "Use lowercase letters, numbers, periods, hyphens or underscores. A new invitation can reset an existing member’s password.")}</p><button class="primary">${t("Meghívó készítése →", "Create invitation →")}</button></form></section><section class="card"><h2>${t("Akik beléphetnek", "People with access")}</h2>${persons}${pending ? `<h2>${t("Fel nem használt meghívók", "Unused invitations")}</h2>` + pending : ''}</section></div></main>`,
    { user, error, language, path },
  );
}
