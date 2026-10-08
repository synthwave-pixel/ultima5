import { describe, expect, it } from 'vitest';
import { Fog, revealCells, revealView } from '../src/game/fog.ts';
import { serialize, restore } from '../src/game/storage.ts';
import { T } from '../src/game/tiles.ts';
import { newGame } from './helpers.ts';

describe('fog of war', () => {
  it('marks exactly what the viewport shows', () => {
    const { g } = newGame();
    g.s.mapId = 0;
    g.s.level = 0;
    g.s.x = 100;
    g.s.y = 80;
    g.view.fill(0xff);
    g.view[5 * 32 + 5] = 0x05; // under the party
    g.view[0] = 0x0a; // the far corner of the viewport
    g.view[4 * 32 + 6] = 0; // an actor stands here: the square is in plain sight
    revealView(g);
    expect(g.fog.seen(false, 100, 80)).toBe(true);
    expect(g.fog.seen(false, 95, 75)).toBe(true);
    expect(g.fog.seen(false, 101, 79)).toBe(true);
    expect(g.fog.seen(false, 96, 75)).toBe(false);
    expect(g.fog.seen(true, 100, 80)).toBe(false);
    expect(g.fog.count(false)).toBe(3);
  });

  it('is marked by the turn itself, out in the world', async () => {
    const { g } = newGame();
    const { enterWorld } = await import('../src/game/outdoors.ts');
    const { updateFrame } = await import('../src/game/frame.ts');
    g.s.mapId = 0;
    g.s.level = 0;
    g.s.x = 82; // the plain outside Britain, where a party can see some way
    g.s.y = 106;
    enterWorld(g);
    updateFrame(g);
    const seen = g.fog.count(false);
    expect(seen).toBeGreaterThan(20);
    expect(g.fog.seen(false, 82, 106)).toBe(true);
    expect(g.fog.seen(true, 82, 106)).toBe(false);
    // A step east shows more of the world, and never less.
    g.s.x = 83;
    g.viewDirty = 1;
    updateFrame(g);
    expect(g.fog.count(false)).toBeGreaterThan(seen);
  });

  it('leaves towns and dungeons alone', () => {
    const { g } = newGame();
    g.s.mapId = 1;
    g.view.fill(0x05);
    revealView(g);
    expect(g.fog.count(false)).toBe(0);
  });

  it('marks a town level from the viewport, keeping each level apart', () => {
    const { g } = newGame();
    g.s.mapId = 6; // a towne
    g.s.level = 0;
    g.s.x = 12;
    g.s.y = 14;
    g.view.fill(0xff);
    g.view[5 * 32 + 5] = 0x05;
    g.view[5 * 32 + 6] = 0x05;
    revealView(g);
    const level = g.fog.placeSeen(6, 0)!;
    expect(level[14 * 32 + 12]).toBe(1);
    expect(level[14 * 32 + 13]).toBe(1);
    expect(level[14 * 32 + 14]).toBe(0);
    expect(g.fog.placeSeen(6, 1)).toBeUndefined();
    expect(g.fog.placeSeen(7, 0)).toBeUndefined();
    expect(g.fog.count(false)).toBe(0); // the world is not touched
  });

  it("marks the cells round the party, corners and all, and a passage's walls to either hand", () => {
    const { g } = newGame();
    Object.assign(g.s, { mapId: 0x21, level: 0, x: 3, y: 3, d58a7: 0xff }); // a torch lit
    g.s.dungeon.fill(0xb0); // rock all round
    for (let x = 3; x <= 6; x++) g.s.dungeon[3 * 8 + x] = 0x00; // a passage running east
    revealCells(g);
    const level = g.fog.placeSeen(0x21, 0)!;
    const seen = (x: number, y: number): number => level[y * 8 + x];
    expect([seen(2, 2), seen(4, 4), seen(2, 4), seen(4, 2)]).toEqual([1, 1, 1, 1]); // the corners
    expect([seen(5, 2), seen(5, 4), seen(6, 2), seen(6, 4)]).toEqual([1, 1, 1, 1]); // the passage's walls
    expect(seen(7, 2)).toBe(0); // not past its end
  });

  it('keeps nothing in the dark: the cells round the party are shown while it stands there, and forgotten after', async () => {
    const { drawDungeonMap } = await import('../src/game/dungeonMap.ts');
    const { g } = newGame();
    Object.assign(g.s, { mapId: 0x21, level: 0, x: 3, y: 3, d58a6: 0, d58a7: 0 }); // no torch, no light spell
    g.s.dungeon.fill(0x00); // open floor all round
    revealCells(g);
    expect(g.fog.placeSeen(0x21, 0)).toBeUndefined();
    // The map shows the party's cell and the eight round it, felt for, and nothing further.
    Object.assign(g.options, { tileSet: 'standard', dungeonView: 'full' });
    const drawn = new Set<string>();
    g.draw.icon = (tile, x, y) => {
      if (tile === T.T44) drawn.add(`${x},${y}`);
      return true;
    };
    drawDungeonMap(g);
    expect(drawn.size).toBe(9);
    expect(g.fog.placeSeen(0x21, 0)).toBeUndefined();
    // A torch lit: what is seen from here now kept.
    g.s.d58a7 = 0xff;
    revealCells(g);
    expect(g.fog.placeSeen(0x21, 0)![3 * 8 + 6]).toBe(1); // three cells east, down the open floor
  });

  it('marks a dungeon cell and the passages leading off it', () => {
    const { g } = newGame();
    g.s.mapId = 0x21; // a dungeon
    g.s.d58a7 = 0xff; // a torch lit
    g.s.level = 2;
    g.s.x = 3;
    g.s.y = 3;
    g.s.dungeon.fill(0xb0); // rock all round
    const cell = (x: number, y: number): number => 2 * 0x40 + y * 8 + x;
    g.s.dungeon[cell(3, 3)] = 0x00; // the party's passage
    g.s.dungeon[cell(4, 3)] = 0x00; // and one running east
    g.s.dungeon[cell(5, 3)] = 0x00;
    revealCells(g);
    const level = g.fog.placeSeen(0x21, 2)!;
    expect(level[3 * 8 + 3]).toBe(1);
    expect(level[3 * 8 + 4]).toBe(1);
    expect(level[3 * 8 + 5]).toBe(1);
    expect(level[3 * 8 + 6]).toBe(1); // the rock at the end is seen
    expect(level[3 * 8 + 7]).toBe(0); // what lies beyond it is not
    expect(level[2 * 8 + 3]).toBe(1); // the rock to the north, and no further
    expect(level[1 * 8 + 3]).toBe(0);
  });

  it('starts blank for a new game', () => {
    const fog = new Fog();
    fog.mark(false, 1, 2);
    fog.mark(true, 3, 4);
    fog.markPlace(6, 0, 5, 6);
    fog.clear();
    expect(fog.count(false)).toBe(0);
    expect(fog.knowsUnderworld).toBe(false);
    expect(fog.placeSeen(6, 0)).toBeUndefined();
  });

  it('opens the Underworld only once it has been seen', () => {
    const fog = new Fog();
    expect(fog.knowsUnderworld).toBe(false);
    fog.mark(false, 10, 10);
    expect(fog.knowsUnderworld).toBe(false);
    fog.mark(true, 60, 60);
    expect(fog.knowsUnderworld).toBe(true);
  });

  it('packs and unpacks what is known', () => {
    const fog = new Fog();
    for (let x = 0; x < 256; x++) fog.mark(false, x, 7); // a whole row
    fog.mark(false, 0, 0);
    fog.mark(false, 255, 255);
    for (let i = 0; i < 40; i++) fog.mark(true, 3 * i, 2 * i);
    fog.markPlace(6, 0, 12, 14);
    fog.markPlace(0x21, 2, 3, 3);
    const packed = fog.encode();
    const back = Fog.decode(packed);
    expect([...back.brit]).toEqual([...fog.brit]);
    expect([...back.under]).toEqual([...fog.under]);
    expect(back.count(false)).toBe(fog.count(false));
    expect(back.knowsUnderworld).toBe(true);
    expect(back.placeSeen(6, 0)![14 * 32 + 12]).toBe(1);
    expect(back.placeSeen(0x21, 2)![3 * 8 + 3]).toBe(1);
    expect(back.placeSeen(0x21, 2)!.length).toBe(64);
    // Nearly all dark: what a new game holds should be a handful of characters, not a kilobyte.
    const fresh = new Fog();
    fresh.mark(false, 128, 128);
    expect(fresh.encode().brit.length).toBeLessThan(16);
    expect(fresh.encode().under.length).toBeLessThan(8);
  });

  it('travels in the saved game', () => {
    const { g } = newGame();
    g.fog.mark(false, 12, 34);
    g.fog.mark(true, 56, 78);
    const data = serialize(g);
    const { g: other } = newGame();
    restore(other, data);
    expect(other.fog.seen(false, 12, 34)).toBe(true);
    expect(other.fog.seen(true, 56, 78)).toBe(true);
    expect(other.fog.seen(false, 13, 34)).toBe(false);
  });

  it('keeps what has been mapped since the save was written', () => {
    const { g } = newGame();
    g.fog.mark(false, 10, 10);
    g.fog.markPlace(6, 0, 3, 4);
    const data = serialize(g);
    // On, further into the country, and into a town's cellar - then back to the save.
    g.fog.mark(false, 200, 200);
    g.fog.markPlace(6, 1, 9, 9);
    restore(g, data);
    expect(g.fog.seen(false, 10, 10)).toBe(true);
    expect(g.fog.seen(false, 200, 200)).toBe(true);
    expect(g.fog.placeSeen(6, 1)![9 * 32 + 9]).toBe(1);
    expect(g.fog.count(false)).toBe(2);
  });

  it('takes a save from before it existed', () => {
    const { g } = newGame();
    const data = serialize(g);
    delete data.fog;
    restore(g, data);
    expect(g.fog.count(false)).toBe(0);
    expect(g.fog.knowsUnderworld).toBe(false);
  });
});
