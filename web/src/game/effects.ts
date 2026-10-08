/**
 * effects.ts
 *
 * Short effects the rules use: waiting a few frames with the map moving
 * (ULTIMA_3ae6), a burst on a square (ULTIMA_3522), the earthquake's shake
 * (ULTIMA_3072), and the tile drawn in pixel by pixel (ULTIMA_1068).
 */

import { updateFrame } from './frame.ts';
import { Game } from './game.ts';
import { groundAt } from './world.ts';

export const TICK_MS = 1000 / 18.2;

/** ULTIMA_3ae6: `n` frames, a timer tick each, while the map is shown. */
export async function sleepTicks(g: Game, n: number): Promise<void> {
  if (g.s.drawMap === 0) return;
  for (let i = 0; i < n; i++) {
    updateFrame(g);
    await g.p.sleep(TICK_MS);
  }
}

/** ULTIMA_3522: the burst tile on map square (x, y), with a crash. */
export async function explosion(g: Game, x: number, y: number): Promise<void> {
  if (g.s.mapId < 0x80) {
    x -= g.s.x - 5;
    y -= g.s.y - 5;
  }
  g.draw.tile(0, x, y, groundAt(g, x, y));
  if (!g.soundOff) await g.sound.noise(10, 3000, 2000);
  else await g.p.sleep(TICK_MS * 2);
  updateFrame(g);
}

/** ULTIMA_3072: the map shakes up and down eight times. */
export async function shakeScreen(g: Game): Promise<void> {
  const d = g.draw;
  d.savePage();
  if (!g.soundOff) void g.sound.noise(0x13, 16000, 0x96);
  for (let n = 0; n < 8; n++) {
    d.scroll(8, 8, 0xb7, 0xb7, -2);
    await g.p.sleep(70);
    d.restorePage();
    await g.p.sleep(30);
    d.scroll(8, 8, 0xb7, 0xb7, 2);
    await g.p.sleep(70);
    d.restorePage();
    await g.p.sleep(30);
  }
}

/** ULTIMA_1068: draw `tile` into cell (x, y) a pixel at a time, the map moving every eight. */
export async function reveal(g: Game, tile: number, x: number, y: number): Promise<void> {
  for (let step = 0; step < 0x100; ) {
    for (let k = 0; k < 4 && step < 0x100; k++) {
      g.draw.revealStep(tile, x, y, step++);
      g.draw.revealStep(tile, x, y, step++);
    }
    if (step >= 0x100) return;
    updateFrame(g);
    await g.p.sleep(TICK_MS);
  }
}
