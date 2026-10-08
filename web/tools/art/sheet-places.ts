/**
 * sheet-places.ts
 *
 * The places on the world map: the towne and castle (the ultima3
 * Standard ones, their flags waving in two frames), cut from their grass
 * to stand on the land round them. Everything else that stands on the
 * world map - the huts and villages, keeps, the lighthouse, shrines and
 * ruins, the caves, mines and dungeons, the crystal, the Codex's sigil,
 * Lord British's castle and Blackthorn's palace - is a fitting
 * (fittings.ts), frames and all.
 */

import { Sprite } from './draw.ts';
import type { Group } from './build.ts';
import { u3Cut } from './paint.ts';
import { darkStoneCanvas, stoneCanvas } from './surfaces.ts';

/** Stone courses over a rectangle: blocks of three tones, the top lit. */
export function masonry(s: Sprite, x: number, y: number, w: number, h: number, tone: 'wall' | 'dark' = 'wall'): void {
  stones[tone] ??= (tone === 'wall' ? stoneCanvas() : darkStoneCanvas()).sprite().big!;
  s.texture(x, y, w, h, stones[tone]);
}
const stones: { wall?: Uint32Array; dark?: Uint32Array } = {};

export function tiles(): Group {
  const t = new Map<number, Sprite>();
  const frames = new Map<number, Sprite[]>();
  // Towne and castle: the ultima3 port's own, at the 64 pixels they were drawn, flags waving - cut from that port's
  // grass, to stand on the land round them.
  t.set(0x14, u3Cut('towne'));
  frames.set(0x14, [u3Cut('towne-2')]);
  t.set(0x15, u3Cut('castle'));
  frames.set(0x15, [u3Cut('castle-2')]);
  return { smooth: true, tiles: t, frames };
}
