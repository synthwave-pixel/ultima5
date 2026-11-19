import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/gameCore.ts';
import {
  dungeonMapSource,
  drawDungeonMap,
  useDungeonMap,
  type DungeonMapSource,
  type Kind,
  type MapLevel,
} from '../src/game/dungeonMap.ts';
import { FakePlatform, newGame } from './helpers.ts';

/**
 * The dungeon map reads a game's dungeon through its DungeonMapSource (dungeonMap.ts useDungeonMap): any game's -
 * Ultima V's from its save and its fog (ultima5DungeonMap.ts), another game's (the Ultima IV port's) from its own.
 */

/** A level of rock but a passage of three cells along row 2 - a floor, an orb, a trap - seen; the party on the floor. */
function testLevel(): MapLevel {
  const row: Record<number, Kind> = { 1: 'floor', 2: 'orb', 3: 'trap' };
  const known = new Uint8Array(64);
  for (const x of [1, 2, 3]) known[2 * 8 + x] = 1;
  return {
    scene: 'test',
    x: 1,
    y: 2,
    facing: 1,
    kind: (x, y) => (y === 2 ? (row[x] ?? 'rock') : 'rock'),
    detail: () => 0,
    joins: (x, y) => y === 2 && x >= 1 && x <= 3,
    known: () => known,
    dark: false,
    creatures: () => [],
    look: () => ({ tiles: [] }),
  };
}

function testGame(level: MapLevel | null) {
  const p = new FakePlatform();
  const g = new GameCore(p);
  const source: DungeonMapSource = {
    view: { x1: 8, y1: 8, x2: 0xb7, y2: 0xb7 },
    standard: () => false,
    compact: () => false,
    leader: () => null,
    level: () => level,
  };
  useDungeonMap(g, source);
  const fills: [number, number, number, number, number][] = [];
  p.draw.fill = (x1, y1, x2, y2) => void fills.push([x1, y1, x2, y2, p.draw.pen]);
  return { g, fills };
}

describe('the dungeon map, for any game', () => {
  it('draws the source’s level in its view’s box: the whole view black, a cell at each cell known', () => {
    const { g, fills } = testGame(testLevel());
    g.options.dungeonMap = 'full';
    drawDungeonMap(g);
    // The view's box filled black, the map's 8 cells of 20 centred in its 176 pixels: from 8 + 8 = 16.
    expect(fills[0]).toEqual([8, 8, 0xb7, 0xb7, 0]);
    const at = (x: number, y: number): number[] => [16 + x * 20, 16 + y * 20];
    const inCell = (x: number, y: number, pen: number) =>
      fills.some(
        ([x1, y1, x2, y2, c]) => c === pen && x1 >= at(x, y)[0] && x2 < at(x, y)[0] + 20 && y1 >= at(x, y)[1] && y2 < at(x, y)[1] + 20,
      );
    // The passage's three in light grey; the orb marked bright magenta; a rock cell never seen, nothing.
    for (const x of [1, 2, 3]) expect(inCell(x, 2, 7), `cell ${x}`).toBe(true);
    expect(inCell(2, 2, 13)).toBe(true);
    expect(fills.some(([x1, y1]) => x1 >= at(5, 5)[0] && x1 < at(5, 5)[0] + 20 && y1 >= at(5, 5)[1] && y1 < at(5, 5)[1] + 20)).toBe(false);
  });

  it('draws in the corner of the source’s view with the map in the corner, and nothing with it off', () => {
    const { g, fills } = testGame(testLevel());
    g.options.dungeonMap = 'small';
    drawDungeonMap(g);
    // The corner's grid: 8 cells of 8 pixels, its right edge 3 in from the view's.
    expect(fills[0]).toEqual([0xb7 - 67 - 2, 11 - 2, 0xb7 - 67 + 64 + 1, 11 + 64 + 1, 0]);
    const off = testGame(testLevel());
    off.g.options.dungeonMap = 'off';
    drawDungeonMap(off.g);
    expect(off.fills).toEqual([]);
  });

  it('draws nothing outside a dungeon, or for a game with no source', () => {
    const { g, fills } = testGame(null);
    g.options.dungeonMap = 'full';
    drawDungeonMap(g);
    expect(fills).toEqual([]);
    const bare = new GameCore(new FakePlatform());
    expect(dungeonMapSource(bare)).toBeNull();
    drawDungeonMap(bare);
  });

  it('is Ultima V’s in Ultima V’s game: its view’s box, its cells read from the save', () => {
    const { g } = newGame();
    const source = dungeonMapSource(g)!;
    expect(source.view).toEqual({ x1: 0x10, y1: 0x0e, x2: 0xaf, y2: 0xb2 });
    expect(source.level()).toBeNull(); // in Britannia
    Object.assign(g.s, { mapId: 0x21, level: 0, x: 2, y: 3, facing: 1 });
    g.s.dungeon[3 * 8 + 4] = 0x10;
    g.s.dungeon[3 * 8 + 5] = 0xd0; // a hidden door: rock, but the level joins through it
    const level = source.level()!;
    expect([level.scene, level.x, level.y, level.facing]).toEqual(['33:0', 2, 3, 1]);
    expect([level.kind(4, 3), level.kind(5, 3), level.joins(5, 3)]).toEqual(['up', 'rock', true]);
  });
});
