import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

export async function openCreditMeter(recordUsage) {
  const secret = randomBytes(32).toString('hex');
  const expected = Buffer.from(secret);
  const server = createServer(async (request, response) => {
    const token = request.headers.authorization?.replace(/^Bearer /, '') || '';
    const received = Buffer.from(token);
    if (request.method !== 'POST' || request.url !== '/usage' ||
      received.length !== expected.length || !timingSafeEqual(received, expected)) {
      response.writeHead(403).end();
      return;
    }

    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 1024) {
          response.writeHead(413).end();
          return;
        }
        chunks.push(chunk);
      }
      const { accountId, requestId, total } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (typeof accountId !== 'string' || !/^[a-f0-9-]{36}$/.test(accountId) ||
        typeof requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(requestId) ||
        !Number.isSafeInteger(total) || total <= 0 || total > 100_000_000) {
        response.writeHead(400).end();
        return;
      }
      response.writeHead(await recordUsage(accountId, requestId, total) ? 204 : 404).end();
    } catch {
      response.writeHead(503).end();
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  server.unref();

  return {
    context(accountId) {
      return [server.address().port, secret, accountId, randomUUID()].join('|');
    },
    close() {
      server.close();
    },
  };
}
