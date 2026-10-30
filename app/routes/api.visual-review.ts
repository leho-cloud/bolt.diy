import type { ActionFunctionArgs } from 'react-router';
import { toApiErrorResponse, ValidationError } from '~/lib/.server/api/errors';
import { readJsonBody } from '~/lib/.server/api/read-body';
import { reviewVisualImages, visualRequestSchema } from '~/lib/.server/website/visual-review';
import { withSecurity } from '~/lib/security';

export const action = withSecurity(visualReviewAction, { allowedMethods: ['POST'] });

async function visualReviewAction({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'POST szükséges.' }, { status: 405 });
  }

  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ error: 'Az ellenőrzés csak a Műhelyből indítható.' }, { status: 403 });
  }

  try {
    const body = visualRequestSchema.safeParse(await readJsonBody(request, { maxBytes: 1_700_000 }));

    if (!body.success) {
      throw new ValidationError('Két érvényes, saját előnézeti kép szükséges.');
    }

    const env = { ...process.env, ...((context.cloudflare?.env as unknown as Record<string, string>) ?? {}) };

    return Response.json(await reviewVisualImages(body.data, env, request.signal));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
