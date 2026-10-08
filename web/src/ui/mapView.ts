/**
 * mapView.ts
 *
 * The maps over the game, two pixels a square.
 *
 * Inside a town, keep or castle the map opens on that level, drawn from
 * the tiles standing there; in a dungeon, on that level's eight by eight
 * grid of cells, each with the mark of what it is. Either shows only
 * what the party has seen (interiorMap.ts).
 *
 * Britannia opens on the map the party set out with: coasts drawn in ink
 * on paper (parchment.ts), the places the mapmaker knew marked in brown,
 * and painted over it, as it is seen, what the party has found for
 * itself - every square the viewport has shown, in the colours of the
 * tiles standing there. The Underworld has no drawn map: it is dark
 * until it is walked, and the player cannot turn to it at all until the
 * party has been down there.
 *
 * A world's map fills the screen, a quarter of the world across its
 * shorter side at twice the drawn map's size, joined across its edges as
 * the world wraps. It opens on the party, a mark of its own named by the
 * Avatar, and the d-pad or the arrows move between the marks the map
 * shows - the party, those the party has seen, and the mapmaker's on the
 * paper, the cloth map's names for the land among them - the map sliding
 * to centre each one chosen; Y comes back to the party, and a drag moves
 * the map about. A legend over the lower right corner, its box made to
 * fit, gives the chosen one's name, from DATA.OVL, in the game's own font
 * - or, for a place whose name the party has not learnt, what it looks
 * like ("Towne?"). X turns to the next map, B closes. Where the cloth map
 * from the box sits beside the page it is one of the maps too, and Y
 * zooms it.
 */

import { glyphPixel, readFont, type Font } from '../data/font.ts';
import { readBritannia, readLocations, readUnderworld, SETTLEMENTS, WORLD_SIZE } from '../data/maps.ts';
import { EGA_PALETTE } from '../data/tiles.ts';
import type { Game } from '../game/game.ts';
import { asPad } from '../game/input.ts';
import { K, Pad } from '../game/io.ts';
import { knowsPlace } from '../game/placeNames.ts';
import { GLYPH_SIZE, GLYPHS, labelOf, marksFor, nearestMark, stepTo, wrapped, type Mark } from './mapMarks.ts';
import { CELL_NAMES, cellKind, dungeonPicture, INTERIOR_PIXELS, townPicture } from './interiorMap.ts';
import { drawParchment, INK, MAP_PIXELS, MAP_SCALE } from './parchment.ts';
import type { StandardArt } from './standardArt.ts';

/** The cloth map's picture, where the player has put one beside the page. */
const CLOTH = 'U5map.jpg';
const ZOOMS = [1, 2, 3];
/** How many squares a world's map shows across the window's shorter side: a quarter of the world, at twice the size. */
const VIEW = 128;
/** How long the map takes to slide to the place chosen, in milliseconds. */
const SLIDE_MS = 150;

/** A mark's ink on the surveyed map, and the thin light edge that holds it against forest or sea. */
const MARK_INK: RGB = [30, 22, 16];
const MARK_EDGE: RGB = [247, 238, 214];

type RGB = [number, number, number];
/** The maps on offer: where the party is standing, the two worlds, and a cloth map if one is there. */
type Page = 'here' | 'cloth' | 'brit' | 'under';
type World = 'brit' | 'under';

/** Each tile as its four quarters averaged, so a square shows a little of its own shape. */
function tileQuads(tiles: Uint8Array, art: StandardArt | null): RGB[][] {
  const out: RGB[][] = [];
  for (let t = 0; t < 0x200; t++) {
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
            const rgb = EGA_PALETTE[x & 1 ? byte & 15 : byte >> 4];
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
 * One world's picture: the paper (or the dark), what has been seen painted over it, the marks and the party - `party`,
 * its square on this world, or null; drawn where `lit` (it blinks, showMap).
 */
function worldPicture(
  g: Game,
  quads: RGB[][],
  world: World,
  paper: Uint32Array | null,
  map: Uint8Array,
  marks: Mark[],
  chosen: number,
  party: { x: number; y: number } | null = null,
  lit = true,
): ImageData {
  const underworld = world === 'under';
  const fog = g.fog.of(underworld);
  const px = new Uint32Array(MAP_PIXELS * MAP_PIXELS);
  if (paper) px.set(paper);
  else px.fill(0xff0a0a0a);
  for (let y = 0; y < WORLD_SIZE; y++) {
    for (let x = 0; x < WORLD_SIZE; x++) {
      if (!fog[y * WORLD_SIZE + x]) continue;
      const q = quads[map[y * WORLD_SIZE + x]];
      const o = y * MAP_SCALE * MAP_PIXELS + x * MAP_SCALE;
      px[o] = packed(q[0]);
      px[o + 1] = packed(q[1]);
      px[o + MAP_PIXELS] = packed(q[2]);
      px[o + MAP_PIXELS + 1] = packed(q[3]);
    }
  }
  const mark = (m: Mark): void => {
    if (g.fog.seen(underworld, m.x, m.y)) drawMark(px, m, MARK_INK, MARK_EDGE);
    else if (m.onPaper && paper) drawMark(px, m, INK, null);
  };
  marks.forEach((m, i) => {
    if (i !== chosen) mark(m);
  });
  if (party && lit) {
    // The party: a white square with a red heart, blinking (showMap), where it stands now.
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

/** A name as a line is printed: IOLO'S HUT becomes Iolo's Hut. */
function titled(name: string): string {
  return name
    .toLowerCase()
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
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

/** Show the maps until closed. */
export function showMap(
  g: Game,
  tiles: Uint8Array,
  underworld: boolean,
  onClose: () => void,
  art: StandardArt | null = null,
): Promise<void> {
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

  const quads = tileQuads(tiles, art);
  const font = readFont(g.data.files.get('IBM.CH'));
  const worlds: Record<World, Uint8Array> = {
    brit: readBritannia(g.data.files, g.data.ovl).tiles,
    under: readUnderworld(g.data.files).tiles,
  };
  const paper = drawParchment(worlds.brit);
  const marks: Record<World, Mark[]> = {
    brit: marksFor(g.data.ovl, g.s, worlds.brit, false, g.fog),
    under: marksFor(g.data.ovl, g.s, worlds.under, true, g.fog),
  };
  const chosen: Record<World, number> = { brit: -1, under: -1 };

  const cloth = document.createElement('img');
  /** The cloth map is a map only once its picture is there: the player may not have put one beside the page. */
  const hasCloth = (): boolean => cloth.naturalWidth > 0;
  cloth.src = `${import.meta.env.BASE_URL}${CLOTH}`;
  cloth.alt = '';
  cloth.draggable = false;
  cloth.style.cssText = 'position:absolute;left:0;top:0;user-select:none;';
  const inner = document.createElement('canvas');
  inner.width = inner.height = MAP_PIXELS;
  /** A world's map as it shows: VIEW squares a side of `inner`'s picture, about the centre, at twice its size. */
  const view = document.createElement('canvas');
  view.width = view.height = MAP_PIXELS;

  // Where the party is standing, if that is a place with a map of its own.
  const inside = g.s.mapId > 0 && g.s.mapId < 0x80;
  const dungeon = inside && g.s.mapId > SETTLEMENTS;
  const where = inside && !dungeon ? (readLocations(g.data.ovl).find((l) => l.id === g.s.mapId) ?? null) : null;
  const hasHere = dungeon || !!where;

  // The place nearest the party chosen from the start, so a place is always marked: from where the party stands
  // outdoors, or from the entrance of the town or dungeon it is in.
  const entrance = inside ? (readLocations(g.data.ovl).find((l) => l.id === g.s.mapId) ?? null) : null;
  const [px, py] = entrance ? [entrance.x, entrance.y] : [g.s.x, g.s.y];
  /** Where the party is on world `w`: its square outdoors, or the square of the place it is inside. */
  const partyOn = (w: World): { x: number; y: number } | null => {
    const s = g.s;
    if (s.mapId === 0) return (s.level === 0xff) === (w === 'under') ? { x: s.x, y: s.y } : null;
    return entrance && w === 'brit' ? { x: entrance.x, y: entrance.y } : null;
  };
  /** The party, a mark of its own on the world it is on, named by the Avatar: where the map opens, and Y returns. */
  const partyMark: Record<World, Mark | null> = { brit: null, under: null };
  for (const w of ['brit', 'under'] as World[]) {
    const at = partyOn(w);
    if (!at) continue;
    partyMark[w] = { x: at.x, y: at.y, kind: 'party', name: g.s.members[0].name || 'Avatar', onPaper: true };
    marks[w].push(partyMark[w]);
  }
  /**
   * The marks the d-pad steps between on world `w`: every one the map shows - a place the party has seen, and on
   * Britannia's paper every place the mapmaker knew, as the cloth map draws them - no hut, no dungeon (the port's;
   * it went only to those seen).
   */
  const shown = (w: World): Mark[] => marks[w].filter((m) => g.fog.seen(w === 'under', m.x, m.y) || (w === 'brit' && m.onPaper));
  /** The square each world's map is centred on: the place chosen, which it slides to. */
  const centre: Record<World, { x: number; y: number }> = { brit: { x: px, y: py }, under: { x: px, y: py } };
  for (const w of ['brit', 'under'] as World[]) {
    const list = shown(w);
    const party = partyMark[w];
    const i = party ? list.indexOf(party) : nearestMark(list, px, py, WORLD_SIZE);
    chosen[w] = i >= 0 ? marks[w].indexOf(list[i]) : -1;
    const at = chosen[w] >= 0 ? marks[w][chosen[w]] : null;
    if (at) centre[w] = { x: at.x + 0.5, y: at.y + 0.5 };
  }
  /** The party's mark lit or dark, by turns (about twice a second, showMap's timer). */
  let lit = true;

  const pages = (): Page[] => {
    const out: Page[] = [];
    if (hasHere) out.push('here');
    out.push('brit');
    if (g.fog.knowsUnderworld) out.push('under');
    if (hasCloth()) out.push('cloth');
    return out;
  };
  let page: Page = hasHere ? 'here' : underworld && g.fog.knowsUnderworld ? 'under' : 'brit';
  let zoom = 0;
  let cx = 0.5;
  let cy = 0.5;

  const world = (): World => (page === 'under' ? 'under' : 'brit');
  /** Where the party stands, said plainly: the cell it is in underground, the level it is on above. */
  const hereName = (): string => {
    if (dungeon) return CELL_NAMES[cellKind(g.s.dungeon[g.s.level * 0x40 + (g.s.y & 7) * 8 + (g.s.x & 7)])];
    return where ? titled(where.name) : '';
  };
  /** The name under the map, always shown: where the party is on its own map, else the place chosen. */
  const nameNow = (): string => {
    if (page === 'here') return hereName();
    const w = world();
    return chosen[w] >= 0 ? labelOf(marks[w][chosen[w]], (key) => knowsPlace(g, key)) : '';
  };
  const seenMarks = (): Mark[] => shown(world());

  /** How many squares the world's map shows across and down: VIEW on the window's shorter side, more on the longer. */
  let span = { cols: VIEW, rows: VIEW };
  /** The world's picture through the window, about its centre, joined across the world's edges as often as it takes. */
  const present = (): void => {
    if (page !== 'brit' && page !== 'under') return;
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
    frame.style.border = page === 'brit' || page === 'under' ? 'none' : '2px solid #7a401f';
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
    if (page === 'here') {
      const px = dungeon ? dungeonPicture(g, g.s.mapId, g.s.level) : townPicture(g, where!, g.s.level, tiles, art, lit);
      const img = new ImageData(INTERIOR_PIXELS, INTERIOR_PIXELS);
      new Uint32Array(img.data.buffer).set(px);
      inner.width = inner.height = INTERIOR_PIXELS;
      inner.getContext('2d')!.putImageData(img, 0, 0);
    } else {
      const w = world();
      inner.width = inner.height = MAP_PIXELS;
      inner
        .getContext('2d')!
        .putImageData(worldPicture(g, quads, w, w === 'under' ? null : paper, worlds[w], marks[w], chosen[w], partyOn(w), lit), 0, 0);
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
      if (page === 'cloth' || (page === 'here' && dungeon)) return;
      if (page !== 'here' && !partyOn(world())) return;
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
      onClose();
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
      // A keyboard read as a controller is one here too (input.ts asPad): Z names, X the other page, a letter that
      // is no button nothing.
      const code = g.options.input === 'controller' ? asPad(g, codeOf(e)) : codeOf(e);
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
      const onWorld = page === 'brit' || page === 'under';
      if (!drag || !(onWorld || (page === 'cloth' && ZOOMS[zoom] > 1))) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (onWorld) {
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
