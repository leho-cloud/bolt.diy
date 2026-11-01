/** Apply the product's default language after imported prompts and mode instructions. */
export function withHungarianResponse(base: string, additional?: string): string {
  return [
    base,
    additional,
    `<muhely_response_language>
A Műhely magyar nyelvű szolgáltatás. Alapértelmezésben magyarul válaszolj, akkor is, ha a korábbi beszélgetésben, sablonban vagy technikai utasításban angol szöveg szerepel.
A felhasználónak szóló magyarázatok, folyamatjelzések, címsorok, összegzések és gyorsműveleti gombok feliratai magyarul jelenjenek meg. Ez a nyelvi szabály felülírja a korábbi utasítások angol megfogalmazásra vonatkozó előírását.
Ha a felhasználó kifejezetten más nyelvű választ vagy weboldalt kér, kövesd azt. A programkódot, fájlneveket, API-azonosítókat, URL-eket, eszközprotokollokat és idézett hibaüzeneteket ne fordítsd le; a magyarázatuk legyen magyar.
</muhely_response_language>`,
  ]
    .filter((instruction): instruction is string => typeof instruction === 'string' && instruction.length > 0)
    .join('\n\n');
}
