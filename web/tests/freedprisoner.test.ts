import { describe, expect, it } from 'vitest';
import { K } from '../src/game/io.ts';
import { jimmyCommand } from '../src/game/items.ts';
import { stashWorldActors } from '../src/game/outdoors.ts';
import { journeyOnward } from '../src/game/run.ts';
import { talkToNpc } from '../src/game/talk.ts';
import { enterTown } from '../src/game/town.ts';
import { tileAt } from '../src/game/world.ts';
import { newGame } from './helpers.ts';

/**
 * A prisoner freed from Yew's stocks has no conversation since, as in 1988 (items.ts jimmyCommand); the port gives
 * them "Thank ye!" where 1988 gave "No response!" - which anyone else with nothing to say still gives.
 */
describe('a prisoner freed', () => {
  it('says "Thank ye!" when talked to after, where anyone else with nothing to say gives no response', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    stashWorldActors(g);
    Object.assign(g.s, { mapId: 4, level: 0, x: 15, y: 30, hour: 12 }); // Yew, at noon
    await enterTown(g, true);
    const s = g.s;
    // One in the stocks, and the party below them, with a key and a steady hand.
    const prisoner = [...Array(32).keys()].find((i) => {
      const a = s.actors[s.npcs[i].actor];
      return i > 0 && s.npcTypes[i] !== 0 && s.npcs[i].fa !== 0 && tileAt(g, a.x, a.y) === 0x84;
    })!;
    const at = s.actors[s.npcs[prisoner].actor];
    Object.assign(s, { x: at.x, y: at.y + 1, keys: 3, activeMember: 0 });
    s.members.forEach((m) => (m.dex = 40));
    p.keys.push(K.Up);
    await jimmyCommand(g);
    expect(p.log).toContain('I thank thee!');
    expect(s.npcs[prisoner].fa).toBe(0); // their conversation gone, as in 1988
    const from = p.log.length;
    await talkToNpc(g, prisoner);
    expect(p.log.slice(from)).toContain('"Thank ye!"');
    // Anyone else of the place with nothing to say (no guard, whose silence is his own): no response, as ever.
    const mute = [...Array(32).keys()].find(
      (i) => i > 0 && i !== prisoner && s.npcTypes[i] !== 0 && s.npcs[i].fa === 0 && s.actors[s.npcs[i].actor].tile !== 0x70,
    )!;
    expect(mute).toBeDefined();
    const before = p.log.length;
    await talkToNpc(g, mute);
    expect(p.log.slice(before)).toContain('No response!');
  });
});
