/**
 * sheetTone.ts
 *
 * A set's colours shown softer than its sheet has them (the Sharp X68k's: skins.ts X68K_TONE): each of its colours as
 * a gentler one, its pixels kept crisp. A tone may also blend each pixel a little with its neighbours across, as a
 * monitor ran a dither's two colours together; the X68k's does not (its players liked the colours, not the blur).
 * Laid on as a tile or a dungeon piece is drawn (sheetArt.ts, skins.ts), so the sheets stay the machine's own and what
 * is found in them by colour - the water, the fire - is found as before.
 */

/** How a set's colours are shown. */
export interface SheetTone {
  /** Each colour (RGBA in memory order) as it is shown; one not here is shown as it is. */
  colours: ReadonlyMap<number, number>;
  /** Whether each pixel is blended with its neighbours across: half its own, a quarter each. */
  blend: boolean;
}

const clear = (v: number): boolean => v >>> 24 === 0;

/**
 * `px` (RGBA in memory order, `w` by `h`) in `tone`: a new array. `step` is how many pixels each of the set's own is
 * drawn as across (a tile drawn twice its size: 2), so it is blended as its own pixels are. A clear pixel stays clear,
 * and is never blended with: a pixel beside one, or at the edge, takes its own colour for that neighbour's.
 */
export function toned(px: Uint32Array, w: number, h: number, tone: SheetTone, step = 1): Uint32Array {
  const shown = px.map((v) => (clear(v) ? v : (tone.colours.get(v) ?? v)));
  if (!tone.blend) return shown;
  const out = new Uint32Array(shown.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const c = shown[i];
      if (clear(c)) continue;
      const near = (dx: number): number => {
        const nx = x + dx;
        return nx < 0 || nx >= w || clear(shown[i + dx]) ? c : shown[i + dx];
      };
      const [l, r] = [near(-step), near(step)];
      let v = 0xff000000;
      for (const s of [0, 8, 16]) v |= Math.round((((l >>> s) & 0xff) + ((c >>> s) & 0xff) * 2 + ((r >>> s) & 0xff)) / 4) << s;
      out[i] = v >>> 0;
    }
  return out;
}

/** `palette` shown as `soft` (0xRRGGBB each, in order), and blended: a tone. */
export function toneOf(palette: readonly number[], soft: readonly number[], blend: boolean): SheetTone {
  const rgba = (c: number): number => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;
  return { colours: new Map(palette.map((c, k) => [rgba(c), rgba(soft[k])])), blend };
}
