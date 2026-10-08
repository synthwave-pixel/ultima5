import { describe, expect, it } from 'vitest';
import { Intro, splitQuestion } from '../src/game/intro';
import { K } from '../src/game/io';
import { loadResource } from '../src/data/images';
import { newGame } from './helpers';

/**
 * The gypsy's questions in the Standard look (intro.ts dilemma, chooseBowl): each answer under the bowl of its
 * virtue's card, the Avatar walked to one by the d-pad, and A (or Return) taking it.
 */
describe("the gypsy's questions", () => {
  it('splits every question in the game into the question and its two answers', () => {
    const { g } = newGame();
    const f = g.data.files.get('QUESTION.DAT');
    const text = (o: number): string => {
      let s = '';
      for (let i = o; f[i]; i++) s += String.fromCharCode(f[i]);
      return s.replace(/_/g, '');
    };
    for (let a = 0; a < 8; a++)
      for (let b = 0; b < 8; b++) {
        if (a === b) continue;
        const q = splitQuestion(text(g.data.words(0x517c + a * 16, 8)[b]));
        expect(q, `${a} ${b}`).not.toBeNull();
        expect(q!.question).toMatch(/dost thou$/i);
        expect(q!.a.length).toBeGreaterThan(5);
        expect(q!.b.length).toBeGreaterThan(5);
      }
  });

  /** One question in the Standard look: the screen's words and the virtue given up, for the keys pressed. */
  async function ask(keys: number[]): Promise<{ left: string; right: string; lit: number[]; used: number[]; lost: number[] }> {
    const { g, p } = newGame();
    const shown: { left: string; right: string; lit: number[] } = { left: '', right: '', lit: [] };
    Object.assign(p.fx, {
      choice: (_q: string, left: string, right: string, lit: number) => {
        Object.assign(shown, { left, right });
        shown.lit.push(lit);
        return true;
      },
      stage: () => {},
    });
    p.keys.push(...keys);
    const intro = new Intro(g) as unknown as { dilemma(c: Uint8Array): Promise<void>; used: Uint8Array; lost: Uint8Array; stats: object };
    intro.stats = { int: 0, dex: 0, str: 0 };
    await intro.dilemma(loadResource(g.data.files, g.data.ovl, 'CREATE.16'));
    const idx = (a: Uint8Array): number[] => [...a].flatMap((v, i) => (v ? [i] : []));
    return { ...shown, used: idx(intro.used), lost: idx(intro.lost) };
  }

  it("takes the left bowl's answer - the lower virtue's card - when the Avatar is walked left and A pressed", async () => {
    const r = await ask([K.Left, K.Enter]);
    expect(r.lit[0]).toBe(-1); // both grey to begin with
    expect(r.lit).toContain(0); // the left one white once the Avatar stands there
    expect(r.lost).toEqual([Math.max(...r.used)]); // the right bowl's virtue given up
  });

  it("takes the right bowl's answer when walked right; A with the Avatar between the bowls takes nothing", async () => {
    const r = await ask([K.Enter, K.Right, K.Enter]);
    expect(r.lost).toEqual([Math.min(...r.used)]);
  });
});
