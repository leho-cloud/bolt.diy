export function selectTaskModel({
  text,
  selected,
  provider,
  mode,
}: {
  text: string;
  selected: string;
  provider: string;
  mode: 'manual' | 'economy' | 'balanced' | 'quality';
}) {
  if (provider !== 'OpenRouter' || mode === 'manual') {
    return selected;
  }

  const visualBuild =
    /(?:weboldal|website|landing|full app|from scratch|alkalmaz[aá]s|design|diz[aá]jn|arculat|megjelen[eé]s|https:\/\/)/i.test(
      text,
    );

  const broad = /(?:teljes|komplett|webapp|rendszer|architekt[uú]r|refaktor|entire app|whole project)/i.test(text);

  const medium =
    /(?:hib[aá]|jav[ií]t|k[oó]d|f[uü]ggv[eé]ny|komponens|typescript|javascript|api|sz[aá]m[ií]t[aá]s|funkci[oó])/i.test(
      text,
    );

  /*
   * Use the same explicit quality model as Műhely; never let an Auto Router or
   * a saved economy preference silently handle a reference-based design build.
   */
  if (visualBuild || broad || mode === 'quality') {
    const knownQuality = /^(?:anthropic\/claude-(?:sonnet|opus)|openai\/gpt-6)/i.test(selected);
    return knownQuality ? selected : 'anthropic/claude-sonnet-5.5';
  }

  return mode === 'economy' || !medium ? 'openai/gpt-4o-mini' : 'openai/gpt-4o';
}
