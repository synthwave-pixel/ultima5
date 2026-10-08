/**
 * standardArt.ts
 *
 * The Standard tile art: a sheet of 64-pixel cells (the ultima3 port's size), the 512 tiles in the
 * game's order (32 to a row) and then any extra animation frames, with a
 * manifest (standard-tiles.json) of how tiles move. The art is drawn with
 * transparency where a tile lets what is beneath show: a creature over
 * the ground it stands on, a shore over running water, a chair over the
 * floor.
 *
 * The manifest:
 *   scroll: { "tile": pixels a tick } - the art rolls down (water, lava)
 *   frames: { "tile": [cell, cell, ...] } - cells shown in turn, a tick each
 *   under:  { "tile": tile } - drawn over that tile (as it moves) first
 *   pieces: { "name": { cell, w, h } } - what the game plants itself (the woods' oak and bush)
 *   below:  { "tile": cell } - the tile as it is drawn below the world (the Underworld's grey high country)
 *   variants, variantsBelow: { "tile": [cell, ...] } - the tile in several versions (the hill's layouts), one to a
 *           square by its place (variantOf); and below the world
 *   palace: { "tile": [cell, ...] } - Blackthorn's palace's own versions of the castle's squares (frames in turn),
 *           drawn wherever the castle's gate square is the palace's (PALACE_GATE); the castle's elsewhere
 *   land:   { "tile": cell } - a bank: over its under-tile, the ground round the square is laid where that cell is
 *           opaque, and the tile (the bank's shallows) over both - swamp by a river in a swamp, grass by one in a meadow
 *
 * On the world map, in a settlement or on the combat map, a square that is water, a bank or a bridge, or soft ground
 * beside them, has its shore drawn from the map instead (shore.ts), given where
 * the square is; and woods, and grass beside them, their trees (woods.ts).
 *   clock:  [tile, ...] - the time drawn on it, as the EGA clock's hands
 */

import { type Appearance, FIGURES } from '../game/appearance.ts';
import type { Dressing, Figure, Place } from '../game/io.ts';
import { dress, hasRegions, labels } from './avatarRegions.ts';
import { HI, HI_WIDTH, type TileArt } from './framebuffer.ts';
import {
  FALLS as FALL_FRAMES,
  GRASS as GRASS_COLOURS,
  MOONGATE,
  PIER,
  ORIGINALS,
  OUTDOORS,
  SHORE_SAND,
  STRUCTURE,
  WET_EDGES,
  byWater,
  indices,
  MIRROR,
  mirrorGlass,
  original,
} from './originals.ts';
import { Ranges } from './ranges.ts';
import { Shores } from './shore.ts';
import { Soils } from './soils.ts';
import { Wear } from './wear.ts';
import { type Piece, Woods } from './woods.ts';

/** A tile on the colour page: the EGA tile's sixteen pixels at the page's scale. */
export const CELL = 16 * HI;
/** A tile's side in the EGA's pixels, as the original tiles draw it. */
const TILE = 16;
export const SHEET_COLUMNS = 32;

export interface Manifest {
  scroll?: Record<string, number>;
  frames?: Record<string, number[]>;
  under?: Record<string, number>;
  land?: Record<string, number>;
  pieces?: Record<string, Piece>;
  below?: Record<string, number>;
  variants?: Record<string, number[]>;
  variantsBelow?: Record<string, number[]>;
  palace?: Record<string, number[]>;
  /** Modern PC's own versions of tiles it keeps from the sheet, on the originals' grid: each tile's cell (useOriginals). */
  pc?: Record<string, number>;
  clock?: number[];
}

/** The castle's six squares on the world map, three by two, row by row; and the palace's gate, its fifth. */
const CASTLE = [0x3a, 0x3b, 0x3c, 0x3d, 0x3e, 0x3f];
const PALACE_GATE = 0x39;

/** Lava: its own light below the world as above. */
const LAVA = 0x8f;

/** The ground a bank is given when the drawing names none: grass. */
const GRASS = 0x05;
/** The land's own tiles (the art direction's rule 8): what is darkened below the world. */
export const LAND = new Set([
  0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x1e, 0x1f, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25,
  0x26, 0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x60, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6c, 0x6d, 0x6e, 0x6f,
  0x8f,
]);

/**
 * The Underworld's land: no sun lies on it, so it is darker and colder than Britannia's (the pieces keep theirs) -
 * and its grass (Modern PC's, originals.ts GRASS) grey, its colour taken away and its lightness kept.
 */
function belowTheWorld(out: Uint32Array): void {
  const grey = (c: number): number => {
    const l = Math.round((c >> 16) * 0.3 + ((c >> 8) & 0xff) * 0.59 + (c & 0xff) * 0.11);
    return (0xff000000 | (l << 16) | (l << 8) | l) >>> 0;
  };
  const rgba = (c: number): number => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;
  const [ground, blade] = [rgba(GRASS_COLOURS.ground), rgba(GRASS_COLOURS.blade)];
  const [groundGrey, bladeGrey] = [grey(GRASS_COLOURS.ground), grey(GRASS_COLOURS.blade)];
  for (let i = 0; i < out.length; i++) {
    const v = out[i];
    if (v === ground || v === blade) {
      out[i] = v === ground ? groundGrey : bladeGrey;
      continue;
    }
    const r = Math.round((v & 0xff) * 0.68);
    const g = Math.round(((v >> 8) & 0xff) * 0.74);
    const b = Math.round(((v >> 16) & 0xff) * 0.9);
    out[i] = ((v & 0xff000000) | (b << 16) | (g << 8) | r) >>> 0;
  }
}

/**
 * Whether the world's woods are planted from the map, tree by tree (woods.ts), or drawn a square at a time from the
 * sheet: the ultima3 port's brush and forest themselves, recoloured (tools/art terrain.ts u3Woods), whose trees
 * stand as regular and clear as that port's.
 */
const PLANTED_WOODS = false;

/**
 * Whether mountains and hills are drawn from the map as ranges (ranges.ts: peaks and knolls running on from square to
 * square, and close up a mass of rock), or a square at a time from the sheet: the high country (tools/art
 * terrain.ts highCountry) - the hill an arch on the grass, the mountain and peak whole squares of rock over a
 * darker weave; below the world grey stone (Manifest.below). Out in the overworld (Britannia and the Underworld),
 * and close up (towns and fights).
 */
const RANGES_OVERWORLD = false;
const RANGES_CLOSE = false;

/**
 * Which of `n` versions of a tile the square at (x, y) shows: its place through an integer hash (large primes, the
 * bits then scrambled), so the same square always shows the same one, and a field of them no pattern to the eye.
 */
export function variantOf(x: number, y: number, n: number): number {
  let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h % n;
}

/**
 * The outline round a figure (Settings' Outlines, Modern PC's): how many of the sheet's pixels wide - each a quarter
 * of an original pixel - and its colour (RGBA in memory order). Drawn where the ground shows round the figure and in
 * its gaps, the diagonals too, never over the figure itself.
 */
export const OUTLINE_WIDTH = 2;
export const OUTLINE_COLOUR = 0xff000000;

/** The first actor tile: the people and creatures (and the things they carry) are outlined, not the map's. */
const ACTORS = 0x100;

/** The bridges and the waterfall's frames: over a shore drawn from the map, drawn again on top of it. */
const BRIDGES = new Set([0x6a, 0x6b, 0xd4, 0xd5, 0xd6, 0xd7]);
/** The mirror as it reflects someone standing before it (world.ts T.Mirror9E). */
const MIRROR_REFLECTING = 0x9e;

/** The waterfall's four frames, which the game shows in turn: one terrain whichever frame is showing. */
const FALLS = new Set([0xd4, 0xd5, 0xd6, 0xd7]);

export class StandardArt implements TileArt {
  private readonly scrollBy = new Map<number, number>();
  private readonly frames = new Map<number, number[]>();
  private readonly under = new Map<number, number>();
  private readonly land = new Map<number, number>();
  /** Tiles drawn otherwise below the world (Manifest.below), and whether the square being drawn is there. */
  private readonly belowCells = new Map<number, number>();
  private underworld = false;
  /** Tiles drawn in several versions (Manifest.variants), and the place of the square being drawn, which chooses. */
  private readonly variants = new Map<number, number[]>();
  private readonly variantsBelow = new Map<number, number[]>();
  private readonly palace = new Map<number, number[]>();
  private at: Place | null = null;
  private readonly clocks = new Set<number>();
  /** Modern PC's own versions of tiles it keeps from the sheet (Manifest.pc), put in by useOriginals. */
  private readonly pcCells: Record<string, number>;
  /** Whether each cell has any see-through pixel. */
  private readonly clear: boolean[] = [];
  private readonly cells: number;
  private tickCount = 0;
  private hour = 0;
  private minute = 0;
  private readonly scratch = new Uint32Array(CELL * CELL);
  private readonly ranges = new Ranges({
    pixel: (cell, x, y) => {
      const [cx, cy] = this.origin(cell);
      return this.sheet[(cy + y) * this.sheetWidth + cx + x];
    },
  });
  private readonly shores = new Shores({
    // Read for every pixel of every shore in view each tick: its cell's corner worked out in place, not as a pair.
    pixel: (tile, x, y) => this.sheet[(Math.floor(tile / SHEET_COLUMNS) * CELL + y) * this.sheetWidth + (tile % SHEET_COLUMNS) * CELL + x],
    land: (tile, x, y) => {
      const cell = this.land.get(tile);
      if (cell === undefined) return undefined;
      const [cx, cy] = this.origin(cell);
      return this.sheet[(cy + y) * this.sheetWidth + cx + x] >>> 24 === 255;
    },
    roll: (tile) => (this.scrollBy.has(tile) ? (this.tickCount * this.scrollBy.get(tile)!) % CELL : 0),
  });
  private readonly wear = new Wear({
    pixel: (tile, x, y) => {
      const [cx, cy] = this.origin(this.cellOf(tile));
      return this.sheet[(cy + y) * this.sheetWidth + cx + x];
    },
  });
  private readonly soils = new Soils({
    pixel: (tile, x, y) => {
      const [cx, cy] = this.origin(this.cellOf(tile));
      return this.sheet[(cy + y) * this.sheetWidth + cx + x];
    },
  });
  private readonly ground = new Uint32Array(CELL * CELL);
  /** The woods, where the sheet has their pieces and they are planted (PLANTED_WOODS). */
  private readonly woods: Woods | null;

  /**
   * Every tile drawn whole on black, as the 8-bit machines drew them (the Apple ][ set): nothing beneath what stands,
   * no ground drawn from the map (shores, worn earth, the soils' edges), the land below the world as it is above.
   */
  squares = false;

  constructor(
    /** RGBA in memory order, SHEET_COLUMNS * CELL wide; grown a row at a time for cells made here (addCell). */
    private sheet: Uint32Array,
    private readonly sheetWidth: number,
    manifest: Manifest,
  ) {
    this.cells = (sheet.length / (CELL * CELL)) | 0;
    for (const [k, v] of Object.entries(manifest.scroll ?? {})) this.scrollBy.set(Number(k), v);
    for (const [k, v] of Object.entries(manifest.frames ?? {})) this.frames.set(Number(k), v);
    for (const [k, v] of Object.entries(manifest.under ?? {})) this.under.set(Number(k), v);
    for (const [k, v] of Object.entries(manifest.land ?? {})) this.land.set(Number(k), v);
    for (const [k, v] of Object.entries(manifest.below ?? {})) this.belowCells.set(Number(k), v);
    for (const [k, v] of Object.entries(manifest.variants ?? {})) this.variants.set(Number(k), v);
    for (const [k, v] of Object.entries(manifest.variantsBelow ?? {})) this.variantsBelow.set(Number(k), v);
    for (const [k, v] of Object.entries(manifest.palace ?? {})) this.palace.set(Number(k), v);
    for (const t of manifest.clock ?? []) this.clocks.add(t);
    this.pcCells = manifest.pc ?? {};
    const { oak, bush } = manifest.pieces ?? {};
    this.woods =
      PLANTED_WOODS && oak && bush
        ? new Woods({
            pixel: (cell, x, y) => {
              const [cx, cy] = this.origin(cell);
              return this.sheet[(cy + y) * this.sheetWidth + cx + x];
            },
            oak,
            bush,
          })
        : null;
    for (let c = 0; c < this.cells; c++) {
      let see = false;
      const [cx, cy] = this.origin(c);
      for (let y = 0; y < CELL && !see; y++)
        for (let x = 0; x < CELL; x++) if (sheet[(cy + y) * sheetWidth + cx + x] >>> 24 < 255) see = true;
      this.clear.push(see);
    }
  }

  /** Cells added at the sheet's end not yet used. */
  private readonly spare: number[] = [];

  /** A cell of the sheet's own for a version of a tile drawn here (the dirt edges by the water): past its end, a row added as needed. */
  private addCell(): number {
    if (!this.spare.length) {
      const row = this.sheet.length / (this.sheetWidth * CELL);
      const grown = new Uint32Array(this.sheet.length + this.sheetWidth * CELL);
      grown.set(this.sheet);
      this.sheet = grown;
      for (let c = 0; c < SHEET_COLUMNS; c++) this.spare.push(row * SHEET_COLUMNS + c);
    }
    return this.spare.shift()!;
  }

  private origin(cell: number): [number, number] {
    return [(cell % SHEET_COLUMNS) * CELL, Math.floor(cell / SHEET_COLUMNS) * CELL];
  }

  /** The set's lettering: 96 glyphs of 32 by 32 from the space on (standard-font.png, doubled by EPX), or none. */
  font: Uint8Array | null = null;

  glyph(code: number): Uint8Array | null {
    // Letters, figures and punctuation; the braces and beyond are the game's frame corners and symbols.
    if (!this.font || code < 0x20 || code > 0x7a) return null;
    return this.font.subarray((code - 0x20) * 1024, (code - 0x1f) * 1024);
  }

  rising(page: Uint32Array, tile: number, rows: number, x: number, y: number): void {
    if (tile >= this.cells) return;
    const [cx, cy] = this.origin(this.cellOf(tile));
    const shown = rows * HI; // the gate's top rows, on the art's grain
    for (let r = 0; r < shown; r++) {
      const src = (cy + r) * this.sheetWidth + cx;
      const dst = (y + CELL - shown + r) * HI_WIDTH + x;
      for (let c = 0; c < CELL; c++) {
        const v = this.sheet[src + c];
        if (v >>> 24 >= 128) page[dst + c] = v;
      }
    }
  }

  /** The runes' English: 31 glyphs of 32 by 32 for RUNES.CH's 0x41 to 0x5f (standard-runes.png, doubled by EPX), or none. */
  runes: Uint8Array | null = null;
  /** RUNES.CH at the lettering's grain. */
  readonly fineRunes = true;

  /** IBM.CH's symbols at its grain, but the border's caps (1 and 2), which the chrome draws copper. */
  /** The border's two caps (standard-caps.png, from the ultima3 port's Standard UI sheet): 32 by 32 each, side by side. */
  caps: Uint32Array | null = null;

  /** A border's cap: side 2 the one before a title (the sheet's first), 1 the one after (its second). */
  capPiece(side: number): Uint32Array | null {
    if (!this.caps) return null;
    const piece = new Uint32Array(32 * 32);
    const from = side === 2 ? 0 : 32;
    for (let y = 0; y < 32; y++) piece.set(this.caps.subarray(y * 64 + from, y * 64 + from + 32), y * 32);
    return piece;
  }

  fineSymbol(code: number): boolean {
    return code > 2 && code < 0x20;
  }

  reading(code: number): Uint8Array | null {
    if (!this.runes || code < 0x41 || code > 0x5f) return null;
    return this.runes.subarray((code - 0x41) * 1024, (code - 0x40) * 1024);
  }

  /** The animation ticks so far (a four-frame figure shows frame ticks % 4). */
  get ticks(): number {
    return this.tickCount;
  }

  /** One animation tick (with the EGA animator's): the tiles drawn from the EGA's that the animator has changed drawn again. */
  tick(): void {
    this.tickCount++;
    const from = this.derivedFrom;
    if (!from) return;
    for (const [t, was] of this.derivedBytes) {
      if (this.redrawn.has(t)) {
        this.install(t);
        continue;
      }
      for (let i = 0; i < 128; i++)
        if (from[t * 128 + i] !== was[i]) {
          this.install(t);
          break;
        }
    }
  }

  /**
   * The EGA tiles some tiles are drawn from, as the animator leaves them, and how (useDerived); each one's bytes when
   * last drawn; and those drawn again every tick whatever the animator does (the moongate's glow).
   */
  private derivedFrom: Uint8Array | null = null;
  private derive: (tiles: Uint8Array, t: number, tick: number) => Uint32Array = original;
  private readonly derivedBytes = new Map<number, Uint8Array>();
  /** The dirt edges' versions beside the water, plain grass (originals.ts WET_EDGES): the cell each is drawn in. */
  private readonly wetCells = new Map<number, number>();
  private readonly redrawn = new Set<number>();

  /**
   * The actors, the furniture and the land out in the world drawn from the original tiles (originals.ts), `tiles` the
   * game's own as the EGA animator keeps them: each put in its cell in place of the sheet's, and nothing of the sheet's
   * own animation kept for it.
   */
  useOriginals(tiles: Uint8Array): void {
    // The dirt edges beside the water, plain grass: each in a cell of its own, drawn as the edge is (install). The
    // shores on the originals' grid, a fringe of sand along the grass in the edges' place.
    for (const t of WET_EDGES) if (!this.wetCells.has(t)) this.wetCells.set(t, this.addCell());
    this.shores.style = { block: 4, sand: SHORE_SAND };
    this.useDerived(tiles, [...ORIGINALS, ...OUTDOORS, ...STRUCTURE, ...FALL_FRAMES], original, [MOONGATE]);
    // The pier lifted onto the water: the water under it, rolling between its planks and round its posts.
    this.under.set(PIER, 0x02);
    // A bridge on its own over its river, its banks either side, as the map draws it (shore.ts): the river running
    // north and south under the one, east and west under the other.
    this.under.set(0x6a, 0x60);
    this.under.set(0x6b, 0x61);
    // The roads, the worn earth and the edges between grounds drawn tile by tile, as the original tiles draw them: the
    // Standard land's dithered edges, on its grid of 32, only muddle the originals' coarser, speckled pixels.
    this.paintedEarth = false;
    // The tiles it keeps from the sheet, in their versions on the originals' grid (Manifest.pc).
    for (const [k, cell] of Object.entries(this.pcCells)) {
      const t = Number(k);
      const [cx, cy] = this.origin(cell);
      const px = new Uint32Array(CELL * CELL);
      for (let y = 0; y < CELL; y++)
        px.set(this.sheet.subarray((cy + y) * this.sheetWidth + cx, (cy + y) * this.sheetWidth + cx + CELL), y * CELL);
      for (const m of [this.frames, this.variants, this.variantsBelow, this.belowCells, this.palace, this.scrollBy]) m.delete(t);
      this.put(t, px);
    }
    // The Avatar as the player made it, if it was chosen before this set was.
    this.setAppearance(this.look, this.lady, this.figureBase);
  }

  /** The Avatar as the player made it (appearance.ts), or null; and the cells it is drawn in, by the tile they stand for. */
  private look: Appearance | null = null;
  /** The companion the figures drawn now are (Draw.dressAs), or null: drawn in their colours. */
  dressing: Dressing | null = null;
  /** Figures drawn in a companion's colours, a cell each, by the frame and the look: made when first wanted. */
  private readonly dressedCells = new Map<string, number>();

  /**
   * The cell of figure frame `tile` dressed as `dress` (avatarRegions.ts dress), from the tiles the art is drawn from;
   * none for a tile that is no figure the regions know.
   */
  private dressedOf(tile: number, who: Dressing): number | undefined {
    const tiles = this.derivedFrom;
    const base = tile & ~3;
    if (!tiles || !hasRegions(base)) return undefined;
    const { skin, hair, main, trim } = who.look;
    const key = `${tile}:${skin},${hair},${main},${trim}:${who.lady}`;
    let c = this.dressedCells.get(key);
    if (c === undefined) {
      c = this.addCell();
      this.putCell(c, dress(original(tiles, tile), indices(tiles, tile), labels(tiles, base, tile - base), who.look, who.lady));
      this.dressedCells.set(key, c);
    }
    return c;
  }
  private readonly avatarCells = new Map<number, number>();
  /**
   * Where the party's leader stands (Draw.leader): the mirror reflecting (0x9e) is drawn giving back the Avatar as
   * the player made it only on the square north of it. Anyone else before a mirror sees the original's reflection.
   */
  leader: Pick<Place, 'map' | 'x' | 'y'> | null = null;
  /** Whether the Avatar drawn as the player made it is addressed as Lady. */
  private lady = false;
  /** A figure drawn in the Avatar's place, other than the look's own (a companion at a mirror), or none. */
  private figureBase: number | undefined;
  /** A cell of its own for tile `t`'s custom drawing, the same one each time. */
  private readonly avatarSpare = new Map<number, number>();

  /**
   * The Avatar drawn as `look` - the walking Avatar's four frames, the standing Avatar (its first frame) and the
   * mirror reflecting it (the mirror's glass, the figure scaled into it), north of the party's leader - or, with null,
   * as the tiles have it; `lady`, whether the Avatar is addressed as Lady (a mage without her beard). For the Modern PC
   * tiles, whose Avatar is the original's (useOriginals).
   */
  setAppearance(look: Appearance | null, lady = this.lady, figure?: number): void {
    this.look = look;
    this.lady = lady;
    this.figureBase = figure;
    const tiles = this.derivedFrom;
    this.avatarCells.clear();
    if (!look || !tiles) return;
    const base = figure ?? FIGURES[look.figure].base;
    const frames = [0, 1, 2, 3].map((f) => dress(original(tiles, base + f), indices(tiles, base + f), labels(tiles, base, f), look, lady));
    const cell = (t: number, px: Uint32Array): void => {
      const c = this.spareFor(t);
      this.putCell(c, px);
      this.avatarCells.set(t, c);
    };
    frames.forEach((px, f) => cell(0x14c + f, px));
    cell(0x11c, frames[0]);
    cell(MIRROR_REFLECTING, this.reflecting(tiles, frames[0]));
  }

  private spareFor(t: number): number {
    let c = this.avatarSpare.get(t);
    if (c === undefined) this.avatarSpare.set(t, (c = this.addCell()));
    return c;
  }

  /** The plain mirror with `figure` (a cell, see-through round it) scaled into its glass, the glass's dark behind. */
  private reflecting(tiles: Uint8Array, figure: Uint32Array): Uint32Array {
    const out = original(tiles, MIRROR);
    const glass = mirrorGlass(tiles);
    const xs = [...glass].map((i) => i % TILE);
    const ys = [...glass].map((i) => Math.floor(i / TILE));
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    for (const i of glass) {
      const [gx, gy] = [i % TILE, Math.floor(i / TILE)];
      // The figure's pixel for this one of the glass: the glass's box stretched over the whole figure.
      const fx = Math.floor(((gx - x0) * TILE) / (x1 - x0 + 1));
      const fy = Math.floor(((gy - y0) * TILE) / (y1 - y0 + 1));
      const v = figure[fy * HI * CELL + fx * HI];
      if (v >>> 24 === 0) continue;
      for (let dy = 0; dy < HI; dy++) out.fill(v, (gy * HI + dy) * CELL + gx * HI, (gy * HI + dy) * CELL + gx * HI + HI);
    }
    return out;
  }

  /**
   * Tiles `which` drawn by `derive` from the player's own tiles (`tiles`, as the EGA animator keeps them) in place of
   * the sheet's, and again whenever the animator changes one; those in `always`, every tick.
   */
  useDerived(
    tiles: Uint8Array,
    which: Iterable<number>,
    derive: (tiles: Uint8Array, t: number, tick: number) => Uint32Array,
    always: Iterable<number> = [],
  ): void {
    this.derivedFrom = tiles;
    this.derive = derive;
    this.dressedCells.clear();
    for (const t of always) this.redrawn.add(t);
    for (const t of which) {
      if (t >= this.cells) continue;
      for (const m of [this.frames, this.variants, this.variantsBelow, this.belowCells, this.palace, this.scrollBy]) m.delete(t);
      this.clocks.delete(t);
      this.install(t);
    }
  }

  /**
   * Every tile drawn from the EGA's drawn again now, and what the map's painters worked out from them forgotten: for
   * when how they are drawn has changed (the grass page's colours).
   */
  redraw(which: Iterable<number> = [...this.derivedBytes.keys()]): void {
    for (const t of which) if (this.derivedBytes.has(t)) this.install(t);
    this.wear.forget();
    this.soils.forget();
  }

  /** Tile `t` drawn into its own cell from the EGA tiles as they are now. */
  private install(t: number): void {
    const from = this.derivedFrom!;
    this.put(t, this.derive(from, t, this.tickCount));
    const wet = this.wetCells.get(t);
    if (wet !== undefined) this.putCell(wet, original(from, t, this.tickCount, undefined, true));
    this.derivedBytes.set(t, from.slice(t * 128, t * 128 + 128));
  }

  /** Tile `t`'s own cell drawn as `px` (CELL x CELL, RGBA in memory order). */
  put(t: number, px: Uint32Array): void {
    this.putCell(t, px);
  }

  /** Cell `cell` drawn as `px` (CELL x CELL, RGBA in memory order). */
  private putCell(cell: number, px: Uint32Array): void {
    const [cx, cy] = this.origin(cell);
    for (let y = 0; y < CELL; y++) this.sheet.set(px.subarray(y * CELL, y * CELL + CELL), (cy + y) * this.sheetWidth + cx);
    this.clear[cell] = px.some((v) => v >>> 24 < 255);
    this.outlines.delete(cell * 2);
    this.outlines.delete(cell * 2 + 1);
  }

  /**
   * Whether the worn earth and the edges between grounds (swamp, sand, lava) are drawn from the map (wear.ts,
   * soils.ts), dithered on the Standard land's grid - or each square's own tile drawn whole, as Modern PC's original
   * tiles are, whose own pixels already draw the road into the grass.
   */
  paintedEarth = true;

  /** Whether the actors are drawn outlined (Settings' Outlines, for the set that has them). */
  outlined = false;

  /** Each cell's outline, worked out once: at the cell's own size, and at the party grid's half size (outlineOf). */
  private readonly outlines = new Map<number, { at: Uint32Array; on: Uint8Array }>();

  /**
   * Where cell `cell`'s outline goes, drawn `step` of the sheet's pixels to one (1 the cell's own size, 2 the party
   * grid's half size): the clear pixels within OUTLINE_WIDTH of a drawn one, diagonals too - round the figure and in
   * the gaps in it that show the ground, never over what is drawn. As a list of indices and a mask, CELL / step a side.
   */
  private outlineOf(cell: number, step = 1): { at: Uint32Array; on: Uint8Array } {
    const key = cell * 2 + (step - 1);
    let o = this.outlines.get(key);
    if (o) return o;
    const n = CELL / step;
    const [cx, cy] = this.origin(cell);
    const drawn = (x: number, y: number): boolean =>
      x >= 0 && y >= 0 && x < n && y < n && this.sheet[(cy + y * step) * this.sheetWidth + cx + x * step] >>> 24 >= 128;
    const on = new Uint8Array(n * n);
    const at: number[] = [];
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        if (drawn(x, y)) continue;
        search: for (let dy = -OUTLINE_WIDTH; dy <= OUTLINE_WIDTH; dy++)
          for (let dx = -OUTLINE_WIDTH; dx <= OUTLINE_WIDTH; dx++)
            if (drawn(x + dx, y + dy)) {
              on[y * n + x] = 1;
              at.push(y * n + x);
              break search;
            }
      }
    o = { at: Uint32Array.from(at), on };
    this.outlines.set(key, o);
    return o;
  }

  /** Whether `tile` is drawn with its outline now: an actor, the outlines on. */
  private isOutlined(tile: number): boolean {
    return this.outlined && tile >= ACTORS && tile < this.cells;
  }

  setClock(hour: number, minute: number): void {
    this.hour = hour;
    this.minute = minute;
  }

  /** Whether the square being drawn is the one north of the party's leader: the mirror he stands before. */
  private beforeLeader(): boolean {
    const [at, lead] = [this.at, this.leader];
    return !!at && !!lead && at.map === lead.map && at.x === lead.x && at.y === lead.y - 1;
  }

  /** The cell a tile shows this tick. */
  private cellOf(tile: number, who = this.dressing): number {
    const dressed = who ? this.dressedOf(tile, who) : undefined;
    if (dressed !== undefined) return dressed;
    const avatar = this.avatarCells.get(tile);
    if (avatar !== undefined && (tile !== MIRROR_REFLECTING || this.beforeLeader())) return avatar;
    const own = this.at ? this.palace.get(tile) : undefined;
    if (own && inPalace(tile, this.at!)) return own[this.tickCount % own.length];
    const wet = this.at ? this.wetCells.get(tile) : undefined;
    if (wet !== undefined && byWater(tile, this.at!.around)) return wet;
    const versions = this.at ? (this.underworld ? this.variantsBelow : this.variants).get(tile) : undefined;
    if (versions) return versions[variantOf(this.at!.x, this.at!.y, versions.length)];
    const low = this.underworld ? this.belowCells.get(tile) : undefined;
    if (low !== undefined) return low;
    const f = this.frames.get(tile);
    return f ? f[this.tickCount % f.length] : tile;
  }

  /**
   * Paint a tile into `out` (CELL x CELL), over what is already there where it is see-through; a bank on `ground`;
   * the tile itself (not what is beneath it) in `tint` (tinted), if one is given.
   */
  private paint(out: Uint32Array, tile: number, depth = 0, ground?: number, tint = 0): void {
    const beneath = this.beneath(tile);
    if (beneath !== undefined && depth < 3) this.paint(out, beneath, depth + 1);
    const land = this.land.get(tile);
    if (land !== undefined && depth < 3) this.lay(out, land, ground ?? GRASS, depth);
    this.layer(out, tile, tint);
  }

  /**
   * What lies under `tile` (Manifest.under), where it lies on the map (`at`): the pier's water is the water round it,
   * the most of its four neighbours' - the shallows by the shore, the open water further out, the shallower on a tie,
   * piers standing by the shore - so it meets them without a seam; off the map, and for every other tile, its one.
   */
  private beneath(tile: number): number | undefined {
    const own = this.under.get(tile);
    if (tile !== PIER || own === undefined || !this.at) return own;
    const count = new Map<number, number>();
    for (const i of [7, 11, 13, 17]) {
      const t = this.at.around[i];
      if (t >= 0x01 && t <= 0x03) count.set(t, (count.get(t) ?? 0) + 1);
    }
    let best = own;
    let most = 0;
    for (const [t, n] of count) if (n > most || (n === most && t > best)) [best, most] = [t, n];
    return best;
  }

  /** A tile's own cell over `out`, as it shows this tick (rolled, if it rolls), with nothing beneath it. */
  private layer(out: Uint32Array, tile: number, tint = 0): void {
    const cell = this.cellOf(tile);
    const [cx, cy] = this.origin(cell);
    const roll = this.scrollBy.has(tile) ? (this.tickCount * this.scrollBy.get(tile)!) % CELL : 0;
    const s = this.sheet;
    if (this.isOutlined(tile)) for (const i of this.outlineOf(cell).at) out[i] = OUTLINE_COLOUR;
    for (let y = 0; y < CELL; y++) {
      const sy = cy + ((y - roll + CELL) % CELL);
      for (let x = 0; x < CELL; x++) {
        const v = tint ? tinted(s[sy * this.sheetWidth + cx + x], tint) : s[sy * this.sheetWidth + cx + x];
        const a = v >>> 24;
        if (a === 255) out[y * CELL + x] = v;
        else if (a !== 0) out[y * CELL + x] = blend(out[y * CELL + x], v, a);
      }
    }
    if (this.clocks.has(tile)) this.hands(out);
  }

  /** The ground laid over `out` where the land cell is opaque (a bank's land, between its water and its mud). */
  private lay(out: Uint32Array, cell: number, ground: number, depth: number): void {
    const g = this.ground;
    g.fill(0xff000000);
    this.paint(g, ground, depth + 1);
    const [cx, cy] = this.origin(cell);
    for (let y = 0; y < CELL; y++)
      for (let x = 0; x < CELL; x++)
        if (this.sheet[(cy + y) * this.sheetWidth + cx + x] >>> 24 === 255) out[y * CELL + x] = g[y * CELL + x];
  }

  /** The clock's hands, as the EGA animator draws them from the hour and minute. */
  private hands(out: Uint32Array): void {
    const ink = 0xff202020;
    const hand = (turns: number, length: number): void => {
      const a = turns * 2 * Math.PI - Math.PI / 2;
      // In thirty-seconds of a tile, so the hands keep their place on the face whatever the cell's size; two wide.
      const k = CELL / 32;
      for (let r = 0; r <= length * k; r += 0.5) {
        const x = Math.round(16 * k + Math.cos(a) * r);
        const y = Math.round(15 * k + Math.sin(a) * r);
        for (let dy = 0; dy < k; dy++)
          for (let dx = 0; dx < k; dx++)
            if (x + dx >= 0 && x + dx < CELL && y + dy >= 0 && y + dy < CELL) out[(y + dy) * CELL + x + dx] = ink;
      }
    };
    hand((this.hour % 12) / 12 + this.minute / 720, 5);
    hand(this.minute / 60, 8);
  }

  private compose(tile: number, ground?: number, tint = 0, floor?: number): Uint32Array {
    const out = this.scratch;
    if (this.squares) {
      out.fill(0xff000000);
      this.paint(out, tile, 0, undefined, tint);
      return out;
    }
    const cell = this.cellOf(tile);
    if (this.clear[cell] || this.under.has(tile)) {
      out.fill(0xff000000);
      if (floor !== undefined && ground !== undefined && ground !== tile && !this.under.has(tile)) this.paint(out, floor);
      if (ground !== undefined && ground !== tile && !this.under.has(tile)) this.paint(out, ground);
    }
    this.paint(out, tile, 0, ground, tint);
    return out;
  }

  /** How many versions a tile is drawn in, one to a square by its place (Manifest.variants): 1 for most. */
  versions(tile: number): number {
    return this.variants.get(tile)?.length ?? 1;
  }

  /** A tile's figure as it shows this tick (32x32, memory order, see-through where clear), without a ground. */
  figure(tile: number): Uint32Array {
    const out = new Uint32Array(CELL * CELL);
    const cell = this.cellOf(tile);
    const [cx, cy] = this.origin(cell);
    for (let y = 0; y < CELL; y++)
      out.set(this.sheet.subarray((cy + y) * this.sheetWidth + cx, (cy + y) * this.sheetWidth + cx + CELL), y * CELL);
    if (this.isOutlined(tile)) for (const i of this.outlineOf(cell).at) out[i] = OUTLINE_COLOUR;
    return out;
  }

  /**
   * A square of the world map whose woods or shore are drawn from the map (woods.ts, shore.ts): its terrain, the woods
   * and the shore laid over it, and what stands on it - a figure, a bridge. Null where the square has neither, or is
   * not showing its terrain.
   */
  private fromMap(tile: number, ground: number | undefined, place: Place, tint = 0): Uint32Array | null {
    if (tile === PIER && this.under.has(PIER)) return this.pierOver(place, tint);
    const terrain = place.around[12];
    const own = tile === terrain || (FALLS.has(tile) && FALLS.has(terrain));
    if (own) {
      const standing = this.standing(tile, ground, place, tint);
      if (standing) return standing;
    }
    const over = !own;
    if (over && ground !== terrain) return null;
    let out = this.terrainFromMap(place);
    if (!out) {
      // Below the world, a place (a hut, a dungeon's mouth) stands on the land round it, darkened as the land is.
      if (place.map !== 1 || over) return null;
      out = this.scratch;
      out.fill(0xff000000);
      if (ground !== undefined) this.paint(out, ground);
      belowTheWorld(out);
      this.layer(out, tile, tint);
      return out;
    }
    if (over || BRIDGES.has(terrain)) this.layer(out, tile, tint);
    return out;
  }

  /**
   * The pier over its water as the map draws water (shore.ts): the square drawn as the water round it would be - the
   * shallows or the open water (beneath), a pier beside it water too - blended and rippling on with its neighbours,
   * and the pier laid over it. Null where the map draws nothing of that water, and the pier is composed as a tile is.
   */
  private pierOver(place: Place, tint: number): Uint32Array | null {
    const water = this.beneath(PIER);
    if (water === undefined) return null;
    const around = place.around.map((t) => (t === PIER ? water : t));
    const at = { ...place, around };
    const out = this.terrainFromMap(at, at);
    if (out) this.layer(out, PIER, tint);
    return out;
  }

  /**
   * A thing that stands on the map - a hut, a towne, a lighthouse, see-through round it - over its `ground` drawn
   * from the map as that square would be were it the ground: worn earth running on into it, the woods' edge, the
   * shore. Null where the thing hides its ground, or the ground has nothing drawn from the map.
   */
  private standing(tile: number, ground: number | undefined, place: Place, tint = 0): Uint32Array | null {
    if (ground === undefined || ground === tile || !this.clear[this.cellOf(tile)] || this.under.has(tile)) return null;
    const around = place.around.slice();
    around[12] = ground;
    // Its shore is the map's own: a place is a built edge to the water beside it, as the water's square has it.
    const out = this.terrainFromMap({ ...place, around }, place);
    if (!out) return null;
    this.layer(out, tile, tint);
    return out;
  }

  /**
   * A square's own terrain with its worn ground, its edges to other ground (soils.ts), mountains, woods and shore
   * drawn from the map (land: the art
   * direction's rule 8); below the world, the land darker and colder. Null where there is none of that to do.
   */
  private terrainFromMap(place: Place, shore = place): Uint32Array | null {
    return this.placed(place, () => this.fromMapLand(place, shore));
  }

  /** `f` done for the square at `place` (null for none): its versions chosen by its place, below the world or not. */
  private placed<T>(place: Place | null, f: () => T): T {
    const [under, at] = [this.underworld, this.at];
    this.underworld = place?.map === 1;
    this.at = place;
    try {
      return f();
    } finally {
      this.underworld = under;
      this.at = at;
    }
  }

  private fromMapLand(place: Place, shore = place): Uint32Array | null {
    const terrain = place.around[12];
    const worn = this.paintedEarth && Wear.drawn(place);
    const soiled = this.paintedEarth && Soils.drawn(place);
    const ranged = Ranges.drawn(place) && (place.map > 1 ? RANGES_CLOSE : RANGES_OVERWORLD);
    const wooded = !!this.woods && Woods.drawn(place);
    const shored = Shores.drawn(shore);
    const below = place.map === 1 && LAND.has(terrain);
    // Land drawn in versions (the hill, the wall) is chosen by its place, which only the map gives. A piece in
    // versions (the rubble) stands on its ground as any piece does, chosen by the square it is drawn for (placed).
    const varied = this.variants.has(terrain) && !this.clear[terrain];
    if (!worn && !soiled && !ranged && !wooded && !shored && !below && !varied) return null;
    const out = this.compose(terrain);
    if (worn) this.wear.draw(out, place);
    if (soiled) this.soils.draw(out, place);
    // Woods and hills plant on the ground drawn beneath them, where there is any.
    if (ranged) this.ranges.draw(out, place, worn || soiled);
    if (wooded && this.woods) this.woods.draw(out, place, worn || soiled);
    if (shored) this.shores.draw(out, shore);
    // Below the world, the land darker and colder - but lava, which gives its own light.
    if (place.map === 1 && terrain !== LAVA) belowTheWorld(out);
    return out;
  }

  draw(page: Uint32Array, tile: number, x: number, y: number, ground?: number, place?: Place, tint = 0, floor?: number): void {
    const out = this.square(tile, ground, place, tint, floor);
    if (out) for (let r = 0; r < CELL; r++) page.set(out.subarray(r * CELL, r * CELL + CELL), (y + r) * HI_WIDTH + x);
  }

  /** The square `draw` draws (CELL by CELL, RGBA in memory order), or null for a tile the art has not. */
  square(tile: number, ground?: number, place?: Place, tint = 0, floor?: number): Uint32Array | null {
    if (tile >= this.cells) return null;
    // The whole square is drawn for its place: a piece standing there (the rubble) is chosen by it as its land is.
    return this.placed(
      place ?? null,
      () => (place && !this.squares && this.fromMap(tile, ground, place, tint)) || this.compose(tile, ground, tint, floor),
    );
  }

  /**
   * The party on foot as its members, at half size in a grid of two by two (the ultima3 port's): the first four
   * figures, 1 top left, 2 top right, 3 bottom left, 4 bottom right, each in its tint (0 none), on the square's
   * `terrain` - with its woods and shore, where `place` is given - laid on `floor` where it lets it show (a hut).
   */
  party(page: Uint32Array, figures: Figure[], x: number, y: number, terrain: number, floor?: number, place?: Place): void {
    const out =
      (place && !this.squares && (this.standing(terrain, floor, place) ?? this.terrainFromMap(place))) || this.compose(terrain, floor);
    const q = CELL / 2;
    figures.slice(0, 4).forEach((f, k) => {
      if (f.tile >= this.cells) return;
      const cell = this.cellOf(f.tile, f.dress ?? null);
      const [cx, cy] = this.origin(cell);
      const [ox, oy] = [(k % 2) * q, Math.floor(k / 2) * q];
      // The outline worked out at the grid's own half size, so it is as fine there as round a whole figure.
      if (this.isOutlined(f.tile))
        for (const i of this.outlineOf(cell, 2).at) out[(oy + Math.floor(i / q)) * CELL + ox + (i % q)] = OUTLINE_COLOUR;
      for (let j = 0; j < q; j++)
        for (let i = 0; i < q; i++) {
          // Every other pixel: the figures are drawn on a grid of 32 doubled, so this is the drawing at its own grain.
          const raw = this.sheet[(cy + j * 2) * this.sheetWidth + cx + i * 2];
          const v = f.tint ? tinted(raw, f.tint) : raw;
          const a = v >>> 24;
          const o = (oy + j) * CELL + ox + i;
          if (a === 255) out[o] = v;
          else if (a !== 0) out[o] = blend(out[o], v, a);
        }
    });
    for (let r = 0; r < CELL; r++) page.set(out.subarray(r * CELL, r * CELL + CELL), (y + r) * HI_WIDTH + x);
  }

  block(page: Uint32Array, tile: number, rx: number, ry: number, x: number, y: number): void {
    if (tile >= this.cells) return;
    const cell = this.cellOf(tile);
    if (this.clear[cell] && !this.squares) {
      // A figure or a thing on a clear ground, revealed over the square as it is: its own pixels, the ground already
      // there left showing through (a summoned creature appears on the grass, not in a black square).
      const [cx, cy] = this.origin(cell);
      const edge = this.isOutlined(tile) ? this.outlineOf(cell).on : null;
      for (let r = 0; r < HI; r++)
        for (let c = 0; c < HI; c++) {
          const v = this.sheet[(cy + ry * HI + r) * this.sheetWidth + cx + rx * HI + c];
          if (v >>> 24 >= 128) page[(y + r) * HI_WIDTH + x + c] = v;
          else if (edge?.[(ry * HI + r) * CELL + rx * HI + c]) page[(y + r) * HI_WIDTH + x + c] = OUTLINE_COLOUR;
        }
      return;
    }
    const out = this.compose(tile);
    const o = ry * HI * CELL + rx * HI;
    for (let r = 0; r < HI; r++) page.set(out.subarray(o + r * CELL, o + r * CELL + HI), (y + r) * HI_WIDTH + x);
  }
}

/**
 * Whether castle square `tile` at `place` is part of Blackthorn's palace: whether the gate square of the three by two
 * it belongs to - one square below and across from it as its place in the castle says - is the palace's.
 */
export function inPalace(tile: number, place: Place): boolean {
  const k = CASTLE.indexOf(tile);
  if (k < 0) return false;
  const [dx, dy] = [1 - (k % 3), 1 - Math.floor(k / 3)];
  return place.around[(2 + dy) * 5 + 2 + dx] === PALACE_GATE;
}

/**
 * A figure's pixel all in one colour (`tint`, 0xRRGGBB), its shading kept as brightness (the ultima3 port's poisoned
 * member, drawn all green): RGBA in memory order.
 */
function tinted(v: number, tint: number): number {
  const bright = Math.max(64, v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff) / 255;
  const r = Math.round(((tint >> 16) & 0xff) * bright);
  const g = Math.round(((tint >> 8) & 0xff) * bright);
  const b = Math.round((tint & 0xff) * bright);
  return ((v & 0xff000000) | (b << 16) | (g << 8) | r) >>> 0;
}

/** `over` (alpha `a`) on `base`, both RGBA in memory order. */
function blend(base: number, over: number, a: number): number {
  const k = a / 255;
  const mix = (sh: number): number => Math.round(((over >>> sh) & 0xff) * k + ((base >>> sh) & 0xff) * (1 - k));
  return (0xff000000 | (mix(16) << 16) | (mix(8) << 8) | mix(0)) >>> 0;
}
