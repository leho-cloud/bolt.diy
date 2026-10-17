import crypto from 'node:crypto';
import type { ActionFunctionArgs } from 'react-router';

/**
 * Publish a public GitHub repository to a dedicated TZSVTAV preview domain.
 * Credentials are server-only. The endpoint is disabled until explicitly configured.
 */
export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Nem támogatott kérés.' }, { status: 405 });
  }

  // Prefer runtime Worker bindings supplied by the Docker-hosted Worker.
  const workerEnv = (context as unknown as { cloudflare?: { env?: Record<string, string> } })?.cloudflare?.env || {};
  const env = { ...process.env, ...workerEnv };
  const { COOLIFY_API_URL, COOLIFY_API_TOKEN, COOLIFY_PROJECT_UUID, COOLIFY_SERVER_UUID, COOLIFY_PUBLISH_KEY } = env;

  const requiredKeys = [
    'COOLIFY_API_URL',
    'COOLIFY_API_TOKEN',
    'COOLIFY_PROJECT_UUID',
    'COOLIFY_SERVER_UUID',
    'COOLIFY_PUBLISH_KEY',
  ] as const;
  const missingKeys = requiredKeys.filter((key) => !env[key]?.trim());

  if (missingKeys.length > 0) {
    return Response.json(
      { error: 'Hiányzó Coolify környezeti változók: ' + missingKeys.join(', ') },
      { status: 503 },
    );
  }

  const suppliedKey = request.headers.get('x-publish-key') || '';
  const expected = Buffer.from(COOLIFY_PUBLISH_KEY!);
  const supplied = Buffer.from(suppliedKey);

  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
    return Response.json({ error: 'Érvénytelen közzétételi jogosultság.' }, { status: 403 });
  }

  let body: { repository?: string; slug?: string };

  try {
    body = (await request.json()) as { repository?: string; slug?: string };
  } catch {
    return Response.json({ error: 'Érvénytelen kérés.' }, { status: 400 });
  }

  const slug = body.slug?.trim().toLowerCase() || '';
  const match = /^https:\/\/github\.com\/([a-z0-9-]+)\/([a-z0-9._-]+)\/?$/i.exec(body.repository || '');
  const allowedOwner = (env.COOLIFY_GITHUB_OWNER || 'leho-cloud').toLowerCase();

  if (!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(slug) || !match || match[1].toLowerCase() !== allowedOwner) {
    return Response.json({ error: 'Érvénytelen projektnév vagy GitHub-tároló.' }, { status: 400 });
  }

  const repo = `https://github.com/${match[1]}/${match[2]}`;
  const domain = `https://${slug}.builder.tzsvtav.com`;
  const base = COOLIFY_API_URL!.replace(/\/+$/, '').replace(/\/api\/v1$/, '') + '/api/v1';
  const headers = { Authorization: `Bearer ${COOLIFY_API_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' };
  const coolify = async (endpoint: string, init: RequestInit = {}) => {
    const response = await fetch(base + endpoint, { ...init, headers, signal: AbortSignal.timeout(25000) });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      throw new Error(typeof payload.message === 'string' ? payload.message : `Coolify API hiba (${response.status})`);
    }

    return payload;
  };

  try {
    // Only public repositories can be built by the public GitHub integration.
    const publicRepo = await fetch(`https://api.github.com/repos/${match[1]}/${match[2]}`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(12000),
    });

    if (!publicRepo.ok) {
      return Response.json({ error: 'A GitHub-tároló nem nyilvános vagy nem elérhető. A Coolify publikus GitHub-kapcsolatot használ.' }, { status: 400 });
    }

    const repoInfo = (await publicRepo.json()) as { private?: boolean; default_branch?: string };

    if (repoInfo.private) {
      return Response.json({ error: 'A GitHub-tároló privát. Ehhez a közzétételhez nyilvános tároló szükséges.' }, { status: 400 });
    }

    const applicationsData = await coolify('/applications');
    const applications = Array.isArray(applicationsData) ? applicationsData : (Array.isArray(applicationsData.data) ? applicationsData.data : []);
    const existing = applications.find((item: unknown) => {
      const app = item as { uuid?: string; fqdn?: string; domains?: string; git_repository?: string };
      return (app.fqdn || app.domains || '').split(',').includes(domain);
    }) as { uuid?: string; git_repository?: string } | undefined;

    if (existing && existing.git_repository && !existing.git_repository.includes(`${match[1]}/${match[2]}`)) {
      return Response.json({ error: 'Ez a domain már egy másik projekthez tartozik.' }, { status: 409 });
    }

    let uuid = existing?.uuid;

    if (!uuid) {
      const created = await coolify('/applications/public', {
        method: 'POST',
        body: JSON.stringify({
          project_uuid: COOLIFY_PROJECT_UUID,
          server_uuid: COOLIFY_SERVER_UUID,
          environment_name: env.COOLIFY_ENVIRONMENT_NAME || 'production',
          git_repository: repo,
          git_branch: repoInfo.default_branch || 'main',
          build_pack: 'nixpacks',
          ports_exposes: '3000',
          name: `TZSVTAV – ${slug}`,
          domains: domain,
          autogenerate_domain: false,
          noindex_domains: [domain],
        }),
      });
      uuid = typeof created.uuid === 'string' ? created.uuid : undefined;
    }

    if (!uuid) {
      throw new Error('A Coolify nem adott vissza alkalmazásazonosítót.');
    }

    const deployResult = await coolify(`/deploy?uuid=${encodeURIComponent(uuid)}`, { method: 'POST' });

    return Response.json({ success: true, domain, applicationUuid: uuid, status: 'queued', deployment: deployResult });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Ismeretlen telepítési hiba.' }, { status: 502 });
  }
}
