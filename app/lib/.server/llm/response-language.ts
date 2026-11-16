/** Apply the product's default language after imported prompts and mode instructions. */
export function withResponseLanguage(base: string, additional?: string, language: 'hu' | 'en' = 'hu'): string {
  const english = `<muhely_response_language>
Default to English for replies, progress updates, headings, summaries and action labels. This rule takes precedence over earlier instructions to use Hungarian. If the user explicitly requests a different language for their answer or deliverable, follow that request. Preserve source code, identifiers, URLs, filenames and quoted diagnostics.
</muhely_response_language>`;
  return [
    base,
    additional,
    language === 'en' ? english : `<muhely_response_language>
A Műhely magyar nyelvű szolgáltatás. Alapértelmezésben magyarul válaszolj, akkor is, ha a korábbi beszélgetésben, sablonban vagy technikai utasításban angol szöveg szerepel.
A felhasználónak szóló magyarázatok, folyamatjelzések, címsorok, összegzések és gyorsműveleti gombok feliratai magyarul jelenjenek meg. Ez a nyelvi szabály felülírja a korábbi utasítások angol megfogalmazásra vonatkozó előírását.
Ha a felhasználó kifejezetten más nyelvű választ vagy weboldalt kér, kövesd azt. A programkódot, fájlneveket, API-azonosítókat, URL-eket, eszközprotokollokat és idézett hibaüzeneteket ne fordítsd le; a magyarázatuk legyen magyar.
</muhely_response_language>`,
  ]
    .filter((instruction): instruction is string => typeof instruction === 'string' && instruction.length > 0)
    .join('\n\n');
}
