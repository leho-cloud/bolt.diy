import {inspectTarget} from './coolify-target.mjs';
import {inspectCoolify} from './coolify-inspect.mjs';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { action } from '../app/routes/api.coolify-publish.ts';

export function createPublisherServer({ env = process.env, handler = action } = {}) {
  const send = (res, status, data) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify(data));
  };
  return http.createServer({ requestTimeout: 15000, headersTimeout: 10000, maxHeaderSize: 8192 }, async (req, res) => {
    try {
      if (req.url === '/health' && req.method === 'GET') {
        send(res, 200, {
          service: 'tzsvtav-existing-publisher',
          apiVersion: 1,
          publishingEnabled: env.TZSVTAV_PUBLISH_ENABLED === '1',
          privateOnly: true,
        });
        return;
      }
      if(req.url?.startsWith('/api/coolify-target?')){
        if(req.headers.origin){send(res,403,{error:'Server-to-server endpoint only.'});return;}
        const result=await inspectTarget(new Request('http://publisher.internal'+req.url,{method:req.method,headers:{'x-publish-key':req.headers['x-publish-key']||''}}),{env});send(res,result.status,await result.json());return;
      }
      if (req.url?.startsWith('/api/coolify-inspect?')) {
        if(req.headers.origin){send(res,403,{error:'Server-to-server endpoint only.'});return;}
        const result=await inspectCoolify(new Request('http://publisher.internal'+req.url,{method:req.method,headers:{'x-publish-key':req.headers['x-publish-key']||''}}),{env});
        send(res,result.status,await result.json());return;
      }
      if (req.url !== '/api/coolify-publish') {
        send(res, 404, { error: 'Unknown endpoint.' });
        return;
      }
      if (req.method !== 'POST') {
        send(res, 405, { error: 'POST required.' });
        return;
      }
      if (req.headers.origin) {
        send(res, 403, { error: 'Server-to-server endpoint only.' });
        return;
      }
      if (env.TZSVTAV_PUBLISH_ENABLED !== '1') {
        send(res, 503, { error: 'Publishing is disabled in this environment.' });
        return;
      }
      if (!req.headers['content-type']?.startsWith('application/json')) {
        send(res, 415, { error: 'JSON required.' });
        return;
      }
      const chunks = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 8192) {
          send(res, 413, { error: 'Request too large.' });
          return;
        }
        chunks.push(chunk);
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        send(res, 400, { error: 'Invalid JSON.' });
        return;
      }
      if (body?.source !== 'private-github-app') {
        send(res, 400, { error: 'Explicit pinned private source required.' });
        return;
      }
      const request = new Request('http://publisher.internal/api/coolify-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-publish-key': req.headers['x-publish-key'] || '' },
        body: JSON.stringify(body),
      });
      // Reuse the existing route; no second Coolify deployment implementation.
      const response = await handler({ request, context: { cloudflare: { env } } });
      res.writeHead(response.status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(await response.text());
    } catch {
      if (!res.headersSent)
        send(res, 502, { error: 'Publisher response could not be verified. Do not retry automatically.' });
      else res.destroy();
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createPublisherServer();
  server.listen(Number(process.env.PORT || 4320), process.env.HOST || '127.0.0.1', () =>
    console.log('TZSVTAV existing publisher HTTP adapter ready.'),
  );
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
