import { describe, expect, it } from 'vitest';
import { chromeTone, nightOf } from '../src/game/chromeTone.ts';
import { newGame } from './helpers.ts';

/** The Standard look's frame in the colour of where the party is (chromeTone.ts). */
describe("the frame's colour by place", () => {
  const at = (set: Partial<{ mapId: number; level: number; hour: number; minute: number; savedMapId: number }>) => {
    const { g } = newGame();
    g.s.shadowlords.fill(0x80); // all three destroyed: no towne afflicted unless a test says so
    Object.assign(g.s, { hour: 12, minute: 0, level: 0 }, set);
    return g;
  };

  it('is copper in a towne, castle or keep, and purple in a towne a Shadowlord is in', () => {
    expect(chromeTone(at({ mapId: 2 }))).toBeNull();
    expect(chromeTone(at({ mapId: 0x12 }))).toBeNull(); // a castle
    const afflicted = at({ mapId: 2 });
    afflicted.s.shadowlords[1] = 2;
    expect(chromeTone(afflicted)).toMatchObject({ hue: 285 });
  });

  it('is blue out in Britannia, darker at night, its dark as the light of the world is', () => {
    const day = chromeTone(at({ mapId: 0, hour: 12 }))!;
    const dusk = chromeTone(at({ mapId: 0, hour: 19, minute: 40 }))!;
    const night = chromeTone(at({ mapId: 0, hour: 23 }))!;
    expect(day).toMatchObject({ hue: 215, value: 1.1 });
    expect(night.value).toBeCloseTo(1.1 * 0.75);
    expect(dusk.value).toBeLessThan(day.value);
    expect(dusk.value).toBeGreaterThan(night.value);
    // The game's own hours (time.ts): still day at 18:59, night again at 20:00 and till 5:00, day by 6:00.
    expect(chromeTone(at({ mapId: 0, hour: 18, minute: 59 }))!.value).toBe(day.value);
    expect(chromeTone(at({ mapId: 0, hour: 20 }))!.value).toBeCloseTo(night.value);
    expect(chromeTone(at({ mapId: 0, hour: 4, minute: 59 }))!.value).toBeCloseTo(night.value);
    expect(chromeTone(at({ mapId: 0, hour: 6 }))!.value).toBe(day.value);
  });

  it("follows the game's twilight, a little at a time, never a jump within a day", () => {
    const { g } = newGame();
    const twilight = g.data.twilight();
    const light = (n: number): number => 0x32 - n * (0x32 - 2);
    // On each ten minutes of the dawn, the light the game gives then (time.ts); the dusk the same backwards.
    for (let i = 0; i < twilight.length; i++) expect(light(nightOf(5, i * 10, twilight)), `5:${i}0`).toBeCloseTo(twilight[i]);
    for (let i = 1; i < twilight.length; i++) expect(light(nightOf(19, 60 - i * 10, twilight)), `19:${6 - i}0`).toBeCloseTo(twilight[i]);
    let last = nightOf(0, 0, twilight);
    for (let m = 1; m < 24 * 60; m++) {
      const n = nightOf(Math.floor(m / 60), m % 60, twilight);
      expect(Math.abs(n - last), `${Math.floor(m / 60)}:${m % 60}`).toBeLessThan(0.04);
      last = n;
    }
  });

  it('is grey in a dungeon, darker each level down, darkest in the Underworld', () => {
    const levels = [0, 3, 7].map((level) => chromeTone(at({ mapId: 0x21, level }))!);
    for (const t of levels) expect(t.sat).toBe(0);
    expect(levels[0].value).toBeCloseTo(0.62);
    expect(levels[1].value).toBeLessThan(levels[0].value);
    expect(levels[2].value).toBeCloseTo(0.46);
    expect(chromeTone(at({ mapId: 0, level: 0xff }))).toEqual({ sat: 0, value: 0.42 });
  });

  it('colours a fight or a camp as where it is, and a shrine gold, but only while the scene lasts', () => {
    expect(chromeTone(at({ mapId: 0xff, savedMapId: 0x22, level: 2 }))).toMatchObject({ sat: 0 });
    expect(chromeTone(at({ mapId: 0xff, savedMapId: 0 }))).toMatchObject({ hue: 215 });
    const shrine = at({ mapId: 0xff, savedMapId: 0 });
    shrine.chromePlace = 'shrine';
    expect(chromeTone(shrine)).toMatchObject({ hue: 42 });
    shrine.chromePlace = 'copper';
    expect(chromeTone(shrine)).toBeNull();
    // Back on the map, what the scene said is no longer heeded.
    shrine.s.mapId = 0;
    shrine.chromePlace = 'shrine';
    expect(chromeTone(shrine)).toMatchObject({ hue: 215 });
  });
});
