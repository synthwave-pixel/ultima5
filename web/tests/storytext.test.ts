import { describe, expect, it } from 'vitest';
import { clearSpaces, COPPER, GREY, paragraphs, setChoice, setProse, WHITE, type Measure } from '../src/ui/storyText';

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

  it("sets the gypsy's question between the bowls on a panel, the answers under them, in the game's lettering", () => {
    const runs = setChoice('Thou art sworn to a Lord. Dost thou', 'break thine oath by speaking;', 'uphold Honor by silence?', 0, measure);
    const words = runs.filter((r) => !r.panel);
    expect(words.every((r) => r.face === 'mono')).toBe(true); // the game's own lettering
    const lit = runs.find((r) => r.text.startsWith('Break'))!;
    expect(lit.colour).toBe(WHITE); // capitalised, its ';' gone, and white
    expect(lit.text.endsWith(';')).toBe(false);
    expect(lit.x + measure(lit.text, lit.size, 'mono')).toBeLessThan(160 * 4); // under the left bowl
    // Each answer centred on its brazier: the rims' middles, 66 and 250.
    const middle = (r: { x: number; text: string; size: number }): number => (r.x + measure(r.text, r.size, 'mono') / 2) / 4;
    expect(middle(lit)).toBeCloseTo(66, 0);
    const right = runs.find((r) => r.text.startsWith('Uphold'))!;
    expect(right.colour).toBe(GREY);
    expect(right.text.endsWith('?')).toBe(false);
    expect(right.x).toBeGreaterThan(160 * 4);
    expect(middle(right)).toBeCloseTo(250, 0);
    // The question in the column between the bowls, above the Avatar (112), on its dark panel; the answers under the
    // bowls, where 1988 has the braziers (no longer lowered).
    const question = words.filter((r) => r.text.includes('Lord') || r.text.includes('Dost') || r.text.includes('sworn'));
    expect(question.length).toBeGreaterThan(0);
    for (const r of question) {
      expect(r.x).toBeGreaterThanOrEqual(106 * 4);
      expect(r.x + measure(r.text, r.size, 'mono')).toBeLessThanOrEqual(214 * 4);
      expect(r.y).toBeLessThan(104 * 4);
    }
    const panel = runs.find((r) => r.panel)!.panel!;
    for (const r of question) {
      expect(r.y - r.size).toBeGreaterThanOrEqual(panel[1]);
      expect(r.y).toBeLessThanOrEqual(panel[3]);
    }
    expect(runs.indexOf(runs.find((r) => r.panel)!)).toBeLessThan(runs.indexOf(question[0])); // drawn under them
    expect(Math.min(lit.y, right.y) - lit.size).toBeGreaterThanOrEqual(150 * 4);
    expect(
      setChoice('Q', 'a', 'b', -1, measure)
        .filter((r) => r.colour === WHITE)
        .map((r) => r.text),
    ).toEqual(['Q...']);
    // A question that ends as a sentence does keeps its own stop.
    expect(setChoice('Which?', 'a', 'b', -1, measure).find((r) => r.colour === WHITE)?.text).toBe('Which?');
  });

  it("fits the longest of the gypsy's questions, and answers on two lines, in their bands", () => {
    const q =
      'Thee and thy friend are valiant but penniless warriors. Thou both go out to slay a mighty dragon. Thy friend thinks he slew it, thee did. When asked, dost thou';
    const runs = setChoice(
      q,
      'stop in Compassion to aid a wounded companion,',
      'sacrifice thyself to slow the pursuing enemy, so others can escape?',
      1,
      measure,
    );
    const words = runs.filter((r) => !r.panel);
    expect(words.map((r) => r.text).join(' ')).toContain('dost thou...'); // running on into the answers: trailing off
    for (const r of words) expect(r.y).toBeLessThanOrEqual(197 * 4);
    const answer = words.filter((r) => r.y > 150 * 4);
    expect(answer.length).toBeGreaterThanOrEqual(3); // an answer of more than one line
    expect(words[0].size).toBeGreaterThan(14); // not given up on: set at a size that fits
  });
});
