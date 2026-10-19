import { describe, expect, it } from 'vitest';
import { Pad } from '../src/game/io.ts';
import { stashWorldActors } from '../src/game/outdoors.ts';
import { journeyOnward } from '../src/game/run.ts';
import { talkMenuRows } from '../src/game/speech.ts';
import { talkToNpc } from '../src/game/talk.ts';
import { enterTown, loadLevel } from '../src/game/town.ts';
import { newGame } from './helpers.ts';

/**
 * The talk's menus at the foot of the view (menu.ts choose, speech.ts talkMenuRows, the port's): framed as the
 * townsman's words are at its top, as wide as their lines and centred, with no title - a row clear of the party, and of
 * the townsman where they stand to the south, so the party and they stay in sight.
 */
describe("the talk's menus, at the view's foot", () => {
  const britain = async () => {
    const made = newGame();
    const { g } = made;
    g.options.input = 'controller';
    journeyOnward(g);
    stashWorldActors(g);
    Object.assign(g.s, { mapId: 2, level: 0, x: 15, y: 30, hour: 12 });
    await enterTown(g, true);
    const s = g.s;
    const i = [...Array(32).keys()].find((k) => k > 0 && s.npcTypes[k] !== 0 && s.npcs[k].fa > 0 && s.npcs[k].fa < 0x80)!;
    return { ...made, i };
  };

  it('stops a row short of the party, or of the townsman to the south', () => {
    expect(talkMenuRows(0, -1)).toEqual({ first: 14, last: 21 }); // north of the party
    expect(talkMenuRows(1, 0)).toEqual({ first: 14, last: 21 }); // beside it
    expect(talkMenuRows(0, 1)).toEqual({ first: 16, last: 21 }); // south: short of them
    expect(talkMenuRows(0, 2)).toEqual({ first: 18, last: 21 }); // across a counter
    expect(talkMenuRows(0, 7)).toEqual(talkMenuRows(0, 0)); // farther: as beside
  });

  it('draws the Say list framed at the foot, centred, its lines and no title, the view above it as it was', async () => {
    const { g, p, i } = await britain();
    const s = g.s;
    const n = s.npcs[i];
    Object.assign(s, { level: n.z, x: n.x, y: n.y + 1 }); // south of them: the menu below the party
    loadLevel(g, true);
    let window: { left: number; right: number; top: number; bottom: number } | null = null;
    let first = '';
    p.next = () => {
      const m = g.menuShown;
      if (m?.title === 'Say' && !window) {
        const w = g.text.windows[3];
        window = { left: w.left, right: w.right, top: w.top, bottom: w.bottom };
        first = g.text.screenText(w.top, w.left, w.right).trim();
        return Pad.B; // take leave
      }
      return Pad.A;
    };
    await talkToNpc(g, i).catch(() => undefined);
    const w = window!;
    expect(w.bottom).toBe(21); // the view's last row
    expect(w.top).toBeGreaterThanOrEqual(14); // a row clear of the party's
    expect(w.right - w.left + 1).toBeLessThan(21); // as wide as its lines, not the view
    expect(Math.abs(w.left + (w.right - w.left + 1) / 2 - 12)).toBeLessThanOrEqual(1); // centred
    expect(first).toBe('Name'); // its first line, not "Say"
  });
});
