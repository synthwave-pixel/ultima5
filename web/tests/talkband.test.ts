import { describe, expect, it } from 'vitest';
import { Pad } from '../src/game/io.ts';
import { talkBand } from '../src/game/menu.ts';
import { stashWorldActors } from '../src/game/outdoors.ts';
import { journeyOnward } from '../src/game/run.ts';
import { talkToNpc } from '../src/game/talk.ts';
import { enterTown, loadLevel } from '../src/game/town.ts';
import { newGame } from './helpers.ts';

/**
 * The talk's menus in half the map's square (menu.ts talkBand, the port's): the half away from whoever the party talks
 * to, so the party at the middle and they beside it stay in sight - the top for one to the south, the bottom else.
 */
describe("the talk's menus, in half the view", () => {
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

  it('takes the half away from them: the bottom for one to the north, east or west, the top for one to the south', async () => {
    const { g, i } = await britain();
    const s = g.s;
    const a = s.actors[s.npcs[i].actor];
    Object.assign(a, { x: 16, y: 16 }); // in the middle of the towne, room on every side
    g.talk.npc = i;
    for (const [dx, dy, band] of [
      [0, 1, 'bottom'],
      [1, 0, 'bottom'],
      [-1, 0, 'bottom'],
      [0, -1, 'top'],
      [0, -2, 'top'], // across a counter
    ] as const) {
      Object.assign(s, { x: a.x + dx, y: a.y + dy });
      expect(talkBand(g), `${dx},${dy}`).toBe(band);
    }
  });

  it("draws the Say list in the band's ten rows, leaving the view's middle - the party's and their rows - as it was", async () => {
    const { g, p, i } = await britain();
    const s = g.s;
    const n = s.npcs[i];
    Object.assign(s, { level: n.z, x: n.x, y: n.y + 1 }); // south of them: the band at the bottom
    loadLevel(g, true);
    let window: { top: number; bottom: number } | null = null;
    p.next = () => {
      const m = g.menuShown;
      if (m?.title === 'Say' && !window) {
        const w = g.text.windows[3];
        window = { top: w.top, bottom: w.bottom };
        return Pad.B; // take leave
      }
      return Pad.A;
    };
    await talkToNpc(g, i).catch(() => undefined);
    expect(window).toEqual({ top: 13, bottom: 22 }); // the five rows of squares below the party's
  });
});
