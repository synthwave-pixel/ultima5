/**
 * carve.ts
 *
 * A dungeon sign's letters cut into the wall they are on (the Standard look), rather than painted on it: from a
 * letter's shape in its cell (the ink, as the rune or its English shows it now) and the wall the cell showed before,
 * the cell's pixels - the wall's own texture carried into the cut, lit as the copper frame is, from above and to the
 * left.
 *
 * - `paint`: the letters in white on the wall (as the sign was before this).
 * - `groove`: a flat-floored cut: its floor filled with a deep, old red, the side under its upper and left edge that
 *   red darker, in shadow, the side under its lower and right edge that red lighter, catching the light.
 * - `vcut`: a mason's V: each stroke two faces meeting in a line along its middle, the face turned up and left lit
 *   and the face turned down and right shaded, darkest where they meet.
 * - `fresh`: the groove, its floor the paler stone under the weathered face, so a sign reads in the dark.
 *
 * `tint`, where given, is the colour the cut is in (a dungeon's signs, colours.ts signInk): the fresh cut's floor
 * that colour over the stone, the V-cut coloured toward it; the groove keeps its red whatever the dungeon.
 *
 * And what a sign may be cut into: a bolted plate (`plate`).
 */

import { RUNE_RED } from './colours.ts';

export type CarveStyle = 'paint' | 'groove' | 'vcut' | 'fresh';

export const CARVE_STYLES: readonly CarveStyle[] = ['paint', 'groove', 'vcut', 'fresh'];

/** Colour `v` (the canvas's RGBA, little-endian) with its red, green and blue each multiplied by `f`. */
function shade(v: number, f: number): number {
  const c = (sh: number): number => Math.max(0, Math.min(255, Math.round(((v >>> sh) & 0xff) * f))) << sh;
  return (0xff000000 | c(16) | c(8) | c(0)) >>> 0;
}

/** Colour `v` taken `t` of the way to `to`. */
function toward(v: number, to: number, t: number): number {
  const c = (sh: number): number => Math.round(((v >>> sh) & 0xff) * (1 - t) + ((to >>> sh) & 0xff) * t) << sh;
  return (0xff000000 | c(16) | c(8) | c(0)) >>> 0;
}

/** Pale stone, as a cut shows it under the weathered face. */
const STONE = 0xffc8c0c4;
const WHITE = 0xffffffff;
/** The groove's floor: the runes' red (colours.ts), as of something old dried into the cut (RGBA, little-endian). */
export const GROOVE_RED = (0xff000000 | ((RUNE_RED & 0xff) << 16) | (RUNE_RED & 0xff00) | (RUNE_RED >> 16)) >>> 0;
/** The groove's sides: its red darker, where the cut faces away from the light, and lighter, where it faces it. */
const GROOVE_DARK = shade(GROOVE_RED, 0.55);
const GROOVE_LIGHT = toward(GROOVE_RED, WHITE, 0.35);

/**
 * The cell as carved: `mask` its letter's shape (side by side, nonzero where the letter is), `wall` what the cell
 * showed before (as many pixels, row by row), `ink` the colour a painted letter is. Pixels outside the letter are
 * the wall's.
 */
export function carve(mask: Uint8Array, wall: Uint32Array, side: number, style: CarveStyle, ink: number, tint = 0): Uint32Array {
  const out = wall.slice();
  const m = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < side && y < side && mask[y * side + x] !== 0;
  if (style === 'paint') {
    for (let i = 0; i < mask.length; i++) if (mask[i]) out[i] = tint || ink;
    return out;
  }
  if (style === 'vcut') {
    vcut(mask, wall, side, out, m);
    if (tint) for (let i = 0; i < mask.length; i++) if (mask[i]) out[i] = toward(out[i], tint, 0.35);
    return out;
  }
  const fresh = style === 'fresh';
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      if (!m(x, y)) continue;
      const i = y * side + x;
      const w = wall[i];
      // The floor of the cut: the wall darkened, or the pale stone under it.
      let v = fresh ? toward(w, tint || STONE, tint ? 0.75 : 0.62) : toward(shade(w, 0.45), GROOVE_RED, 0.8);
      // The cut's upper and left side, facing away from the light, and the shadow it casts a pixel on.
      const nearLip = !m(x - 1, y) || !m(x, y - 1) || !m(x - 1, y - 1);
      const inShadow = !nearLip && (!m(x - 2, y) || !m(x, y - 2) || !m(x - 2, y - 2));
      // Its lower and right side, facing the light.
      const farLip = !m(x + 1, y) || !m(x, y + 1) || !m(x + 1, y + 1);
      // The groove's sides in its own red, darker and lighter - not black and white, which scattered through a sign
      // seen smaller from further off (framebuffer.ts laySign) and spoiled it.
      if (nearLip) v = fresh ? shade(w, 0.35) : GROOVE_DARK;
      else if (farLip) v = fresh ? toward(v, WHITE, 0.45) : GROOVE_LIGHT;
      else if (inShadow) v = shade(v, 0.75);
      out[i] = v;
    }
  // The wall's face along the letter's lower and right edge, the lip the light falls on as it enters the cut: the
  // groove's lit with its own red, as its sides are.
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++)
      if (!m(x, y) && (m(x - 1, y) || m(x, y - 1)) && !m(x + 1, y) && !m(x, y + 1))
        out[y * side + x] = fresh ? toward(wall[y * side + x], WHITE, 0.12) : toward(wall[y * side + x], GROOVE_LIGHT, 0.25);
  return out;
}

/**
 * The V-cut: how far each pixel of the letter lies in from its edge (a chamfer distance, in thirds of a pixel), and
 * which way that rises - toward the stroke's middle line - telling which face of the V it is on: a face whose middle
 * lies down and to the right of it slopes down that way, turned toward the light.
 */
function vcut(mask: Uint8Array, wall: Uint32Array, side: number, out: Uint32Array, m: (x: number, y: number) => boolean): Uint32Array {
  const far = 3 * side;
  const d = new Uint16Array(side * side);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? far : 0;
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= side || y >= side ? 0 : d[y * side + x]);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const i = y * side + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
    }
  for (let y = side - 1; y >= 0; y--)
    for (let x = side - 1; x >= 0; x--) {
      const i = y * side + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
    }
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      if (!m(x, y)) continue;
      const i = y * side + x;
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      const len = Math.hypot(gx, gy);
      // The distance rising down and right: a face along the stroke's upper or left edge, sinking toward its middle,
      // and so turned down and right, from the light; the other face turned up and left, toward it.
      const facing = len === 0 ? 0 : -(gx + gy) / (len * Math.SQRT2);
      const ridge = len === 0 || d[i] >= Math.max(at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1));
      const w = wall[i];
      out[i] = ridge ? shade(w, 0.3) : facing > 0 ? toward(shade(w, 0.85), WHITE, 0.3 * facing) : shade(w, 0.75 + 0.45 * facing);
    }
  return out;
}

/**
 * The plate in the colours of Modern PC's cobbles (tools/art/sheet-rooms.ts), RGBA little-endian: its face their dark
 * stone (0x323852), its bevel their lightest (0x48506a) and darkest (0x24283a), its outline and bolts their joint
 * (0x181a26).
 */
const PLATE = 0xff523832;
const PLATE_LIT = 0xff6a5048;
const PLATE_SHADE = 0xff3a2824;
const BOLT = 0xff261a18;
const OUTLINE = BOLT;

/**
 * A bolted plate over the wall on `page` (RGBA, `stride` pixels to a row), its top left (x, y), `w` by `h` pixels,
 * `unit` pixels to one of 1988's: in the cobbles' colours, outlined, its edge bevelled two squares deep - lit from
 * above and to the left as the cut is - and a bolt in each corner, and between them along a plate wide enough to want
 * them; `scale` smaller for a plate further off, its bevel and bolts with it.
 * Drawn at the grain of the corridor's pictures round it, in squares of half one of 1988's pixels (they are shown at
 * twice 1988's size), as the sign's letters are cut.
 */
export function plate(page: Uint32Array, stride: number, x: number, y: number, w: number, h: number, unit: number, scale = 1): void {
  const t = Math.max(1, Math.round(unit / 2));
  const [tw, th] = [Math.ceil(w / t), Math.ceil(h / t)];
  const img = new Uint32Array(tw * th);
  // Its edge and bolts as far off as it is (`scale`, a plate further down the passage): never less than a square.
  const bevel = Math.max(2, Math.round(3 * scale));
  const bolt = Math.max(1, Math.round(2 * scale));
  for (let r = 0; r < th; r++)
    for (let c = 0; c < tw; c++) {
      const [top, left, bottom, right] = [r, c, th - 1 - r, tw - 1 - c];
      const edge = Math.min(top, left, bottom, right);
      let v = PLATE;
      if (edge === 0) v = OUTLINE;
      else if (edge < bevel) v = top === edge || left === edge ? PLATE_LIT : PLATE_SHADE;
      img[r * tw + c] = v;
    }
  // The bolts: `bolt` squares a side, clear of the bevel.
  const inset = bevel + 1;
  const across = Math.max(1, Math.round((tw - inset * 2) / (56 * scale)));
  for (const by of [inset, th - bolt - inset])
    for (let n = 0; n <= across; n++) {
      const bx = Math.round(inset + ((tw - bolt - inset * 2) * n) / across);
      for (let dy = 0; dy < bolt; dy++) img.fill(BOLT, (by + dy) * tw + bx, (by + dy) * tw + bx + bolt);
    }
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) page[(y + r) * stride + x + c] = img[Math.floor(r / t) * tw + Math.floor(c / t)];
}
