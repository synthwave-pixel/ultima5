import { describe, expect, it } from 'vitest';
import { ambientSound } from '../src/game/frame.ts';
import { setTileAt } from '../src/game/world.ts';
import { T } from '../src/game/tiles.ts';
import { newGame } from './helpers.ts';

/** A clock near the party, heard at its own pace however fast the frames come (frame.ts ambientSound). */
describe("a clock's tick", () => {
  it('sounds tick and tock five seconds apart, whatever the frame rate', () => {
    const { g, p } = newGame();
    let clock = 0;
    p.now = () => clock;
    const tones: number[] = [];
    const heard: [number, number][] = [];
    g.soundOff = false;
    Object.assign(g.sound, {
      tone: (f: number) => {
        tones.push(f);
        heard.push([clock, f]);
        return Promise.resolve();
      },
    });
    Object.assign(g.s, { mapId: 2, level: 0, d5884: 0 });
    setTileAt(g, g.s.x + 1, g.s.y, T.Clock);
    for (; clock <= 15000; clock += 110) ambientSound(g);
    expect(tones).toEqual([3000, 2000, 3000, 2000].slice(0, tones.length));
    expect(tones).toHaveLength(3);
    for (let i = 1; i < heard.length; i++) expect(heard[i][0] - heard[i - 1][0]).toBeGreaterThanOrEqual(5000);
  });
});
