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
    return Response.json({ error: 'Hiányzó Coolify környezeti változók: ' + missingKeys.join(', ') }, { status: 503 });
  }

  const suppliedKey = request.headers.get('x-publish-key') || '';
  const expected = Buffer.from(COOLIFY_PUBLISH_KEY!);
  const supplied = Buffer.from(suppliedKey);

  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
    return Response.json({ error: 'Érvénytelen közzétételi jogosultság.' }, { status: 403 });
  }

  let body: { repository?: string; slug?: string; branch?: string };

  try {
    body = (await request.json()) as { repository?: string; slug?: string; branch?: string };
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('Invalid request body');
    }
  } catch {
    return Response.json({ error: 'Érvénytelen kérés.' }, { status: 400 });
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  const gitBranch = body.branch === undefined ? 'main' : typeof body.branch === 'string' ? body.branch.trim() : '';
  const validBranch =
    /^[a-z0-9][a-z0-9._/-]{0,119}$/i.test(gitBranch) &&
    !gitBranch.includes('..') &&
    !gitBranch.includes('//') &&
    gitBranch
      .split('/')
      .every((part) => part && !part.startsWith('.') && !part.endsWith('.') && !part.endsWith('.lock'));
  const match = /^https:\/\/github\.com\/([a-z0-9-]+)\/([a-z0-9._-]+)\/?$/i.exec(
    typeof body.repository === 'string' ? body.repository : '',
  );
  const allowedOwner = (env.COOLIFY_GITHUB_OWNER || 'leho-cloud').toLowerCase();

  if (
    !validBranch ||
    !/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(slug) ||
    !match ||
    match[1].toLowerCase() !== allowedOwner
  ) {
    return Response.json({ error: 'Érvénytelen projektnév, GitHub-tároló vagy forráság.' }, { status: 400 });
  }

  const repo = `https://github.com/${match[1]}/${match[2]}`;
  const domain = `https://${slug}.builder.tzsvtav.com`;
  const base = COOLIFY_API_URL!.replace(/\/+$/, '').replace(/\/api\/v1$/, '') + '/api/v1';

  const headers = {
    Authorization: `Bearer ${COOLIFY_API_TOKEN}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const coolify = async (endpoint: string, init: RequestInit = {}) => {
    const response = await fetch(base + endpoint, {
      ...init,
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(25000),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      throw new Error(`Coolify API hiba (HTTP ${response.status}).`);
    }

    return payload;
  };

  try {
    /*
     * The repository owner is allowlisted above. Let Coolify perform repository
     * access checks during deployment instead of blocking on GitHub API rate
     * limits or outbound network failures from the Worker.
     */
    const applicationsData = await coolify('/applications');

    const applications = Array.isArray(applicationsData)
      ? applicationsData
      : Array.isArray(applicationsData.data)
        ? applicationsData.data
        : null;

    if (
      !applications ||
      applications.some((item: unknown) => !item || typeof item !== 'object' || Array.isArray(item))
    ) {
      throw new Error('A Coolify alkalmazáslistája nem ellenőrizhető.');
    }

    const expectedHost = new URL(domain).hostname;
    const canonicalRepo = (value: unknown) => {
      if (typeof value !== 'string') return null;
      const parts = /^(?:https:\/\/github\.com\/|git@github\.com:)([a-z0-9-]+)\/([a-z0-9._-]+?)\/?$/i.exec(
        value.trim(),
      );
      return parts ? `${parts[1]}/${parts[2].replace(/\.git$/i, '')}`.toLowerCase() : null;
    };
    const collisions = applications.filter((item: unknown) => {
      if (!item || typeof item !== 'object') return false;
      const app = item as { fqdn?: string; domains?: string };
      return [app.fqdn, app.domains].some(
        (values) =>
          typeof values === 'string' &&
          values.split(',').some((value) => {
            try {
              const address = value.trim();
              return new URL(/^[a-z]+:/i.test(address) ? address : 'https://' + address).hostname === expectedHost;
            } catch {
              return false;
            }
          }),
      );
    }) as { uuid?: string }[];

    if (
      collisions.length > 1 ||
      (collisions.length === 1 &&
        (typeof collisions[0].uuid !== 'string' || !/^[a-z0-9_-]{1,100}$/i.test(collisions[0].uuid)))
    ) {
      return Response.json({ error: 'A domainhez tartozó alkalmazás nem azonosítható egyértelműen.' }, { status: 409 });
    }

    let uuid = collisions[0]?.uuid;

    if (uuid) {
      const existing = await coolify(`/applications/${encodeURIComponent(uuid)}`);
      if (
        canonicalRepo(existing.git_repository) !== canonicalRepo(repo) ||
        typeof existing.git_branch !== 'string' ||
        existing.git_branch !== gitBranch
      ) {
        return Response.json(
          { error: 'A domain meglévő alkalmazásának tárolója vagy forrásága nem egyezik, vagy nem ellenőrizhető.' },
          { status: 409 },
        );
      }
    }

    if (!uuid) {
      const created = await coolify('/applications/public', {
        method: 'POST',
        body: JSON.stringify({
          project_uuid: COOLIFY_PROJECT_UUID,
          server_uuid: COOLIFY_SERVER_UUID,
          environment_name: env.COOLIFY_ENVIRONMENT_NAME || 'production',
          git_repository: repo,
          git_branch: gitBranch,
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

    return Response.json({
      success: true,
      domain,
      applicationUuid: uuid,
      status: 'queued',
      branch: gitBranch,
      deployment: deployResult,
    });
  } catch {
    return Response.json(
      { error: 'A közzététel nem igazolható. Ellenőrizd a Coolify állapotát; ne indítsd újra automatikusan.' },
      { status: 502 },
    );
  }
}
