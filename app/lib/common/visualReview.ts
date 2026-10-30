/** Keep UI thumbnails out of model text context; the independent reviewer already received them as images. */
export function visualReviewModelOutput(output: unknown): any {
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return output ?? null;
  }

  const { images: _images, ...report } = output as Record<string, unknown>;

  return report;
}
