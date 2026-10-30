import { describe, expect, it } from 'vitest';
import { borderTitle, clearBorderTitle } from '../src/game/frame.ts';
import { CF } from '../src/game/game.ts';
import { Pad } from '../src/game/io.ts';
import { choose, playRows } from '../src/game/menu.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/**
 * The map's top border - the sky's strip, the place's name - is drawn when the game starts and, but for the sky's own
 * cells, never again: whatever a dialog draws over it stays there till the game is started anew. Nothing the play
 * puts up reaches it (EGA pixels: above row 8, left of the party box's border at 192).
 */
describe("the map's top border", () => {
  const watched = () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const over: string[] = [];
    const d = p.draw as unknown as Record<string, (...a: number[]) => void>;
    for (const k of ['fill', 'line', 'invert'] as const)
      d[k] = (x1, y1, x2, y2) => void (Math.min(y1, y2) < 8 && Math.min(x1, x2) < 192 && over.push(`${k} ${x1},${y1},${x2},${y2}`));
    return { g, p, over };
  };

  it('is clear of a list of play put at the top of the view in a fight, the one whose turn it is standing low', async () => {
    const { g, p, over } = watched();
    const s = g.s;
    Object.assign(s, { mapId: 0xff, combatTurn: 0, townAir: 0xff });
    Object.assign(g.combat[0], { who: 0, x: 5, y: 9, flags: CF.Player });
    expect(playRows(g).first).toBeLessThan(8); // at the top
    const items = Array.from({ length: 12 }, (_, i) => ({ label: `Line ${i}`, key: 0x41 + i }));
    p.next = () => Pad.B;
    await choose(g, 'Commands', items, 0, false, playRows(g));
    expect(over).toEqual([]);
  });

  it('is clear of the longest title the party box names, cut to what its border holds', () => {
    const { g, p, over } = watched();
    borderTitle(g, 'Which way, or here, or there?');
    clearBorderTitle(g);
    expect(over).toEqual([]);
    expect(p.rows[0].slice(0, 24).join('')).not.toMatch(/[A-Za-z]/);
  });
});
