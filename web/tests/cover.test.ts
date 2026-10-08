import { describe, expect, it } from 'vitest';
import { actorAt, overlayActors, setTileAt, setView, viewAt } from '../src/game/world.ts';
import { T } from '../src/game/tiles.ts';
import { newGame } from './helpers.ts';

/**
 * Deep forest hides what stands in it (the DOS game's ULTIMA_5394): a monster there is not seen. The DOS game hid
 * the party too; the port keeps the party in sight, so the player never loses where they are.
 */
describe('under cover of deep forest', () => {
  /** The party on the world map at (45, 63), everything round it `ground`, and a monster two squares east. */
  const woods = (ground: number): ReturnType<typeof newGame>['g'] => {
    const { g } = newGame();
    const s = g.s;
    s.mapId = 0;
    s.level = 0;
    [s.x, s.y] = [45, 63];
    for (let y = 0; y < 11; y++)
      for (let x = 0; x < 11; x++) {
        setView(g, x, y, ground);
        setTileAt(g, s.x - 5 + x, s.y - 5 + y, ground);
      }
    for (const a of s.actors) a.tile = 0;
    const m = s.actors[1];
    [m.x, m.y, m.z, m.tile, m.anim] = [s.x + 2, s.y, 0, 0x88, 0x88];
    return g;
  };

  it('keeps the party in sight', () => {
    const g = woods(T.A);
    overlayActors(g);
    expect(viewAt(g, 5, 5)).toBe(0);
    expect(actorAt(g, 5, 5)).toBe(g.s.partyTile & 0xff);
  });

  it('still hides a monster', () => {
    const g = woods(T.A);
    overlayActors(g);
    expect(viewAt(g, 7, 5)).toBe(T.A);
  });

  it('hides nothing out of the forest', () => {
    const g = woods(T.Grass);
    overlayActors(g);
    expect(viewAt(g, 5, 5)).toBe(0);
    expect(viewAt(g, 7, 5)).toBe(0);
  });
});
