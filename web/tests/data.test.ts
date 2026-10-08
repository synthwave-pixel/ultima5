import { describe, expect, it } from 'vitest';
import { DataOvl } from '../src/data/dataOvl.ts';
import { readFont } from '../src/data/font.ts';
import { readBritannia, readLocations, readTownLevel, readUnderworld, tileAt } from '../src/data/maps.ts';
import { readTiles } from '../src/data/tiles.ts';
import { gameFiles } from './helpers.ts';

const files = gameFiles();
const ovl = new DataOvl(files.get('DATA.OVL'));

describe('DATA.OVL', () => {
  it('reads strings through the pointer tables', () => {
    expect(ovl.strings(0x1f4e, 8)).toEqual([
      'Honesty',
      'Compassion',
      'Valour',
      'Justice',
      'Sacrifice',
      'Honor',
      'Spirituality',
      'Humility',
    ]);
  });
  it('reads the monster stats table (D_13bc)', () => {
    // Mage: Str 10 Dex 15 Int 20 Def 0 Atk 15 HP 10
    expect([...ovl.bytes(0x13bc, 6)]).toEqual([10, 15, 20, 0, 15, 10]);
  });
});

describe('tiles and font', () => {
  it('decodes 512 tiles', () => {
    expect(readTiles(files.get('TILES.16')).length).toBe(512 * 256);
  });
  it('reads IBM.CH', () => {
    expect(readFont(files.get('IBM.CH')).rows.length).toBe(1024);
  });
});

describe('maps', () => {
  const locations = readLocations(ovl);

  it('places Britain at its entrance in Britannia', () => {
    const brit = readBritannia(files, ovl);
    const britain = locations[1];
    expect(britain.name).toBe('BRITAIN');
    expect(tileAt(brit, britain.x, britain.y)).toBe(0x14); // a towne
  });

  it('reads the Underworld in the chunks it is stored in', () => {
    const under = readUnderworld(files);
    expect(under.tiles.length).toBe(65536);
    // Every square must be where the party walking there finds it: the original reads a 16x16 chunk from the
    // offset (y & 0xf0) << 8 | (x & 0xf0) << 4 (u5d outsubs.c OUTSUBS_01b4/0098), not the file read straight through.
    const raw = files.get('UNDER.DAT');
    for (const [x, y] of [
      [0, 0],
      [17, 3],
      [128, 128],
      [199, 44],
      [255, 255],
    ]) {
      const chunk = (((y & 0xf0) << 8) | ((x & 0xf0) << 4)) & 0xffff;
      expect(tileAt(under, x, y)).toBe(raw[chunk + (y & 15) * 16 + (x & 15)]);
    }
  });

  it('gives each settlement its levels', () => {
    expect(locations[16].name).toBe("Lord British's castle");
    expect(locations[16].levels).toEqual([-1, 0, 1, 2, 3]);
    expect(locations[17].levels).toEqual([-1, 0, 1, 2, 3]);
    expect(locations[0].levels).toEqual([0, 1]);
    expect(locations[31].levels).toEqual([-1, 0, 1]);
    // Yew's cellar is the map before its ground floor, not a third floor of Jhelom.
    expect(locations[2].levels).toEqual([0, 1]);
    expect(locations[3].levels).toEqual([-1, 0]);
    for (const loc of locations.slice(0, 32)) expect(readTownLevel(files, loc, 0).tiles.length).toBe(1024);
  });
});
