/**
 * fields.ts
 *
 * The four fields a mage lays across a passage, each its own element
 * rather than one cloud in four colours: poison a green murk with
 * bubbles rising in it, sleep a violet haze with motes adrift, fire
 * tongues of flame, energy a dark charge crossed by lightning. Painted
 * (paint.ts) and see-through, so the floor shows under them; they wrap,
 * since a field is often a wall of several; and each has two frames.
 */

import { rng, type Sprite } from './draw.ts';
import { BIG, type Canvas, limb, lumps, mound, painted, ramp, rgb, veil } from './paint.ts';
import { P } from './palette.ts';

export type FieldKind = 'poison' | 'sleep' | 'fire' | 'energy';

export function magicField(kind: FieldKind, frame: number): Sprite {
  const seed = { poison: 11, sleep: 22, fire: 33, energy: 44 }[kind];
  const coarse = lumps(seed, 4);
  const fine = lumps(seed + 1, 10);
  // The same cloud, drifted on: the second frame is the first moved, not another.
  const drift = frame * 9;
  const cloud = (x: number, y: number): number => coarse(x + drift, y - drift) * 0.65 + fine(x - drift, y + drift * 2) * 0.35;
  const r = rng(seed + frame * 7);
  let c: Canvas;
  let thick = (x: number, y: number): number => 0.7 + cloud(x, y) * 0.3;
  switch (kind) {
    case 'poison': {
      c = painted((x, y) => ramp([0x07200a, P.snakeShade, P.snake, P.snakeLight], (cloud(x, y) - 0.2) * 1.5));
      for (let i = 0; i < 7; i++)
        mound(c, r() * BIG, r() * BIG, 2 + r() * 2.5, 2 + r() * 2.5, [P.snakeShade, P.snakeLight, P.leafTip, 0xf0ffe0]);
      break;
    }
    case 'sleep': {
      c = painted((x, y) => ramp([0x1e0a26, P.clothShade, P.cloth, P.clothLight, P.lilac], (cloud(x, y) - 0.2) * 1.4));
      for (let i = 0; i < 6; i++) {
        const [x, y] = [Math.floor(r() * BIG), Math.floor(r() * BIG)];
        for (const [dx, dy] of [
          [0, 0],
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [2, 0],
          [-2, 0],
          [0, 2],
          [0, -2],
        ])
          c.set(x + dx, y + dy, rgb(Math.abs(dx) + Math.abs(dy) > 1 ? P.lilac : P.lilacLight));
      }
      break;
    }
    case 'fire': {
      // Tongues: the cloud drawn out tall, so it rises in streaks.
      const tall = lumps(seed + 2, 7);
      const flame = (x: number, y: number): number => tall(x + drift, y * 0.35 + drift * 3) * 0.7 + fine(x, y + drift * 2) * 0.3;
      c = painted((x, y) => ramp([P.lavaDeep, P.fireShade, P.fire, P.orange, P.lavaHot, 0xfffbe0], (flame(x, y) - 0.22) * 1.7));
      thick = (x, y) => 0.75 + flame(x, y) * 0.25;
      break;
    }
    case 'energy': {
      c = painted((x, y) => ramp([0x04061e, P.moon, P.wizardShade, P.wizard], (cloud(x, y) - 0.25) * 1.2));
      // Lightning, side to side and top to bottom, leaving each edge where it came in at the other.
      for (const upright of [false, true]) {
        {
          const across = Math.floor(r() * BIG);
          let [px, py] = upright ? [across, 0] : [0, across];
          for (let step = 1; step <= 8; step++) {
            const along = (step / 8) * BIG;
            const off = step === 8 ? across : across + (r() - 0.5) * 16;
            const [nx, ny] = upright ? [off, along] : [along, off];
            limb(c, px, py, nx, ny, 2.2, 2.2, [P.magicShade, P.magic]);
            limb(c, px, py, nx, ny, 0.9, 0.9, [P.magicLight, 0xffffff]);
            [px, py] = [nx, ny];
          }
        }
      }
      break;
    }
  }
  return veil(c, thick);
}
