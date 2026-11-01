export function welcomeDestination(address: string) {
  const url = new URL(address);

  return url.hostname === 'builder.tzsvthosting.com' && url.pathname === '/' && !url.search ? '/nyito' : null;
}

/** Resource page: opening the welcome screen never starts WebContainer or AI. */
export function loader() {
  return new Response(
    `<!doctype html>
<html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Műhely · TZSVT Hosting</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#101114;color:#f3f3f5;font:15px/1.65 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100svh;display:flex;flex-direction:column}
header,footer{width:min(960px,100%);margin:auto;padding:24px 28px;display:flex;align-items:center;gap:10px}header{margin-top:0;margin-bottom:0}.mark{width:32px;height:32px;display:grid;place-items:center;background:#df1945;border-radius:10px;font-weight:750;font-size:19px}.brand{font-size:15px;font-weight:650}.muted{color:#94949f;font-size:12px}
main{flex:1;display:grid;place-items:center;padding:48px 28px}.welcome{width:min(660px,100%)}.eyebrow{display:inline-flex;gap:8px;align-items:center;font-size:12px;color:#b0afb9;margin-bottom:20px}.dot{width:6px;height:6px;border-radius:50%;background:#d94c6c}h1{font-size:clamp(28px,4.8vw,40px);line-height:1.2;letter-spacing:-1.2px;font-weight:650;margin:0 0 20px;max-width:560px}p{margin:0;color:#aaaab5;max-width:510px}.actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:30px}a{color:inherit;text-decoration:none}a:focus-visible{outline:2px solid #f5a4b5;outline-offset:5px}.primary{background:#de1944;color:white;padding:11px 18px;border-radius:9px;font-size:14px;font-weight:600}.primary:hover{background:#ee2551}.secondary{color:#c3c2cc;padding:10px 4px;font-size:13px}.secondary:hover{color:white}.note{border-top:1px solid #292a31;margin-top:38px;padding-top:20px;font-size:12px;color:#81818e}footer{margin-bottom:0;justify-content:space-between;border-top:1px solid #24252b;color:#81818e;font-size:12px}@media(max-width:480px){header,footer{padding:20px}main{padding:40px 20px}.actions{align-items:stretch;flex-direction:column}.primary{text-align:center}.secondary{text-align:center}footer{gap:16px;flex-wrap:wrap}}
</style></head><body>
<header><span class="mark" aria-hidden="true">T</span><span class="brand">Műhely</span><span class="muted">by TZSVTAV</span></header>
<main><section class="welcome" aria-labelledby="welcome-title"><div class="eyebrow"><span class="dot"></span>Saját munkatér</div>
<h1 id="welcome-title">Ötletből kész weboldal.</h1>
<p>Írd le, mit szeretnél létrehozni. Készíts weboldalt vagy alkalmazást, és alakítsd tovább a saját elképzelésed szerint.</p>
<div class="actions"><a class="primary" href="/muhely">Műhely megnyitása <span aria-hidden="true">→</span></a>
<a class="secondary" href="https://xzmy2phls5uwuhltjhadbcbg.187.126.2.206.sslip.io/" target="_blank" rel="noopener noreferrer">Korábbi munkák megnyitása <span aria-hidden="true">↗</span></a></div>
<p class="note">A korábbi címen mentett projektjeid továbbra is ott érhetők el. Az új munkákat már itt készítheted.</p>
</section></main><footer><span>TZSVT Hosting</span><span>Privát hozzáférés</span></footer>
</body></html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}
