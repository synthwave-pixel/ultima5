/**
 * viewGlide.ts
 *
 * Smooth motion (Settings, the Modern look; the ultima3 port's): the map slides under the party, and whoever walks
 * glides from their square to the next (glide.ts says how far behind each is drawn). The game draws its view as ever,
 * square by square (world.ts drawView); this keeps a copy of each view as drawn, with each walker's square drawn bare
 * of them, and while anything is on its way lays the view over the picture shown, glided - the colour page itself
 * untouched, so whatever the game draws over the view next is there as soon as the glide is done (or at once: the
 * screen settles the glide when anything else is drawn over the view).
 *
 * In layers, so that a figure between two squares is over both: every square's ground (a walker's square bare of
 * them, the squares that slid out of view kept from the views before), then the party's followers, the party, and
 * whoever walks. A figure is its square as drawn less its square bare: so a companion's colours, a fight's marks on
 * them and their tint go with them.
 */

import type { ViewDrawn } from '../game/io.ts';
import { CELL } from './standardArt.ts';
import { Glide, GLIDE_SLACK_MS, type Point } from './glide.ts';
import { HI, HI_WIDTH, TILE_X, TILE_Y, type Framebuffer } from './framebuffer.ts';

/** The view's side in squares, and in the colour page's pixels. */
const SIDE = 11;
const SPAN = SIDE * CELL;
/** The view's top left on the colour page. */
const LEFT = TILE_X * HI;
const TOP = TILE_Y * HI;
/** The colour page drawn on for a walker's square bare of them (Framebuffer.pages): the third, kept for it. */
export const BARE_PAGE = 2;
/** How far beyond the view a square slid out of it is kept for the next glide to show, in squares. */
const RING = 2;

/**
 * A view as drawn: what it said of its squares, its picture - without a fight's marks, which are not shown while
 * anything moves - and each walker's square bare of them.
 */
interface Shot {
  view: ViewDrawn;
  picture: Uint32Array;
  bare: Map<number, Uint32Array>;
}

const STILL: Point = { x: 0, y: 0 };

export class ViewGlide {
  private readonly glide = new Glide();
  /** The view last drawn, and the one the glide last took. */
  private latest: Shot | null = null;
  private glided: Shot | null = null;
  /** Squares slid out of view, by their place on the map ("x,y"): their picture, for the edge that slides away. */
  private ring = new Map<string, Uint32Array>();
  /** The view being drawn as it was before a fight's marks (`marks`), for the view about to be drawn. */
  private unmarked: Uint32Array | null = null;

  constructor(
    private readonly fb: Framebuffer,
    /** Max input's pace (holds.ts): a held walk glides on from square to square, the glide as long as a repeat. */
    private readonly pace: () => number,
  ) {}

  /**
   * The view's squares drawn on page `page`, a fight's marks to come - the box round whoever's turn it is, the foe a
   * snap attack would strike: kept without them, for they are not shown while anything moves. They come with the
   * picture at rest. (The box lies over the squares round its member too: glided, it would go off in pieces with one
   * walking beside them.)
   */
  marks(page: number): void {
    this.unmarked = this.copy(page);
  }

  /** A view drawn on the colour page `page`: kept, to glide to. */
  drawn(view: ViewDrawn, page: number): void {
    const unmarked = this.unmarked;
    this.unmarked = null;
    if (view.covered) return this.off();
    const picture = unmarked ?? this.copy(page);
    const bare = new Map<number, Uint32Array>();
    const fb = this.fb;
    const was = fb.page;
    fb.page = BARE_PAGE;
    try {
      this.drawBare(view, bare);
    } finally {
      fb.page = was;
    }
    this.latest = { view, picture, bare };
  }

  /** The view's square of the colour page `page`. */
  private copy(page: number): Uint32Array {
    const from = this.fb.hi[page];
    const picture = new Uint32Array(SPAN * SPAN);
    for (let r = 0; r < SPAN; r++) picture.set(from.subarray((TOP + r) * HI_WIDTH + LEFT, (TOP + r) * HI_WIDTH + LEFT + SPAN), r * SPAN);
    return picture;
  }

  /** Each walker's square of `view` drawn bare of them, on the bare page, and kept. */
  private drawBare(view: ViewDrawn, bare: Map<number, Uint32Array>): void {
    const fb = this.fb;
    view.cells.forEach((c, i) => {
      if (!c?.bare) return;
      const [x, y] = [i % SIDE, Math.floor(i / SIDE)];
      if ('draw' in c.bare) c.bare.draw();
      else fb.tile(c.bare.tile, TILE_X + x * 16, TILE_Y + y * 16, undefined, c.bare.ground, c.bare.place);
      const block = new Uint32Array(CELL * CELL);
      const page = fb.hi[BARE_PAGE];
      for (let r = 0; r < CELL; r++) {
        const at = (TOP + y * CELL + r) * HI_WIDTH + LEFT + x * CELL;
        block.set(page.subarray(at, at + CELL), r * CELL);
      }
      bare.set(i, block);
    });
  }

  /** No view to glide (another look, Smooth motion off, a dungeon's view, a box over the map): the next starts still. */
  off(): void {
    this.latest = this.glided = null;
    this.ring.clear();
    this.glide.reset();
  }

  /** Something else drawn over the view: the glide stops where it is going, the colour page shown as it is. */
  settle(): void {
    if (this.latest) this.glided = this.latest;
    this.glide.reset();
  }

  /** At frame `now`: the newest view taken, if it is new; whether anything is on its way, to be shown glided. */
  moving(now: number): boolean {
    const shot = this.latest;
    if (!shot) return false;
    if (shot !== this.glided) this.take(shot, now);
    return this.glide.moving(now);
  }

  /** The view glided at `now`, over `out` (a colour page's worth, as the screen shows it). */
  paint(now: number, out: Uint32Array): void {
    const shot = this.glided;
    if (!shot) return;
    const { view } = shot;
    const lag = (id: string | undefined): Point => (id === undefined ? STILL : this.glide.lag(id, now));
    const camera = view.origin ? lag('camera') : STILL;
    for (let r = 0; r < SPAN; r++) out.fill(0xff000000, (TOP + r) * HI_WIDTH + LEFT, (TOP + r) * HI_WIDTH + LEFT + SPAN);
    /** Square (x, y) of the view, `by` squares from it, in the view's own pixels: whole ones, so squares stay butted. */
    const at = (x: number, y: number, by: Point = STILL): [number, number] => [
      Math.round((x + by.x - camera.x) * CELL),
      Math.round((y + by.y - camera.y) * CELL),
    ];
    const cellOf = (i: number): [number, number] => [i % SIDE, Math.floor(i / SIDE)];
    // The ground: each square as drawn, or bare of whoever stands there.
    for (let i = 0; i < SIDE * SIDE; i++) {
      const [x, y] = cellOf(i);
      const bare = shot.bare.get(i);
      if (bare) blit(out, bare, CELL, 0, 0, ...at(x, y));
      else blit(out, shot.picture, SPAN, x * CELL, y * CELL, ...at(x, y));
    }
    // The squares slid out of view, at their places beside it.
    if (view.origin)
      for (const [key, block] of this.ring) {
        const [mx, my] = key.split(',').map(Number);
        blit(out, block, CELL, 0, 0, ...at(near(mx - view.origin.x, view.wrap), near(my - view.origin.y, view.wrap)));
      }
    // Then the figures, each its square as drawn less its square bare: the followers, the party, whoever walks.
    const figures = (which: (c: NonNullable<ViewDrawn['cells'][number]>) => string | undefined): void =>
      view.cells.forEach((c, i) => {
        const id = c && which(c);
        const bare = shot.bare.get(i);
        if (!id || !bare) return;
        const [x, y] = cellOf(i);
        blit(out, shot.picture, SPAN, x * CELL, y * CELL, ...at(x, y, id === 'party' ? camera : lag(id)), bare);
      });
    figures((c) => c.follower);
    figures((c) => (c.party ? 'party' : undefined));
    figures((c) => c.mover);
  }

  /** A new view: where everything in it stands handed to the glide, and the squares that left the view kept. */
  private take(shot: Shot, now: number): void {
    const { view } = shot;
    const was = this.glided;
    this.glided = shot;
    const sameScene = was !== null && was.view.scene === view.scene && was.view.origin !== null && view.origin !== null;
    if (!sameScene) this.ring.clear();
    const o = view.origin;
    const place = (x: number, y: number): Point => (o ? { x: wrapped(o.x + x, view.wrap), y: wrapped(o.y + y, view.wrap) } : { x, y });
    if (sameScene && was && was.view.origin && o) {
      // What the last view showed that this one does not: kept, for the edge that slides away.
      const wo = was.view.origin;
      for (let i = 0; i < SIDE * SIDE; i++) {
        const [x, y] = [i % SIDE, Math.floor(i / SIDE)];
        const [mx, my] = [wrapped(wo.x + x, view.wrap), wrapped(wo.y + y, view.wrap)];
        const [rx, ry] = [near(mx - o.x, view.wrap), near(my - o.y, view.wrap)];
        if (rx >= 0 && rx < SIDE && ry >= 0 && ry < SIDE) continue;
        const block = was.bare.get(i) ?? cut(was.picture, x, y);
        this.ring.set(`${mx},${my}`, block);
      }
      for (const key of [...this.ring.keys()]) {
        const [mx, my] = key.split(',').map(Number);
        const [rx, ry] = [near(mx - o.x, view.wrap), near(my - o.y, view.wrap)];
        const inside = rx >= 0 && rx < SIDE && ry >= 0 && ry < SIDE;
        if (inside || rx < -RING || ry < -RING || rx >= SIDE + RING || ry >= SIDE + RING) this.ring.delete(key);
      }
    }
    const places = new Map<string, Point>();
    if (o) places.set('camera', { x: o.x, y: o.y });
    view.cells.forEach((c, i) => {
      const id = c?.mover ?? c?.follower;
      if (id !== undefined) places.set(id, place(i % SIDE, Math.floor(i / SIDE)));
    });
    this.glide.longest = this.pace() + GLIDE_SLACK_MS;
    this.glide.update(view.scene, places, view.wrap, now);
  }
}

/** `n` on a map `wrap` squares round (0: none), as a place on it. */
const wrapped = (n: number, wrap: number): number => (wrap > 0 ? ((n % wrap) + wrap) % wrap : n);

/** A difference `d` the short way round a map `wrap` squares round (0: none). */
const near = (d: number, wrap: number): number => (wrap > 0 ? ((((d + wrap / 2) % wrap) + wrap) % wrap) - wrap / 2 : d);

/** Square (x, y) of a view's picture, on its own. */
function cut(picture: Uint32Array, x: number, y: number): Uint32Array {
  const block = new Uint32Array(CELL * CELL);
  for (let r = 0; r < CELL; r++)
    block.set(picture.subarray((y * CELL + r) * SPAN + x * CELL, (y * CELL + r) * SPAN + x * CELL + CELL), r * CELL);
  return block;
}

/**
 * A square of `src` (`stride` wide, from (sx, sy)) onto the view at (dx, dy) of its own pixels, cut to the view; with
 * `bare`, only the pixels where the square differs from it - a figure, without its ground.
 */
function blit(
  out: Uint32Array,
  src: Uint32Array,
  stride: number,
  sx: number,
  sy: number,
  dx: number,
  dy: number,
  bare?: Uint32Array,
): void {
  const c0 = Math.max(0, -dx);
  const c1 = Math.min(CELL, SPAN - dx);
  if (c0 >= c1) return;
  for (let r = Math.max(0, -dy); r < Math.min(CELL, SPAN - dy); r++) {
    const s = (sy + r) * stride + sx;
    const o = (TOP + dy + r) * HI_WIDTH + LEFT + dx;
    if (!bare) {
      out.set(src.subarray(s + c0, s + c1), o + c0);
      continue;
    }
    for (let c = c0; c < c1; c++) if (src[s + c] !== bare[r * CELL + c]) out[o + c] = src[s + c];
  }
}
