import { describe, expect, it } from 'vitest';
import { drawView, groundAround, groundUnder, setView } from '../src/game/world.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/**
 * A chair, a brazier or a lamp post is a map square of its own. The Standard look draws it on a clear ground, so
 * the game gives it the floor of the squares round it - the art direction's rule 2 (docs/art-brief.md §0).
 */
describe('the floor under a thing that stands', () => {
  const room = (floor: number): ReturnType<typeof newGame>['g'] => {
    const { g } = newGame();
    journeyOnward(g);
    for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) setView(g, x, y, floor);
    return g;
  };

  it('is the floor of the squares round it', () => {
    const g = room(0x40); // planks
    setView(g, 5, 5, 0x92); // a chair
    expect(groundAround(g, 5, 5)).toBe(0x40);
  });

  it('is the floor most of them show, those beside it counting before those at its corners', () => {
    const g = room(0x44);
    for (const [x, y] of [
      [4, 4],
      [6, 4],
      [4, 6],
      [6, 6],
    ])
      setView(g, x, y, 0x40); // planks at all four corners
    setView(g, 5, 5, 0xb2); // a brazier
    expect(groundAround(g, 5, 5)).toBe(0x44); // stone beside it, on all four sides, outweighs them
  });

  it('passes over walls and other furniture, and outdoors is the grass', () => {
    const g = room(0x4f); // walls all round
    setView(g, 5, 5, 0xbd); // a lamp post
    setView(g, 5, 6, 0x05); // one square of grass
    expect(groundAround(g, 5, 5)).toBe(0x05);
  });

  it('is the worn earth of a clearing, as much as grass (the land drawn from the map runs on under a hut)', () => {
    const g = room(0x24); // a clearing all round
    setView(g, 5, 5, 0x10); // a hut
    expect(groundAround(g, 5, 5)).toBe(0x24);
  });

  it('is the mountains under a cave, a mine or a dungeon, whatever is before it', () => {
    const g = room(0x05);
    setView(g, 5, 5, 0x18); // a dungeon's mouth, in the grass
    expect(groundUnder(g, 5, 5, 0x18)).toBe(0x0c);
    expect(groundUnder(g, 5, 5, 0x10)).toBe(0x05); // a hut stands on the grass round it
  });

  it('is the grass under brush and scrub, not their bushes', () => {
    const g = room(0x06); // brush all round
    setView(g, 5, 5, 0x10); // a hut
    expect(groundAround(g, 5, 5)).toBe(0x05);
  });

  it('is handed to the tile drawing for a thing that stands, and not for a floor', () => {
    const g = room(0x40);
    setView(g, 5, 5, 0x92);
    const drawn = new Map<string, number | undefined>();
    g.draw.tile = (tile: number, x: number, y: number, ground?: number) => {
      drawn.set(`${x},${y}`, ground);
      void tile;
    };
    drawView(g);
    expect(drawn.get('5,5')).toBe(g.cycles.shown[0x40]);
    expect(drawn.get('2,2')).toBeUndefined();
  });

  it('is handed on under a thing that stands, when someone stands on it', () => {
    const g = room(0x40);
    setView(g, 5, 5, 0); // someone here...
    g.groundMap[5 * 16 + 5] = 0xa6; // ...on a barrel
    g.actorMap[5 * 16 + 5] = 0x50;
    const drawn = new Map<string, [number | undefined, number | undefined]>();
    g.draw.tile = (tile: number, x: number, y: number, ground?: number, _place?: unknown, _tint?: number, floor?: number) => {
      drawn.set(`${x},${y}`, [ground, floor]);
      void tile;
    };
    drawView(g);
    expect(drawn.get('5,5')).toEqual([g.cycles.shown[0xa6], g.cycles.shown[0x40]]);
  });
});
