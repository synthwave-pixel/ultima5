import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { getCommand } from '../src/game/items.ts';
import { getOffer } from '../src/game/targets.ts';
import { newGame } from './helpers.ts';

/** Out in Britannia on foot, the actors cleared, with a thing (tile) lying at (x, y). */
function outdoors(tile: number, x: number, y: number, input: 'controller' | 'letters' = 'controller') {
  const { g, p } = newGame();
  const s = g.s;
  g.options.input = input;
  g.inPlay = true;
  Object.assign(s, { mapId: 0, level: 0, x: 80, y: 100, partyTile: 0x1c });
  for (const a of s.actors.slice(1)) a.tile = 0;
  Object.assign(s.actors[5], { tile, anim: tile, x, y, z: 0 });
  return { g, p, s };
}

describe('Get of what lies underfoot', () => {
  it('is offered for a thing where the party stands, as for one beside it', () => {
    expect(getOffer(outdoors(0x1b, 80, 100).g)).toBe('show'); // the carpet, underfoot
    expect(getOffer(outdoors(0x1b, 81, 100).g)).toBe('show'); // beside
    expect(getOffer(outdoors(0x1b, 82, 100).g)).toBe('hide'); // out of reach
  });

  it('takes it with A at the prompt - the marked square, the party own', async () => {
    const { g, p, s } = outdoors(0x1b, 80, 100);
    const carpets = s.carpets;
    p.keys.push(Pad.A);
    await getCommand(g);
    expect(s.carpets).toBe(carpets + 1);
    expect(s.actors[5].tile).toBe(0);
    expect(p.log).toMatch(/Here/);
  });

  it('still asks only a way with nothing underfoot, A doing nothing there', async () => {
    const { g, p, s } = outdoors(0x1b, 81, 100);
    const carpets = s.carpets;
    p.keys.push(Pad.A, K.Right);
    await getCommand(g);
    expect(s.carpets).toBe(carpets + 1);
    expect(p.log).not.toMatch(/Here/);
  });

  it('keeps 1988 for the keyboard: Enter is no answer to the direction', async () => {
    const { g, p, s } = outdoors(0x1b, 80, 100, 'letters');
    const carpets = s.carpets;
    p.keys.push(K.Enter, K.Escape);
    await getCommand(g);
    expect(s.carpets).toBe(carpets);
    expect(p.log).toMatch(/Pass/);
  });
});
