/** Worker-compatible client of the existing Műhely service. Provider secrets stay in Műhely. */
export function referenceUrls(text: string): string[] {
  return [...new Set((text.match(/https:\/\/[^\s<>"'\]\)]+/g) ?? []).map((value) => value.replace(/[.,;!?]+$/, '')))];
}

export function normalizeReferenceUrl(value: string) {
  const url = new URL(value);

  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search) {
    throw new Error('Nyilvános HTTPS-mintacím szükséges, belépési adatok és paraméterek nélkül.');
  }

  url.hash = '';

  return url.href;
}

export async function readLimited(response: Response, limit: number): Promise<string> {
  if (!response.body) {
    throw new Error('Üres szolgáltatói válasz.');
  }

  const reader = response.body.getReader(),
    decoder = new TextDecoder();

  let size = 0,
    text = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      size += value.byteLength;

      if (size > limit) {
        throw new Error('A szolgáltatói válasz túl nagy.');
      }

      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export interface ReferenceResult {
  sourceUrl: string;
  method: 'oxylabs-screenshot';
  referenceText: string;
  image: string;
  cached?: boolean;
}

export class ReferenceCaptureError extends Error {
  constructor(readonly status: number) {
    super(
      status === 429
        ? 'A napi mintabeolvasási keret elfogyott.'
        : 'A mintabeolvasási kapcsolat nem fejezte be a kérést.',
    );
  }
}

export async function captureReference({
  url,
  bridgeUrl,
  token,
  owner,
  signal,
  fetcher = fetch,
}: {
  url: string;
  bridgeUrl: string;
  token: string;
  owner: string;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}): Promise<ReferenceResult> {
  const endpoint = new URL('/api/integrations/bolt/reference', bridgeUrl);

  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) {
    throw new Error('A szerveroldali eszközkapcsolat HTTPS-címet igényel.');
  }

  const response = await fetcher(endpoint, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(180_000)]),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url: normalizeReferenceUrl(url), owner }),
  });

  const text = await readLimited(response, 2_000_000);

  if (!response.ok) {
    throw new ReferenceCaptureError(response.status);
  }

  const result = JSON.parse(text);

  if (
    result.method !== 'oxylabs-screenshot' ||
    typeof result.referenceText !== 'string' ||
    result.referenceText.length > 30_000 ||
    typeof result.image !== 'string' ||
    !/^data:image\/webp;base64,[A-Za-z0-9+/]+=*$/.test(result.image)
  ) {
    throw new Error('Nem érkezett használható kép a mintaoldalról.');
  }

  return {
    sourceUrl: normalizeReferenceUrl(result.sourceUrl),
    method: result.method,
    referenceText: result.referenceText,
    image: result.image,
  };
}
