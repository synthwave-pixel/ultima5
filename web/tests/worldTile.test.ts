import { describe, expect, it } from 'vitest';
import { loadChunks, tileAt, worldTile } from '../src/game/world.ts';
import { newGame } from './helpers.ts';

/**
 * A world square's tile read from the map itself (world.ts worldTile), wherever the loaded window is: the same as the
 * window gives once it is loaded there - not a square from the window's far side, as tileAt gives beyond it.
 */
describe("a square of the world's map, loaded or not", () => {
  for (const level of [0, 0xff])
    it(`reads ${level ? 'the Underworld' : 'Britannia'} as the loaded window does`, () => {
      const { g } = newGame();
      const s = g.s;
      Object.assign(s, { mapId: 0, level });
      const load = (cx: number, cy: number): void => {
        Object.assign(s, { chunkX: cx, chunkY: cy });
        loadChunks(g, -1, -1);
        loadChunks(g, 1, 1);
      };
      let checked = 0;
      for (const [cx, cy] of [
        [0x40, 0x50],
        [0x50, 0x60],
        [0xe0, 0x10],
        [0xf0, 0xf0],
        [0x00, 0x80],
      ]) {
        load(0x80, 0x20); // elsewhere: every square below beyond it
        const read = Array.from({ length: 32 * 32 }, (_, i) => worldTile(g, cx + (i % 32), cy + Math.floor(i / 32)));
        load(cx, cy);
        for (let i = 0; i < 32 * 32; i++) {
          const [x, y] = [(cx + (i % 32)) & 0xff, (cy + Math.floor(i / 32)) & 0xff];
          expect(read[i], `${x},${y}`).toBe(tileAt(g, x, y));
          checked++;
        }
      }
      expect(checked).toBe(5 * 1024);
    });
});
