import crypto from 'node:crypto';
import type { ActionFunctionArgs } from 'react-router';

/**
 * Publish a legacy public source or a pinned private static release to a TZSVTAV domain.
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

  if(env.TZSVTAV_REQUIRE_NEW_DEVELOPMENT==='1'&&env.COOLIFY_ENVIRONMENT_NAME!=='development')return Response.json({error:'Development scope required.'},{status:503});
  const suppliedKey = request.headers.get('x-publish-key') || '';
  const expected = Buffer.from(COOLIFY_PUBLISH_KEY!);
  const supplied = Buffer.from(suppliedKey);

  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
    return Response.json({ error: 'Érvénytelen közzétételi jogosultság.' }, { status: 403 });
  }

  let body: { repository?: string; slug?: string; branch?: string; source?: string; commit?: string };

  try {
    body = (await request.json()) as {
      repository?: string;
      slug?: string;
      branch?: string;
      source?: string;
      commit?: string;
    };
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('Invalid request body');
    }
  } catch {
    return Response.json({ error: 'Érvénytelen kérés.' }, { status: 400 });
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  const gitBranch = body.branch === undefined ? 'main' : typeof body.branch === 'string' ? body.branch.trim() : '';
  const pinnedPrivate = body.source === 'private-github-app';
  const commit = typeof body.commit === 'string' ? body.commit : '';
  if (
    (body.source !== undefined && !pinnedPrivate) ||
    (pinnedPrivate && (!/^[a-f0-9]{40}$/.test(commit) || !gitBranch.startsWith('dev/tzsvtav-release-'))) ||
    (!pinnedPrivate && body.commit !== undefined)
  ) {
    return Response.json({ error: 'Invalid pinned source request.' }, { status: 400 });
  }
  if (pinnedPrivate && !/^[a-z0-9_-]{1,100}$/i.test(env.COOLIFY_GITHUB_APP_UUID || '')) {
    return Response.json({ error: 'Private GitHub App connection is not configured.' }, { status: 503 });
  }
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
      const parts = /^(?:https:\/\/github\.com\/|git@github\.com:)?([a-z0-9-]+)\/([a-z0-9._-]+?)\/?$/i.exec(
        value.trim(),
      );
      return parts ? `${parts[1]}/${parts[2].replace(/\.git$/i, '')}`.toLowerCase() : null;
    };
    const setting = (app: Record<string, unknown>, name: string) => {
      const nested = app.settings && typeof app.settings === 'object' ? (app.settings as Record<string, unknown>)[name] : undefined;
      const flat = app[name];
      if (nested !== undefined && flat !== undefined && nested !== flat) return undefined;
      return nested ?? flat;
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
              const hostname=new URL(/^[a-z]+:/i.test(address) ? address : 'https://' + address).hostname;
              return hostname===expectedHost||(env.TZSVTAV_REQUIRE_NEW_DEVELOPMENT==='1'&&hostname.startsWith('*.')&&expectedHost.endsWith(hostname.slice(1)));
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

    if(env.TZSVTAV_REQUIRE_NEW_DEVELOPMENT==='1'&&collisions.length)return Response.json({error:'Existing application cannot be modified in new-development scope.'},{status:409});
    let uuid = collisions[0]?.uuid;

    if (uuid) {
      const existing = await coolify(`/applications/${encodeURIComponent(uuid)}`);
      if (
        canonicalRepo(existing.git_repository) !== canonicalRepo(repo) ||
        typeof existing.git_branch !== 'string' ||
        existing.git_branch !== gitBranch ||
        (pinnedPrivate &&
          (existing.git_commit_sha !== commit ||
            existing.build_pack !== 'static' ||
            setting(existing, 'is_static') !== true ||
            setting(existing, 'is_auto_deploy_enabled') !== false))
      ) {
        return Response.json(
          { error: 'A domain meglévő alkalmazásának tárolója vagy forrásága nem egyezik, vagy nem ellenőrizhető.' },
          { status: 409 },
        );
      }
    }

    if (!uuid) {
      const created = await coolify(pinnedPrivate ? '/applications/private-github-app' : '/applications/public', {
        method: 'POST',
        body: JSON.stringify({
          project_uuid: COOLIFY_PROJECT_UUID,
          server_uuid: COOLIFY_SERVER_UUID,
          environment_name: env.COOLIFY_ENVIRONMENT_NAME || 'production',
          git_repository: repo,
          git_branch: gitBranch,
          build_pack: pinnedPrivate ? 'static' : 'nixpacks',
          ports_exposes: pinnedPrivate ? '80' : '3000',
          ...(pinnedPrivate
            ? {
                github_app_uuid: env.COOLIFY_GITHUB_APP_UUID,
                git_commit_sha: commit,
                is_static: true,
                is_spa: false,
                publish_directory: '/',
                instant_deploy: false,
                is_auto_deploy_enabled: false,
                is_preview_deployments_enabled: false,
              }
            : {}),
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

    if (pinnedPrivate) {
      const confirmed = await coolify(`/applications/${encodeURIComponent(uuid)}`);
      if (
        canonicalRepo(confirmed.git_repository) !== canonicalRepo(repo) ||
        confirmed.git_branch !== gitBranch ||
        confirmed.git_commit_sha !== commit ||
        confirmed.build_pack !== 'static' ||
        setting(confirmed, 'is_static') !== true ||
        setting(confirmed, 'is_auto_deploy_enabled') !== false
      ) {
        return Response.json(
          { error: 'Pinned private application configuration cannot be verified. Deployment was not requested.' },
          { status: 409 },
        );
      }
    }

    const deployResult = await coolify(`/deploy?uuid=${encodeURIComponent(uuid)}`, { method: 'POST' });

    const privateDeployments = Array.isArray(deployResult.deployments)
      ? deployResult.deployments
          .map((item: unknown) => {
            const row = item as { deployment_uuid?: unknown };
            return typeof row?.deployment_uuid === 'string' && /^[a-z0-9_-]{1,100}$/i.test(row.deployment_uuid)
              ? { deployment_uuid: row.deployment_uuid }
              : null;
          })
          .filter(Boolean)
      : [];
    if (pinnedPrivate && privateDeployments.length !== 1) {
      return Response.json(
        { error: 'Deployment queue identifier is not verified. Check Coolify before retrying.' },
        { status: 502 },
      );
    }

    return Response.json({
      success: true,
      domain,
      applicationUuid: uuid,
      status: 'queued',
      branch: gitBranch,
      ...(pinnedPrivate ? { commit, source: 'private-github-app' } : {}),
      deployment: pinnedPrivate ? { deployments: privateDeployments } : deployResult,
    });
  } catch {
    return Response.json(
      { error: 'A közzététel nem igazolható. Ellenőrizd a Coolify állapotát; ne indítsd újra automatikusan.' },
      { status: 502 },
    );
  }
}
