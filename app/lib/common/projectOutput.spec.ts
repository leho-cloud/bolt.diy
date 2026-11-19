import { describe, expect, it } from 'vitest';
import { inferProjectOutput } from './projectOutput';

describe('project delivery type', () => {
  it.each([
    ['https://www.fonixgoldfc.hu/ oldalt építsd meg szebben, tartalom és képek maradjanak az eredeti', 'web'],
    ['Készíts egy ügyfélkezelő appot', 'web'],
    ['Készíts egy animált üdvözlőt LED-kijelzőre, pontosan 768 × 256 pixelre', 'video'],
    ['készíts egy tiktok reklám videót a https://tzsvtavcloud.com/tartalom/ oldal tartalmából', 'video'],
    ['Készíts egy önálló képet a bemutatóhoz', 'image'],
    ['Készíts reklámképet PNG-ben', 'image'],
  ])('infers %s as %s', (title, output) => {
    expect(inferProjectOutput(title)).toBe(output);
  });
});
