import { describe, expect, it } from 'vitest';
import { drawCombatMarks, placeCombatant } from '../src/game/combat.ts';
import { journeyOnward } from '../src/game/run.ts';
import { Framebuffer, HI, HI_WIDTH } from '../src/ui/framebuffer';
import { newGame } from './helpers.ts';

/**
 * A fight's marks - the turn's outline, the snap target's arrows, a friend's warning, the crosshair - keep out of a box
 * over the view (a menu, the townsman's words), as the squares it covers are left undrawn (world.ts covered): drawn
 * over it, they showed through the command menu.
 */
describe("a fight's marks and a box over the view", () => {
  const fonts = [{ rows: new Uint8Array(128 * 8) }, { rows: new Uint8Array(128 * 8) }];
  /** The colour page's pixels changed between two copies, as EGA pixels (x, y). */
  const changed = (before: Uint32Array, after: Uint32Array): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = 0; i < after.length; i++)
      if (before[i] !== after[i]) out.push([Math.floor((i % HI_WIDTH) / HI), Math.floor(i / HI_WIDTH / HI)]);
    return out;
  };
  const inside = ([x, y]: [number, number], [a, b, c, d]: readonly number[]): boolean => x >= a && x <= c && y >= b && y <= d;

  it('draws no mark inside a masked box, and the rest of it outside', () => {
    const fb = new Framebuffer(new Uint8Array(512 * 128), fonts);
    // The square at view cell (5, 5) is EGA pixels 88-103; the box covers its left part and the margin round it.
    const box = [80, 80, 96, 112] as const;
    fb.mask([box]);
    const before = fb.hi[fb.page].slice();
    fb.marker(88, 88);
    fb.aim(88, 88, 0, 'attack', true);
    fb.aim(88, 88, 0, 'spell');
    fb.warn(88, 88);
    fb.pen = 15;
    fb.line(84, 95, 108, 95);
    const drawn = changed(before, fb.hi[fb.page]);
    expect(drawn.filter((p) => inside(p, box))).toEqual([]);
    expect(drawn.length).toBeGreaterThan(0); // the marks' right-hand parts
    // Unmasked, they draw there again.
    fb.mask(null);
    const again = fb.hi[fb.page].slice();
    fb.aim(88, 88, 0, 'spell');
    expect(changed(again, fb.hi[fb.page]).some((p) => inside(p, box))).toBe(true);
  });

  it('masks the marks with the boxes over the view while it draws them, and nothing after', () => {
    const { g } = newGame(1);
    journeyOnward(g);
    g.s.mapId = 0xff;
    g.options.tileSet = 'standard';
    const me = placeCombatant(g, 0, 1, 5, 8, 0);
    g.s.combatTurn = me;
    const masks: (readonly (readonly number[])[] | null)[] = [];
    let drawnMasked = 0;
    Object.assign(g.draw, {
      mask: (boxes: readonly (readonly number[])[] | null) => void masks.push(boxes),
      marker: () => void (masks.at(-1) && drawnMasked++),
      aim: () => void (masks.at(-1) && drawnMasked++),
      warn: () => void (masks.at(-1) && drawnMasked++),
    });
    g.covers.set('menu', [60, 100, 180, 180]);
    drawCombatMarks(g);
    expect(masks[0]).toEqual([[60, 100, 180, 180]]);
    expect(drawnMasked).toBeGreaterThan(0);
    expect(masks.at(-1)).toBeNull();
    // With no box over the view, nothing is masked.
    g.covers.clear();
    masks.length = 0;
    drawCombatMarks(g);
    expect(masks.every((m) => m === null)).toBe(true);
  });
});
