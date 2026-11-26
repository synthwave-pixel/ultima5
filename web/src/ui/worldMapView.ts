/**
 * worldMapView.ts
 *
 * A world's map, any game's, two pixels a square (showWorldMap): the
 * game gives it a WorldMapSource - its worlds, each with its tiles, its
 * drawn map if it has one (parchment.ts), what the party has seen and
 * the marks (worldMarks.ts); the party; the names the party has learnt;
 * the legend's font; and the cloth map and the place the party is in
 * where it has them. Ultima V's showMap (mapView.ts) builds its own;
 * nothing here reads a game's files or knows its rules.
 *
 * A world's map fills the screen, a quarter of the world across its
 * shorter side at twice the drawn map's size, joined across its edges as
 * the world wraps. It opens on the party, a mark of its own named by the
 * Avatar, and the d-pad or the arrows move between the marks the map
 * shows - the party, those the party has seen, and the mapmaker's on the
 * paper - the map sliding to centre each one chosen; Y comes back to the
 * party, and a drag moves the map about. A legend over the lower right
 * corner, its box made to fit, gives the chosen one's name in the game's
 * own font - or, for a place whose name the party has not learnt, what it
 * looks like ("Towne?"). X turns to the next map, B closes. Where the
 * cloth map sits beside the page it is one of the maps too, and Y zooms
 * it.
 */

import { glyphPixel, type Font } from '../data/font.ts';
import { EGA_PALETTE } from '../data/ega.ts';
import { K, Pad } from '../game/io.ts';
import { INK, MAP_PIXELS, MAP_SCALE, WORLD_SIZE } from './parchment.ts';
import { focusOf, GLYPH_SIZE, GLYPHS, labelOf, nearestMark, stepTo, wrapped, type Mark } from './worldMarks.ts';

const ZOOMS = [1, 2, 3];
/** How many squares a world's map shows across the window's shorter side: a quarter of the world, at twice the size. */
const VIEW = 128;
/** How long the map takes to slide to the place chosen, in milliseconds. */
const SLIDE_MS = 150;

/** A mark's ink on the surveyed map, and the thin light edge that holds it against forest or sea. */
const MARK_INK: RGB = [30, 22, 16];
const MARK_EDGE: RGB = [247, 238, 214];

export type RGB = [number, number, number];
/** The maps on offer: where the party is standing, a world (its place in the source's list), and a cloth map. */
type Page = 'here' | 'cloth' | number;

/** A tile's figure in the look, CELL pixels square in memory order, or nothing where the look has none (Ultima V's: StandardArt). */
export interface TileFigures {
  figure(tile: number): Uint32Array | null | undefined;
}

/** One world a map shows: its squares, its drawn map, what the party has seen of it, its marks, and the party. */
export interface WorldMapWorld {
  /** The world's tiles, WORLD_SIZE (256) squares a side in rows, a byte a square: that byte's tile in `tiles`. */
  tiles: Uint8Array;
  /** Its drawn map (parchment.ts drawParchment), or null where it has none and is dark till walked. */
  paper: Uint32Array | null;
  /** What the party has seen of it, WORLD_SIZE squares a side: nonzero where seen (Ultima V's: Fog.of). Read as the map draws. */
  seen: Uint8Array;
  /** Every mark on it (worldMarks.ts): each shown where seen, on the paper, heard named (`knows`) or the map's focus. */
  marks: Mark[];
  /** Where the party is on it - its square, or the square of the place it is inside - or null where it is not. */
  party: { x: number; y: number } | null;
  /** Whether X turns to its page (the world the map was opened on by `focus` is turned to all the same). */
  offered: boolean;
}

/** The map of the place the party is in (a town's level, a dungeon's), its page first among the maps. */
export interface WorldMapHere {
  /** Its picture, `size` pixels a side in memory order, the party drawn on it where `lit` (it blinks). */
  picture(lit: boolean): Uint32Array;
  size: number;
  /** What the legend calls where the party is. */
  name: string;
  /** Whether the party's mark on it blinks (a town's), or stands steady (a dungeon's). */
  blinks: boolean;
}

/**
 * What a game gives the map (showWorldMap): its worlds, the party, what the party knows, the font of the legend, and
 * the pages it has besides - the place the party is in, the cloth map beside the page.
 *
 * Two things the map takes as given. Every world is WORLD_SIZE squares a side (parchment.ts: 256, a square's x and y a
 * byte each, wrapping at its edges), and its tiles, marks, party and sight are read at that size. And the game's tiles
 * are EGA's: 16 by 16, four bits a pixel, 128 bytes a tile, each pixel an index into `palette` (EGA's sixteen colours
 * where none is given).
 */
export interface WorldMapSource {
  /** The worlds, in the order X turns through them. */
  worlds: WorldMapWorld[];
  /** The world the map opens on (its place in `worlds`), where it opens on neither `here` nor `focus`. */
  opensOn: number;
  /** The square the place chosen first is the nearest to, on a world the party is not on. */
  from: { x: number; y: number };
  /** The party's own mark's name. */
  partyName: string;
  /** Whether the party has learnt the name of the place with this key (Mark.key). */
  knows: (key: string) => boolean;
  /** The legend's font. */
  font: Font;
  /**
   * The game's own tiles (16 by 16, four bits a pixel, 128 bytes a tile), how many, and the look's figures, if any. A
   * square whose byte is `tileCount` or more has no tile, and is drawn as one not yet seen.
   */
  tiles: Uint8Array;
  tileCount: number;
  /** The 16 colours the tiles' pixels index, each 0xRRGGBB; EGA's (data/ega.ts EGA_PALETTE) where none is given. */
  palette?: readonly number[];
  art: TileFigures | null;
  /** A mark's key the map opens on, chosen and shown though not yet seen (the journal's View); '' or none for none. */
  focus?: string;
  /** The cloth map's picture's address, where the game has one: a page of the maps once it loads. */
  cloth?: string;
  /** The map of the place the party is in, where it has one. */
  here?: WorldMapHere;
  /** A key read from the keyboard as the map takes it (a keyboard read as a controller's buttons); 0 for none. */
  keyOf?: (code: number) => number;
  /** The map closed. */
  onClose: () => void;
}

/**
 * Each of the first `count` tiles as its four quarters averaged, so a square shows a little of its own shape: from the
 * look's figure where `art` draws one, else from `tiles`, the game's own (16 by 16, four bits a pixel, 128 bytes a tile,
 * each pixel an index into `palette`, 16 colours as 0xRRGGBB: EGA's where none is given).
 */
export function tileQuads(tiles: Uint8Array, count: number, art: TileFigures | null, palette: readonly number[] = EGA_PALETTE): RGB[][] {
  const out: RGB[][] = [];
  for (let t = 0; t < count; t++) {
    const figure = art?.figure(t);
    const cell = figure ? Math.round(Math.sqrt(figure.length)) : 0;
    const quads: RGB[] = [];
    for (const [qy, qx] of [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      if (figure) {
        const half = cell >> 1;
        for (let y = qy * half; y < qy * half + half; y++) {
          for (let x = qx * half; x < qx * half + half; x++) {
            const px = figure[y * cell + x];
            if (px >>> 24 < 128) continue;
            r += px & 0xff;
            g += (px >> 8) & 0xff;
            b += (px >> 16) & 0xff;
            n++;
          }
        }
      }
      if (n < 24) {
        // Little or nothing drawn there (a piece laid over water): the game's own tile answers instead.
        r = g = b = n = 0;
        for (let y = qy * 8; y < qy * 8 + 8; y++) {
          for (let x = qx * 8; x < qx * 8 + 8; x++) {
            const byte = tiles[t * 128 + y * 8 + (x >> 1)];
            const rgb = palette[x & 1 ? byte & 15 : byte >> 4];
            r += (rgb >> 16) & 0xff;
            g += (rgb >> 8) & 0xff;
            b += rgb & 0xff;
            n++;
          }
        }
      }
      quads.push([r / n, g / n, b / n]);
    }
    out.push(quads);
  }
  return out;
}

const packed = ([r, g, b]: RGB): number => (0xff000000 | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;

/** Put a mark's glyph on the picture, with a light edge where one is given. */
function drawMark(px: Uint32Array, mark: Mark, ink: RGB, edge: RGB | null): void {
  const glyph = GLYPHS[mark.kind];
  const x0 = mark.x * MAP_SCALE - (GLYPH_SIZE >> 1) + 1;
  const y0 = mark.y * MAP_SCALE - (GLYPH_SIZE >> 1) + 1;
  const on = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < GLYPH_SIZE && y < GLYPH_SIZE && glyph[y][x] === '#';
  const colour = packed(ink);
  for (let y = -1; y <= GLYPH_SIZE; y++) {
    for (let x = -1; x <= GLYPH_SIZE; x++) {
      const ox = x0 + x;
      const oy = y0 + y;
      if (ox < 0 || oy < 0 || ox >= MAP_PIXELS || oy >= MAP_PIXELS) continue;
      const at = oy * MAP_PIXELS + ox;
      if (on(x, y)) px[at] = colour;
      else if (edge && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) {
        const was = px[at];
        const mix = (shift: number, to: number): number => Math.round(((was >>> shift) & 0xff) * 0.35 + to * 0.65);
        px[at] = (0xff000000 | (mix(16, edge[2]) << 16) | (mix(8, edge[1]) << 8) | mix(0, edge[0])) >>> 0;
      }
    }
  }
}

/** A steady box round the chosen mark - white, edged dark, so it shows on paper and on grass alike. */
function drawBox(px: Uint32Array, mark: Mark): void {
  const half = (GLYPH_SIZE >> 1) + 2;
  const x0 = mark.x * MAP_SCALE - half + 1;
  const y0 = mark.y * MAP_SCALE - half + 1;
  const n = half * 2;
  const set = (x: number, y: number, v: number): void => {
    if (x < 0 || y < 0 || x >= MAP_PIXELS || y >= MAP_PIXELS) return;
    px[y * MAP_PIXELS + x] = v;
  };
  const white = 0xfffefefe;
  const dark = 0xff10141a;
  for (let i = -1; i <= n; i++) {
    set(x0 + i, y0 - 1, dark);
    set(x0 + i, y0 + n, dark);
    set(x0 - 1, y0 + i, dark);
    set(x0 + n, y0 + i, dark);
  }
  for (let i = 0; i < n; i++) {
    const corner = i === 0 || i === n - 1;
    set(x0 + i, y0, corner ? dark : white);
    set(x0 + i, y0 + n - 1, corner ? dark : white);
    set(x0, y0 + i, corner ? dark : white);
    set(x0 + n - 1, y0 + i, corner ? dark : white);
  }
}

/**
 * How a world's map shows mark `m`: in full ('seen') where the party has seen its square (`seen`, a world's record), or
 * it is the place the journal's View opened the map on (`focus`); in the paper's ink ('paper') where the mapmaker knew
 * of it (on a map with `paper`) or the party has heard it named (`knows`); else not at all (null).
 */
export function inkOf(m: Mark, seen: Uint8Array, paper: boolean, knows: (key: string) => boolean, focus = ''): 'seen' | 'paper' | null {
  if (seen[(m.y & 0xff) * WORLD_SIZE + (m.x & 0xff)] !== 0 || (focus !== '' && m.key === focus)) return 'seen';
  if ((m.onPaper && paper) || (m.key !== undefined && knows(m.key))) return 'paper';
  return null;
}

/**
 * One world's picture: the paper (or the dark), what has been seen painted over it, the marks and the party - `party`,
 * its square on this world, or null; drawn where `lit` (it blinks, showWorldMap). The mark `reveal` (its key) is drawn
 * as seen: the place the journal opened the map on, known by name though not yet come to.
 */
function worldPicture(
  quads: RGB[][],
  world: WorldMapWorld,
  marks: Mark[],
  knows: (key: string) => boolean,
  chosen: number,
  lit = true,
  reveal = '',
): ImageData {
  const { paper, seen: fog, tiles: map, party } = world;
  const px = new Uint32Array(MAP_PIXELS * MAP_PIXELS);
  if (paper) px.set(paper);
  else px.fill(0xff0a0a0a);
  for (let y = 0; y < WORLD_SIZE; y++) {
    for (let x = 0; x < WORLD_SIZE; x++) {
      if (!fog[y * WORLD_SIZE + x]) continue;
      const q = quads[map[y * WORLD_SIZE + x]] as RGB[] | undefined;
      // A byte with no tile (WorldMapSource.tileCount) is left as the unseen are: the paper, or the dark.
      if (!q) continue;
      const o = y * MAP_SCALE * MAP_PIXELS + x * MAP_SCALE;
      px[o] = packed(q[0]);
      px[o + 1] = packed(q[1]);
      px[o + MAP_PIXELS] = packed(q[2]);
      px[o + MAP_PIXELS + 1] = packed(q[3]);
    }
  }
  const mark = (m: Mark): void => {
    const ink = inkOf(m, fog, paper !== null, knows, reveal);
    if (ink === 'seen') drawMark(px, m, MARK_INK, MARK_EDGE);
    else if (ink === 'paper') drawMark(px, m, INK, null);
  };
  marks.forEach((m, i) => {
    if (i !== chosen) mark(m);
  });
  if (party && lit) {
    // The party: a white square with a red heart, blinking (showWorldMap), where it stands now.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = party.x * MAP_SCALE + dx;
        const y = party.y * MAP_SCALE + dy;
        if (x < 0 || y < 0 || x >= MAP_PIXELS || y >= MAP_PIXELS) continue;
        px[y * MAP_PIXELS + x] = dx === 0 && dy === 0 ? 0xff5050ff : 0xfffefefe;
      }
    }
  }
  if (chosen >= 0 && chosen < marks.length) {
    mark(marks[chosen]);
    drawBox(px, marks[chosen]);
  }
  const img = new ImageData(MAP_PIXELS, MAP_PIXELS);
  new Uint32Array(img.data.buffer).set(px);
  return img;
}

/**
 * The map's legend: a name in the game's own font, white on the copper the Standard frame uses, the box made to the
 * name's length - `scale` pixels to a pixel of the font, and as much again round it.
 */
function drawLegend(canvas: HTMLCanvasElement, font: Font, text: string, scale: number): void {
  canvas.width = [...text].length * 8 * scale + 12 * scale;
  canvas.height = 8 * scale + 8 * scale;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#6b4726');
  grad.addColorStop(0.45, '#c08a4a');
  grad.addColorStop(0.55, '#8a5c2e');
  grad.addColorStop(1, '#4a2f18');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const chars = [...text].slice(0, Math.max(1, Math.floor(canvas.width / (8 * scale)) - 1));
  const x0 = Math.round((canvas.width - chars.length * 8 * scale) / 2);
  const y0 = Math.round((canvas.height - 8 * scale) / 2);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const set = (x: number, y: number, r: number, g: number, b: number): void => {
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
    const o = (y * canvas.width + x) * 4;
    img.data[o] = r;
    img.data[o + 1] = g;
    img.data[o + 2] = b;
    img.data[o + 3] = 255;
  };
  chars.forEach((ch, i) => {
    const code = ch.charCodeAt(0);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if (!glyphPixel(font, code, x, y)) continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            set(x0 + (i * 8 + x) * scale + sx + 1, y0 + y * scale + sy + 1, 26, 16, 10);
            set(x0 + (i * 8 + x) * scale + sx, y0 + y * scale + sy, 254, 254, 254);
          }
        }
      }
    }
  });
  ctx.putImageData(img, 0, 0);
}

/** What the map does with a key or button. */
type Action = 'zoom' | 'unzoom' | 'up' | 'down' | 'left' | 'right' | 'name' | 'other' | 'close';

function actionOf(code: number): Action {
  switch (code) {
    case Pad.Y:
    case 0x59:
    case 0x79:
    case 0x2b:
    case 0x3d:
      return 'zoom';
    case 0x2d:
      return 'unzoom';
    case K.Up:
      return 'up';
    case K.Down:
      return 'down';
    case K.Left:
      return 'left';
    case K.Right:
      return 'right';
    case Pad.A:
    case K.Enter:
    case K.Space:
      return 'name';
    case Pad.X:
    case 0x58:
    case 0x78:
      return 'other';
    default:
      return 'close';
  }
}

/** A DOM key as the codes the game and the map share. */
function codeOf(e: KeyboardEvent): number {
  const named: Record<string, number> = {
    ArrowUp: K.Up,
    ArrowDown: K.Down,
    ArrowLeft: K.Left,
    ArrowRight: K.Right,
    Enter: K.Enter,
    ' ': K.Space,
  };
  if (named[e.key] !== undefined) return named[e.key];
  return e.key.length === 1 ? e.key.charCodeAt(0) : K.Escape;
}

/** What the controller and touch pad drive while the map shows. */
let activeMap: { act: (code: number) => void } | null = null;

/** A button or key from the controller or touch pad, for the map if it is showing: true if the map took it. */
export function mapKey(code: number): boolean {
  if (!activeMap) return false;
  activeMap.act(code);
  return true;
}
/**
 * Show a game's maps until closed (`source`, WorldMapSource): opened on the place the party is in, else the world the
 * source opens on - or `source.focus`'s place, chosen, on whichever world has it, shown though not yet seen.
 */
export function showWorldMap(source: WorldMapSource): Promise<void> {
  const focus = source.focus ?? '';
  const { here, worlds } = source;
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:20;background:#000;display:flex;align-items:center;justify-content:center;overflow:hidden;';
  const frame = document.createElement('div');
  frame.style.cssText = 'position:relative;overflow:hidden;touch-action:none;flex:none;';
  // The legend: the name of what is chosen, in a box of its own over the map's lower right corner.
  const legend = document.createElement('canvas');
  legend.style.cssText =
    'position:absolute;right:16px;bottom:16px;image-rendering:pixelated;border:2px solid #7a401f;box-shadow:0 3px 12px rgba(0,0,0,0.6);transform-origin:100% 100%;pointer-events:none;display:none;';
  let legendSays = '';
  overlay.append(frame, legend);
  document.body.appendChild(overlay);

  const quads = tileQuads(source.tiles, source.tileCount, source.art, source.palette);
  const font = source.font;
  // Each world's marks, the party's own to be added to them.
  const marks: Mark[][] = worlds.map((w) => [...w.marks]);
  const chosen: number[] = worlds.map(() => -1);

  const cloth = document.createElement('img');
  /** The cloth map is a map only once its picture is there: the player may not have put one beside the page. */
  const hasCloth = (): boolean => cloth.naturalWidth > 0;
  if (source.cloth) cloth.src = source.cloth;
  cloth.alt = '';
  cloth.draggable = false;
  cloth.style.cssText = 'position:absolute;left:0;top:0;user-select:none;';
  const inner = document.createElement('canvas');
  inner.width = inner.height = MAP_PIXELS;
  /** A world's map as it shows: VIEW squares a side of `inner`'s picture, about the centre, at twice its size. */
  const view = document.createElement('canvas');
  view.width = view.height = MAP_PIXELS;

  const { x: px, y: py } = source.from;
  /** The party, a mark of its own on the world it is on, named by the Avatar: where the map opens, and Y returns. */
  const partyMark: (Mark | null)[] = worlds.map((w, i) => {
    if (!w.party) return null;
    const m: Mark = { x: w.party.x, y: w.party.y, kind: 'party', name: source.partyName, onPaper: true };
    marks[i].push(m);
    return m;
  });
  /**
   * The marks the d-pad steps between on world `w`: every one the map shows - a place the party has seen, and on a
   * world's paper every place the mapmaker knew, as the cloth map draws them - no hut, no dungeon - and every place
   * heard named (the port's; it went only to those seen).
   */
  const shown = (w: number): Mark[] =>
    marks[w].filter((m) => inkOf(m, worlds[w].seen, worlds[w].paper !== null, source.knows, focus) !== null);
  /** The square each world's map is centred on: the place chosen, which it slides to. */
  const centre = worlds.map(() => ({ x: px, y: py }));
  worlds.forEach((_, w) => {
    const list = shown(w);
    const party = partyMark[w];
    const i = party ? list.indexOf(party) : nearestMark(list, px, py, WORLD_SIZE);
    chosen[w] = i >= 0 ? marks[w].indexOf(list[i]) : -1;
    const at = chosen[w] >= 0 ? marks[w][chosen[w]] : null;
    if (at) centre[w] = { x: at.x + 0.5, y: at.y + 0.5 };
  });
  // The place the journal asked for, chosen and centred on the first world that has it, which the map opens on.
  const focusAt = focusOf(marks, focus);
  const focused = focusAt ? focusAt.world : -1;
  if (focusAt) {
    chosen[focused] = focusAt.at;
    const at = marks[focused][chosen[focused]];
    centre[focused] = { x: at.x + 0.5, y: at.y + 0.5 };
  }
  /** The party's mark lit or dark, by turns (about twice a second, the blink's timer below). */
  let lit = true;

  const pages = (): Page[] => {
    const out: Page[] = [];
    if (here) out.push('here');
    worlds.forEach((w, i) => {
      if (w.offered || i === focused) out.push(i);
    });
    if (hasCloth()) out.push('cloth');
    return out;
  };
  let page: Page = focused >= 0 ? focused : here ? 'here' : source.opensOn;
  let zoom = 0;
  let cx = 0.5;
  let cy = 0.5;

  /** The world on show: the page's, or the first world's on a page of another kind. */
  const world = (): number => (typeof page === 'number' ? page : 0);
  const onWorld = (): boolean => typeof page === 'number';
  /** The name under the map, always shown: where the party is on its own map, else the place chosen. */
  const nameNow = (): string => {
    if (page === 'here') return here?.name ?? '';
    const w = world();
    // (The place the journal opened the map on goes by the name the journal gave it: a shrine is its virtue's.)
    return chosen[w] >= 0 ? labelOf(marks[w][chosen[w]], (key) => source.knows(key) || key === focus) : '';
  };
  const seenMarks = (): Mark[] => shown(world());

  /** How many squares the world's map shows across and down: VIEW on the window's shorter side, more on the longer. */
  let span = { cols: VIEW, rows: VIEW };
  /** The world's picture through the window, about its centre, joined across the world's edges as often as it takes. */
  const present = (): void => {
    if (!onWorld()) return;
    const c = centre[world()];
    const ctx = view.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const scale = view.width / (span.cols * MAP_SCALE);
    const left = ((((c.x - span.cols / 2) % WORLD_SIZE) + WORLD_SIZE) % WORLD_SIZE) * MAP_SCALE;
    const top = ((((c.y - span.rows / 2) % WORLD_SIZE) + WORLD_SIZE) % WORLD_SIZE) * MAP_SCALE;
    // Each copy put on whole pixels, edge to edge with the next, so no line of the dark shows where they meet.
    const at = (o: number, from: number): number => Math.round((o - from) * scale);
    for (let ox = 0; ox - left < span.cols * MAP_SCALE; ox += MAP_PIXELS)
      for (let oy = 0; oy - top < span.rows * MAP_SCALE; oy += MAP_PIXELS) {
        const x = at(ox, left);
        const y = at(oy, top);
        ctx.drawImage(inner, x, y, at(ox + MAP_PIXELS, left) - x, at(oy + MAP_PIXELS, top) - y);
      }
  };
  /** The legend saying `text`, sized to it - none for nothing - and popping up anew when what it says changes. */
  const showLegend = (text: string): void => {
    if (!text) {
      legend.style.display = 'none';
      legendSays = '';
      return;
    }
    // Larger on a larger window, but never wider than the window has room for (a phone, a long name).
    const fits = Math.floor((window.innerWidth - 40) / ([...text].length * 8 + 12));
    const scale = Math.max(1, Math.min(fits, Math.max(2, Math.round(Math.min(window.innerWidth, window.innerHeight) / 360))));
    drawLegend(legend, font, text, scale);
    legend.style.width = `${legend.width}px`;
    legend.style.height = `${legend.height}px`;
    legend.style.display = 'block';
    if (text !== legendSays && typeof legend.animate === 'function')
      legend.animate(
        [
          { transform: 'scale(0.86)', opacity: 0.4 },
          { transform: 'scale(1)', opacity: 1 },
        ],
        { duration: 140, easing: 'ease-out' },
      );
    legendSays = text;
  };
  /** The window sliding to centre on a mark, the shorter way round the world. */
  let sliding = 0;
  let landing = 0;
  const slideTo = (m: Mark): void => {
    const w = world();
    const from = { ...centre[w] };
    const dx = wrapped(m.x + 0.5 - from.x, WORLD_SIZE);
    const dy = wrapped(m.y + 0.5 - from.y, WORLD_SIZE);
    const start = performance.now();
    cancelAnimationFrame(sliding);
    clearTimeout(landing);
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / SLIDE_MS);
      const eased = 1 - (1 - t) * (1 - t);
      centre[w] = { x: from.x + dx * eased, y: from.y + dy * eased };
      present();
      if (t < 1) sliding = requestAnimationFrame(step);
    };
    sliding = requestAnimationFrame(step);
    // Where frames are held back (a hidden window), it lands all the same.
    landing = window.setTimeout(() => step(start + SLIDE_MS), SLIDE_MS + 50);
  };

  const layout = (): void => {
    frame.textContent = '';
    // A picture of a set size (a town's level, a dungeon's, the cloth map) as large as the window has room for.
    const room = Math.max(240, window.innerHeight);
    const size = Math.min(window.innerWidth, room);
    frame.style.border = onWorld() ? 'none' : '2px solid #7a401f';
    if (page === 'cloth') {
      const ratio = (cloth.naturalHeight || 1571) / (cloth.naturalWidth || 1500);
      const w = Math.min(window.innerWidth * 0.94, room / ratio);
      const h = w * ratio;
      frame.style.width = `${w}px`;
      frame.style.height = `${h}px`;
      const z = ZOOMS[zoom];
      const half = 0.5 / z;
      cx = Math.min(1 - half, Math.max(half, cx));
      cy = Math.min(1 - half, Math.max(half, cy));
      cloth.style.width = `${w * z}px`;
      cloth.style.height = `${h * z}px`;
      cloth.style.transform = `translate(${w / 2 - cx * w * z}px, ${h / 2 - cy * h * z}px)`;
      frame.appendChild(cloth);
      frame.style.cursor = z > 1 ? 'grab' : 'pointer';
      showLegend('');
      return;
    }
    if (page === 'here' && here) {
      const img = new ImageData(here.size, here.size);
      new Uint32Array(img.data.buffer).set(here.picture(lit));
      inner.width = inner.height = here.size;
      inner.getContext('2d')!.putImageData(img, 0, 0);
    } else {
      const w = world();
      inner.width = inner.height = MAP_PIXELS;
      inner.getContext('2d')!.putImageData(worldPicture(quads, worlds[w], marks[w], source.knows, chosen[w], lit, focus), 0, 0);
    }
    if (page === 'here') {
      inner.style.cssText = `width:${size}px;height:${size}px;image-rendering:pixelated;display:block;`;
      frame.style.width = frame.style.height = `${size}px`;
      frame.style.cursor = 'pointer';
      frame.appendChild(inner);
    } else {
      // A world's map fills the window: VIEW squares across its shorter side, as many more as the longer one holds.
      const w = window.innerWidth;
      const h = window.innerHeight;
      // ... but never more than the world itself on the longer side (a phone held upright), so none of it shows twice.
      const per = Math.max(Math.min(w, h) / VIEW, Math.max(w, h) / WORLD_SIZE);
      span = { cols: w / per, rows: h / per };
      view.width = Math.round(span.cols * MAP_SCALE * 2);
      view.height = Math.round(span.rows * MAP_SCALE * 2);
      view.style.cssText = `width:${w}px;height:${h}px;image-rendering:pixelated;display:block;`;
      frame.style.width = `${w}px`;
      frame.style.height = `${h}px`;
      frame.style.cursor = 'grab';
      frame.appendChild(view);
      present();
    }
    showLegend(nameNow());
  };
  cloth.addEventListener('load', layout);
  window.addEventListener('resize', layout);

  return new Promise((resolve) => {
    // The party's mark blinks: the world's picture drawn again, lit and dark by turns.
    // On the map of the town, keep or castle the party is in, too - not a dungeon's, where it stays steady.
    const blink = setInterval(() => {
      if (page === 'cloth' || (page === 'here' && !here?.blinks)) return;
      if (page !== 'here' && !worlds[world()].party) return;
      lit = !lit;
      layout();
    }, 450);
    const close = (): void => {
      clearInterval(blink);
      cancelAnimationFrame(sliding);
      clearTimeout(landing);
      overlay.remove();
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', layout);
      activeMap = null;
      source.onClose();
      resolve();
    };
    const move = (dx: number, dy: number): void => {
      const w = world();
      const list = seenMarks();
      if (!list.length) return;
      const current = chosen[w] >= 0 ? marks[w][chosen[w]] : null;
      const next = stepTo(list, current ? list.indexOf(current) : -1, dx, dy, WORLD_SIZE);
      if (next < 0) return;
      chosen[w] = marks[w].indexOf(list[next]);
      layout();
      slideTo(list[next]);
    };
    /** Back to the party: chosen, and the map slid to it (Y). */
    const home = (): void => {
      const w = world();
      const party = partyMark[w];
      if (!party) return;
      chosen[w] = marks[w].indexOf(party);
      layout();
      slideTo(party);
    };
    const turnPage = (): void => {
      const list = pages();
      page = list[(list.indexOf(page) + 1) % list.length];
    };
    const act = (a: Action): void => {
      if (page === 'cloth') {
        const step = 0.25 / ZOOMS[zoom];
        switch (a) {
          case 'zoom':
            zoom = (zoom + 1) % ZOOMS.length;
            break;
          case 'unzoom':
            zoom = Math.max(0, zoom - 1);
            break;
          case 'up':
            cy -= step;
            break;
          case 'down':
            cy += step;
            break;
          case 'left':
            cx -= step;
            break;
          case 'right':
            cx += step;
            break;
          case 'name':
            break;
          case 'other':
            turnPage();
            break;
          case 'close':
            close();
            return;
        }
        layout();
        return;
      }
      if (page === 'here' && (a === 'up' || a === 'down' || a === 'left' || a === 'right')) return;
      switch (a) {
        case 'up':
          move(0, -1);
          return;
        case 'down':
          move(0, 1);
          return;
        case 'left':
          move(-1, 0);
          return;
        case 'right':
          move(1, 0);
          return;
        case 'name':
          // The name already shows; A has nothing more to say.
          return;
        case 'other':
          turnPage();
          break;
        case 'zoom':
          if (page !== 'here') home();
          return;
        case 'unzoom':
          break;
        case 'close':
          close();
          return;
      }
      layout();
    };
    const key = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return; // a modifier on its own is no key
      // A key as the game's map takes it (WorldMapSource.keyOf): a keyboard read as a controller is one here too.
      const code = source.keyOf ? source.keyOf(codeOf(e)) : codeOf(e);
      if (code !== 0) act(actionOf(code));
    };
    window.addEventListener('keydown', key, true);
    let drag: { x: number; y: number; moved: boolean } | null = null;
    frame.addEventListener('pointerdown', (e) => {
      cancelAnimationFrame(sliding);
      clearTimeout(landing);
      drag = { x: e.clientX, y: e.clientY, moved: false };
      frame.setPointerCapture(e.pointerId);
    });
    frame.addEventListener('pointermove', (e) => {
      if (!drag || !(onWorld() || (page === 'cloth' && ZOOMS[zoom] > 1))) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (onWorld()) {
        // A world's map dragged about, round its edges as the world goes.
        const per = view.clientWidth / span.cols;
        const c = centre[world()];
        centre[world()] = { x: c.x - dx / per, y: c.y - dy / per };
        present();
        return;
      }
      cx -= dx / cloth.clientWidth;
      cy -= dy / cloth.clientHeight;
      layout();
    });
    frame.addEventListener('pointerup', () => {
      const moved = drag?.moved;
      drag = null;
      if (!moved && (page !== 'cloth' || ZOOMS[zoom] === 1)) close();
    });
    frame.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (page !== 'cloth') return;
        zoom = Math.max(0, Math.min(ZOOMS.length - 1, zoom + (e.deltaY < 0 ? 1 : -1)));
        layout();
      },
      { passive: false },
    );
    overlay.addEventListener('pointerup', (e) => {
      if (e.target === overlay) close();
    });
    activeMap = { act: (code) => act(actionOf(code)) };
    layout();
  });
}
