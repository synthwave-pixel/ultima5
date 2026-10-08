/**
 * sheet-marvels.ts
 *
 * The map tiles that move or glow: the burst of a blow, the waterfall
 * (four frames, which the game cycles through as tiles), the moongate;
 * and the round window with the moon's face, in two halves. The
 * fountain, the hourglasses, the serpent banners, the arch and the
 * pedestal are fittings now (fittings.ts).
 */

import { rng, SIZE, Sprite } from './draw.ts';
import type { Group } from './build.ts';
import { P } from './palette.ts';
import { BIG, fromBig, lumps, ramp, smoothstep } from './paint.ts';

/** The burst: a star of fire over nothing (it stands over whatever it strikes). */
export function burst(): Sprite {
  const s = new Sprite();
  const star = (r1: number, r2: number, c: number): void => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      const r = i % 2 ? r2 : r1;
      pts.push([16 + Math.cos(a) * r, 16 + Math.sin(a) * r]);
    }
    s.poly(pts, c);
  };
  star(15, 7, P.fireShade);
  star(12, 6, P.fire);
  star(8, 4, P.orange);
  s.ellipse(16, 16, 4, 4, P.goldLight).ellipse(16, 16, 2, 2, P.white);
  return s.rim();
}

export function tiles(): Group {
  const t = new Map<number, Sprite>();
  t.set(0x00, burst());
  // The waterfall: the river running north to south over a drop (drawn over the river beneath it, its banks and
  // shore the river's own - shore.ts), on the grid and in the river's own blues: the water brightening to a lip of
  // foam across the channel, the face below it dark with streaks of light falling a quarter of the fall further each
  // frame, and foam where it lands. Clear outside the channel, so the banks run on through it.
  const CHANNEL = [10, 21];
  const LIP = 9;
  const FOOT = 25;
  for (let f = 0; f < 4; f++) {
    const s = new Sprite();
    s.blocky = true;
    const r = rng(0xd4 + f);
    for (let x = CHANNEL[0]; x <= CHANNEL[1]; x++) {
      const edge = x === CHANNEL[0] || x === CHANNEL[1];
      s.set(x, LIP - 1, edge ? P.sea : P.seaLight);
      s.set(x, LIP, P.foam);
      for (let y = LIP + 1; y < FOOT; y++) {
        // A streak every other column, each its own length and place, falling down the face with the frames.
        const k = (x * 7) % 5;
        const at = (y - LIP - f * 4 + k * 3 + 64) % 8;
        s.set(x, y, edge ? P.deep : x % 2 === 0 && at < 3 ? (at === 0 ? P.shallowLight : P.seaLight) : y < LIP + 3 ? P.sea : P.deep);
      }
      for (let y = FOOT; y < FOOT + 4; y++) {
        const churn = r();
        if (churn < 0.55 - (y - FOOT) * 0.12) s.set(x, y, churn < 0.2 ? 0xffffff : churn < 0.38 ? P.foam : P.shallowLight);
      }
    }
    t.set(0xd4 + f, s);
  }
  // The moongate: a doorway of blue light, brightest down its middle, its edge shimmering - standing on the ground
  // drawn from the map, the light fading out into it (where it stood in a square of dark).
  {
    const shimmer = lumps(0xdc, 12);
    const big = new Uint32Array(BIG * BIG);
    for (let y = 0; y < BIG; y++) {
      for (let x = 0; x < BIG; x++) {
        const across = Math.abs(x + 0.5 - BIG / 2) / 21; // 0 at the middle, 1 at the jamb
        // The head of the doorway is rounded.
        const top = y < 22 ? Math.hypot((x + 0.5 - BIG / 2) / 21, (22 - y) / 20) : across;
        const d = Math.max(across, top) + (shimmer(x, y) - 0.5) * 0.16;
        const a = smoothstep(1.12, 0.94, d);
        if (a <= 0) continue;
        const [r, g, b] = ramp([P.moon, P.moon, P.moonLight, P.sky, P.magicLight, 0xffffff], 1.08 - d);
        big[y * BIG + x] = ((Math.round(a * 255) << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)) >>> 0;
      }
    }
    t.set(0xdc, fromBig(big));
  }
  // The round window with the moon's face: one disc across two tiles.
  {
    const halves = [Sprite.filled(P.charcoalShade), Sprite.filled(P.charcoalShade)];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE * 2; x++) {
        const half = halves[x < SIZE ? 0 : 1];
        const lx = x % SIZE;
        const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 17);
        if (d < 13.5) half.set(lx, y, P.moon);
        else if (d < 16) half.set(lx, y, d < 14.8 ? P.guard : P.guardShade);
        const m = Math.hypot(x + 0.5 - 30, y + 0.5 - 16);
        const bite = Math.hypot(x + 0.5 - 35, y + 0.5 - 13);
        if (m < 9 && bite > 7.5) half.set(lx, y, m < 7 ? P.boneLight : P.bone);
      }
    }
    halves[0].set(27, 14, P.charcoal).set(26, 19, P.boneShade).set(27, 19, P.boneShade);
    t.set(0x5e, halves[0]);
    t.set(0x5f, halves[1]);
  }
  return { smooth: true, tiles: t, under: { 0xd4: 0x60, 0xd5: 0x60, 0xd6: 0x60, 0xd7: 0x60 } };
}
