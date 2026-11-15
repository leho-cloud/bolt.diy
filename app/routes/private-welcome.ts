// eslint-disable-next-line no-restricted-imports
import { welcomePage } from '../../scripts/private-access/welcome.mjs';

export function welcomeDestination(address: string) {
  const url = new URL(address);

  return url.hostname === 'builder.tzsvthosting.com' && url.pathname === '/' && !url.search ? '/nyito' : null;
}

/** Resource page: opening the welcome screen never starts WebContainer or AI. */
export function loader() {
  return new Response(welcomePage(), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
