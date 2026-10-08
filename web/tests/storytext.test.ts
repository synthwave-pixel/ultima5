import { describe, expect, it } from 'vitest';
import { clearSpaces, COPPER, GREY, GYPSY_DROP, paragraphs, setChoice, setProse, WHITE, type Measure } from '../src/ui/storyText';

/**
 * The Standard look's story pages (storyText.ts): a page's prose set in one block in its clearest space, its first
 * letter dropped; the gypsy's answers under their bowls. A letter here is ten pixels wide in any face and size.
 */
const measure: Measure = (text) => text.length * 10;

/** A page 320 by 200 lit (drawn on) where `lit(x, y)`. */
function page(lit: (x: number, y: number) => boolean): Uint8Array {
  const out = new Uint8Array(320 * 200);
  for (let y = 0; y < 200; y++) for (let x = 0; x < 320; x++) out[y * 320 + x] = lit(x, y) ? 1 : 0;
  return out;
}

describe('the story pages set in the Standard look', () => {
  it("reads the game's marks: a line break a paragraph, '{' an indent, '_' where a word may break", () => {
    const p = paragraphs('\n\n{From no_where, smoky\n"My friend!" he says');
    expect(p).toHaveLength(2);
    expect(p[0].indent).toBe(true);
    expect(p[0].words).toEqual([['From'], ['no', 'where,'], ['smoky']]);
    expect(p[1].words[0]).toEqual(['“My']); // quotes curled
    expect(p[1].words[1]).toEqual(['friend!”']);
  });

  it("finds the page's clear space beside its picture, kept clear of it", () => {
    const [widest] = clearSpaces(page((x) => x < 160));
    const [x, , w] = widest;
    expect(x).toBeGreaterThanOrEqual(165);
    expect(x + w).toBeLessThanOrEqual(314);
  });

  it('sets the prose in that space, its first letter dropped in copper, every word kept', () => {
    const text =
      '{Something rouses you and your eyes open sleepily to be met by a soft, blue glow re_flect_ing from the wall. Slowly, you turn your head.';
    const runs = setProse(
      [text],
      page((x) => x < 160),
      measure,
    )!;
    const initial = runs.find((r) => r.face === 'initial')!;
    expect(initial.text).toBe('S');
    expect(initial.colour).toBe(COPPER);
    for (const r of runs) expect(r.x).toBeGreaterThanOrEqual(160 * 4);
    const body = runs.filter((r) => r.face === 'body').map((r) => r.text);
    expect(['S', ...body].join(' ').replace('S ', 'S').replace(/- /g, '')).toBe(text.replace('{', '').replace(/_/g, ''));
  });

  it('gives a short passage no dropped letter, and gives up on a page with no room (1988 sets it)', () => {
    const runs = setProse(
      ['Instantly, a door springs up!'],
      page(() => false),
      measure,
    )!;
    expect(runs.every((r) => r.face === 'body')).toBe(true);
    expect(
      setProse(
        ['Some words'],
        page(() => true),
        measure,
      ),
    ).toBeNull();
  });

  it("sets the gypsy's question across the top, and the answers under their bowls, grey but for the one the Avatar stands at", () => {
    const runs = setChoice('Thou art sworn to a Lord. Dost thou', 'break thine oath by speaking;', 'uphold Honor by silence?', 0, measure);
    const left = runs.filter((r) => r.x < 160 * 4 && r.colour !== WHITE && r.text !== 'Dost thou');
    const lit = runs.find((r) => r.text.startsWith('Break'))!;
    expect(lit.colour).toBe(WHITE); // capitalised, its ';' gone, and white
    expect(lit.text.endsWith(';')).toBe(false);
    expect(left).toHaveLength(0);
    const right = runs.find((r) => r.text.startsWith('Uphold'))!;
    expect(right.colour).toBe(GREY);
    expect(right.text.endsWith('?')).toBe(false);
    expect(right.x).toBeGreaterThan(160 * 4);
    const question = runs.filter((r) => r.text.includes('Lord') || r.text.includes('Dost'));
    // The question over the braziers, the answers under the bowls, as far down as the braziers are lowered.
    expect(Math.max(...question.map((r) => r.y))).toBeLessThan(GYPSY_DROP * 4);
    expect(Math.min(lit.y, right.y) - lit.size).toBeGreaterThanOrEqual((150 + GYPSY_DROP) * 4);
    expect(
      setChoice('Q', 'a', 'b', -1, measure)
        .filter((r) => r.colour === WHITE)
        .map((r) => r.text),
    ).toEqual(['Q']);
  });
});
