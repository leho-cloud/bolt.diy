export type ProjectOutput = 'web' | 'image' | 'video';

export function inferProjectOutput(title: string): ProjectOutput {
  const text = title.toLocaleLowerCase('hu-HU');

  if (/vide[oó]|anim[aá](?:lt|ci[oó])|tiktok|reels|totem|mozg[oó]|slide/.test(text)) {
    return 'video';
  }

  if (/rekl[aá]mk[eé]p|plak[aá]t|poszter|log[oó]|bannert?|jpeg|png|önálló k[eé]p|social.*k[eé]p/.test(text)) {
    return 'image';
  }

  return 'web';
}
