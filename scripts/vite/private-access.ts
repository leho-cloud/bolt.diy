import { type IncomingMessage } from 'node:http';
import { join } from 'node:path';
import type { Plugin } from 'vite';

/* Node-only plugin code lives outside the application's ~/ alias. */
// eslint-disable-next-line no-restricted-imports
import { createAccessGate } from '../private-access/gate.mjs';

/** Runs in Node before Vite/Cloudflare preview can dispatch an API request. */
export function privateAccess(): Plugin {
  return {
    name: 'muhely-private-access',
    async configurePreviewServer(server) {
      const directory = process.env.BOLT_PRIVATE_ACCESS_DIR || join(process.cwd(), '.private-access');
      const gate = await createAccessGate(directory);
      server.middlewares.use(async (req, res, next) => {
        try {
          const host = req.headers.host || '';
          const local = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
          const allowed = ['builder.tzsvthosting.com', 'xzmy2phls5uwuhltjhadbcbg.187.126.2.206.sslip.io'];

          if (!local && !allowed.includes(host)) {
            res.statusCode = 403;
            res.end('Ez a cím nincs engedélyezve.');

            return;
          }

          const url = new URL(req.url || '/', `${local ? 'http' : 'https'}://${host}`);
          const ownPost = ['belepes', 'kijelentkezes', 'fiokom', 'hozzaferesek'].includes(url.pathname.slice(1));

          let body: string | undefined;

          if (ownPost && req.method === 'POST') {
            body = await readBody(req);
          }

          const headers = new Headers();

          for (const [name, value] of Object.entries(req.headers)) {
            if (value !== undefined && !['content-length', 'authorization'].includes(name)) {
              headers.set(name, Array.isArray(value) ? value.join(', ') : value);
            }
          }

          // Auth checks must not consume chat uploads, streaming requests or tool bodies.
          const request = new Request(url, { method: req.method, headers, body });
          const response = await gate.handle(request);

          if (!response) {
            delete req.headers.authorization;
            next();

            return;
          }

          res.statusCode = response.status;

          for (const [name, value] of response.headers) {
            res.setHeader(name, value);
          }
          res.end(req.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
        } catch {
          res.statusCode = 503;
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end('A belépési szolgáltatás most nem érhető el. Kérjük, próbáld később.');
        }
      });
    },
  };
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];

  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;

    if (size > 16384) {
      throw new Error('Authentication form too large');
    }

    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}
