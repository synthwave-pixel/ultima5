import { describe, expect, it } from 'vitest';
import { K } from '../src/game/io.ts';
import { choose } from '../src/game/menu.ts';
import { newGame } from './helpers.ts';

/**
 * A box over the map (menu.ts box: Use, Ready, a question): its border half a character out from its words, and
 * never on the screen's frame - a box as wide as the map's square takes the frame for its sides.
 */
describe('a box over the map', () => {
  /** The lines a list's box draws, as the Draw sees them. */
  const lines = async (labels: string[]): Promise<[number, number, number, number][]> => {
    const { g, p } = newGame();
    g.inPlay = true; // over the map: at the title a box has a frame of its own (titleBox below)
    const drawn: [number, number, number, number][] = [];
    g.draw.line = (x1, y1, x2, y2) => void drawn.push([x1, y1, x2, y2]);
    p.keys.push(K.Escape);
    await choose(
      g,
      'Items',
      labels.map((label) => ({ label })),
      0,
      true,
    );
    return drawn;
  };

  it('keeps its sides off the frame, the widest taking the frame for them', async () => {
    const narrow = await lines(['Dagger x6', 'Club x1']);
    expect(narrow).toHaveLength(4);
    for (const [x1, , x2] of narrow) expect(Math.min(x1, x2)).toBeGreaterThanOrEqual(8);
    const wide = await lines(['Scroll: Protection x2', 'Pocket Watch']); // 21 letters: the map's width
    expect(wide).toHaveLength(2); // top and bottom only
    for (const [x1, , x2] of wide) expect([x1, x2]).toEqual([8, 0xb7]);
  });

  it("at the title, has a frame of its own in the middle of the screen, above the menu's box", async () => {
    const { g, p } = newGame();
    const fills: [number, number, number, number][] = [];
    const fill = g.draw.fill.bind(g.draw);
    g.draw.fill = (x1, y1, x2, y2) => {
      if (g.draw.pen === 1) fills.push([x1, y1, x2, y2]);
      fill(x1, y1, x2, y2);
    };
    p.keys.push(K.Escape);
    await choose(g, 'Thine Adventure', [{ label: 'Modern (recommended)' }, { label: 'Classic (as in 1988)' }], 0, true);
    // The frame's blue band: seven pixels deep round the box, centred across the screen, clear of the menu (row 15).
    const [x1, y1, x2, y2] = [
      Math.min(...fills.map((f) => f[0])),
      Math.min(...fills.map((f) => f[1])),
      Math.max(...fills.map((f) => f[2])),
      Math.max(...fills.map((f) => f[3])),
    ];
    expect(Math.abs(x1 + x2 - 319)).toBeLessThanOrEqual(8); // centred, to the character
    expect(y2).toBeLessThan(120);
    expect(fills.some(([a, b, c, d]) => a === x1 && b === y1 && c === x2 && d === y1 + 6)).toBe(true);
  });
});
