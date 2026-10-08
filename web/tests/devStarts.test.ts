import { describe, expect, it } from 'vitest';
import { ARENAS, lookAsked, roomCell, roomsToShow, startRoom } from '../src/game/devStarts.ts';
import { entryRow } from '../src/game/dungeon.ts';
import { DEFAULTS } from '../src/game/settings.ts';
import { gameFiles, newGame } from './helpers.ts';

/** The development starts behind the tiles page's view of a place (devStarts.ts). */
describe('the development starts', () => {
  const dat = gameFiles().get('DUNGEON.DAT');

  it('name all sixteen of BRIT.CBT’s arenas, each with a creature', () => {
    expect(ARENAS).toHaveLength(16);
    expect(ARENAS.map((a) => a.name)).toContain('Bridge');
    expect(ARENAS.every((a) => a.foe > 0)).toBe(true);
    expect(ARENAS.filter((a) => a.aboard).map((a) => a.name)).toEqual([
      'Aboard ship: sea creatures',
      'Aboard ship: land creatures',
      'Aboard ship: pirates',
    ]);
  });

  it('find a room’s door, on the level asked or the first', () => {
    expect(roomCell(dat, 6, 0)).toEqual({ level: 0, x: 1, y: 1 }); // Shame's sealed cave, its way in
    const deep = roomCell(dat, 1, 3);
    expect(deep && dat[deep.level * 0x40 + deep.y * 8 + deep.x]).toBe(0xf3);
    expect(roomCell(dat, 2, 0)).toBeNull(); // Despise has no rooms
    expect(roomCell(dat, 6, 0, 7)).toBeNull(); // not on that level
  });

  it('show two rooms of each dungeon that has rooms: its first door and its deepest', () => {
    const rooms = roomsToShow(dat);
    expect(rooms).toHaveLength(14);
    expect(rooms.some((r) => r.dungeon === 2)).toBe(false);
    expect(rooms.find((r) => r.dungeon === 6)).toEqual({ dungeon: 6, room: 0, level: 0 });
    for (const r of rooms) expect(roomCell(dat, r.dungeon, r.room, r.level)).not.toBeNull();
  });

  it('take the look asked on the address for the page alone, and ignore what that UX does not offer', () => {
    const o = { ...DEFAULTS };
    lookAsked(o, new URLSearchParams('ux=original&tiles=apple2'));
    expect([o.tileSet, o.pcTiles, o.tiles]).toEqual(['original', 'apple2', DEFAULTS.tiles]);
    lookAsked(o, new URLSearchParams('ux=original&tiles=modern-pc'));
    expect(o.pcTiles).toBe('apple2'); // PC (1988) has no Modern PC
    lookAsked(o, new URLSearchParams('ux=standard&tiles=pc-ega'));
    expect([o.tileSet, o.tiles]).toEqual(['standard', 'pc-ega']);
    lookAsked(o, new URLSearchParams('ux=nintendo&tiles=nes'));
    expect([o.tileSet, o.tiles]).toEqual(['standard', 'pc-ega']);
  });

  it('come into a room from a side it has places for the party on, never all on 0, 0', () => {
    const { g } = newGame();
    const cbt = g.data.files.get('DUNGEON.CBT');
    const facings = g.data.bytes(0x2c76, 6);
    const stands = (d: number, room: number, way: number): boolean => {
      let n = d - 1;
      if (n >= 1) n--;
      const row = entryRow(facings[way]);
      const at = 0x1600 * n + room * 0x160 + row * 32;
      return cbt[at + 11] !== 0 || cbt[at + 17] !== 0;
    };
    let fixed = 0;
    for (let d = 1; d <= 8; d++)
      for (let room = 0; room < 16; room++) {
        if (!roomCell(dat, d, room)) continue;
        expect(startRoom(g, dat, d, room)).toBe(true);
        expect(stands(d, room, g.s.d6602), `dungeon ${d} room ${room}`).toBe(true);
        if (!stands(d, room, 5)) fixed++;
      }
    expect(fixed, 'rooms with no way in from above (the start came down into them)').toBeGreaterThan(0);
  });
});
