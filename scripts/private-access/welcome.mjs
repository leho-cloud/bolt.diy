const styles = `
*{box-sizing:border-box}
:root{color-scheme:dark;--surface:#121118;--text:#fbf7f8;--muted:#c0b7be;--line:#35303a;--accent:#ff5e82}
body{margin:0;min-height:100svh;background:#100f14;color:var(--text);font:16px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
a{color:inherit;text-decoration:none}
a:focus-visible{outline:2px solid var(--accent);outline-offset:5px}
.shell{width:min(1120px,calc(100% - 80px));margin-inline:auto}
header{border-bottom:1px solid var(--line)}
.bar{min-height:76px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.brand{display:inline-flex;align-items:center;gap:11px;font-size:20px;font-weight:740;letter-spacing:-.04em}
.brand small{display:block;font-size:10px;font-weight:650;letter-spacing:.12em;color:var(--muted)}
.mark{display:grid;place-items:center;width:38px;height:38px;border-radius:10px;background:#ca204a;color:#fff}
.button{display:inline-flex;justify-content:center;align-items:center;gap:11px;min-height:46px;border:1px solid var(--line);border-radius:9px;padding:9px 16px;font-size:14px;font-weight:700;white-space:nowrap}
.button:hover{background:#261f2a}
.primary{background:#c9214a;border-color:#e23760;color:#fff}
.primary:hover{background:#b91c45}
.hero{display:grid;grid-template-columns:1fr .95fr;align-items:center;gap:clamp(30px,6vw,88px);padding-block:clamp(48px,8vw,105px) clamp(46px,7vw,88px)}
h1,h2,h3,p{margin:0}
h1{max-width:620px;font-size:clamp(41px,5.3vw,76px);line-height:1.04;letter-spacing:-.069em;font-weight:760;text-wrap:balance}
h1 span{color:var(--accent)}
.lead{max-width:48ch;margin-top:22px;font-size:clamp(16px,1.6vw,19px);color:var(--muted)}
.actions{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-top:26px}
.hint{margin-top:13px;color:var(--muted);font-size:13px}
.preview{padding:14px;border:1px solid #4c3042;border-radius:18px;background:radial-gradient(ellipse at 70% 30%,#512338,transparent 72%),#1a141d;box-shadow:0 20px 65px #09070b75}
.window{overflow:hidden;border:1px solid #51414e;border-radius:12px;background:#19171e}
.window-head{padding:12px 14px;border-bottom:1px solid #423641;font-size:12px;font-weight:650;color:#e8dfe4;display:flex;align-items:center;gap:12px}
.dots{display:inline-flex;gap:4px}.dots i{width:6px;height:6px;background:#9c828e;border-radius:50%}.dots i:first-child{background:var(--accent)}
.canvas{display:grid;align-content:center;gap:9px;min-height:230px;padding:26px clamp(18px,4vw,38px);background:radial-gradient(ellipse at 97% 30%,#e85a81 0%,#643459 32%,transparent 66%),linear-gradient(135deg,#211526,#45192f)}
.canvas small{color:#f2b3c2;font-size:11px;font-weight:680;letter-spacing:.11em;text-transform:uppercase}
.canvas strong{max-width:10ch;font-size:clamp(32px,3.7vw,58px);line-height:.98;letter-spacing:-.065em}
.timeline{display:flex;align-items:center;gap:7px;padding:12px 13px}
.timeline i{display:block;height:15px;flex:1;border-radius:3px;background:#553347}
.timeline i:nth-child(2){flex:1.45;background:#963d60}.timeline i:nth-child(3){background:#613c56}
.capabilities{padding:28px 0 54px;border-top:1px solid var(--line)}
.capabilities h2{font-size:clamp(23px,3vw,33px);letter-spacing:-.045em}
.capability-list{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin:20px 0 0;padding:0;list-style:none}
.capability-list h3{font-size:16px;margin-bottom:4px}.capability-list p{font-size:14px;color:var(--muted)}
footer{border-top:1px solid var(--line);padding-block:20px;color:var(--muted);font-size:13px}
footer a:hover{text-decoration:underline}
@media(max-width:760px){.shell{width:calc(100% - 40px)}.hero{grid-template-columns:1fr;gap:35px}.canvas{min-height:170px}}
@media(max-width:470px){.bar{min-height:66px}.capability-list{grid-template-columns:1fr;gap:16px}.actions{gap:8px}.actions .button{padding-inline:12px}.preview{padding:10px}}
`;

export function welcomePage({ signedIn = false, registrationAvailable = true } = {}) {
  const entry = signedIn ? '/muhely' : '/belepes';
  const entryLabel = signedIn ? 'Műhely megnyitása' : 'Belépés';
  return `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="description" content="A TZSVTAV Műhely alkotói felülete dizájnhoz, képhez, videóhoz, weboldalhoz és webalkalmazáshoz.">
<title>Műhely · TZSVTAV</title>
<style>${styles}</style>
</head>
<body>
<header>
  <div class="shell bar">
    <a class="brand" href="/" aria-label="Műhely, nyitóoldal"><span class="mark" aria-hidden="true">T</span><span>Műhely <small>TZSVTAV</small></span></a>
    <a class="button" href="${entry}">${entryLabel} <span aria-hidden="true">→</span></a>
  </div>
</header>
<main class="shell">
  <section class="hero" aria-labelledby="welcome-title">
    <div>
      <h1 id="welcome-title">Az ötletedből <span>valami saját.</span></h1>
      <p class="lead">Készíts dizájnt, képet, videót, weboldalt vagy alkalmazást. Írd le az ötleted, nézd meg az előnézetet, és alakítsd tovább.</p>
      <div class="actions">
        <a class="button primary" href="${entry}">${entryLabel} <span aria-hidden="true">→</span></a>
        ${!signedIn && registrationAvailable ? '<a class="button" href="/regisztracio">Hozzáférés igénylése</a>' : ''}
      </div>
      ${!signedIn && registrationAvailable ? '<p class="hint">A hozzáférés jóváhagyás után válik elérhetővé.</p>' : ''}
    </div>
    <div class="preview" aria-hidden="true">
      <div class="window">
        <div class="window-head"><span class="dots"><i></i><i></i><i></i></span> Előnézet</div>
        <div class="canvas"><small>Videóprojekt</small><strong>Jó ötlet. Saját forma.</strong></div>
        <div class="timeline"><i></i><i></i><i></i></div>
      </div>
    </div>
  </section>
  <section class="capabilities" aria-labelledby="capabilities-title">
    <h2 id="capabilities-title">Mit készíthetsz a Műhelyben?</h2>
    <ul class="capability-list">
      <li><h3>Dizájn és kép</h3><p>Látványterv, borítókép vagy egyedi grafika. Képexport PNG-ben vagy JPEG-ben.</p></li>
      <li><h3>Videó</h3><p>Rakj össze jeleneteket, állítsd be a képméretet, és exportálj MP4-et.</p></li>
      <li><h3>Weboldal és alkalmazás</h3><p>Indulj saját ötletből vagy kész alapból, és próbáld ki a projektet az előnézetben.</p></li>
    </ul>
  </section>
</main>
<footer><div class="shell"><a href="https://tzsvthosting.com/">TZSVT Hosting</a></div></footer>
</body>
</html>`;
}
