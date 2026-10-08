/**
 * tiles.ts
 *
 * The tile test page (tiles.html): every tile in the Original set (the EGA
 * tiles, animated by the game's own animator and tile cycles) and the
 * Standard set (StandardArt), side by side, drawn through the same tile art
 * the game's framebuffer uses.
 *
 * Much of the Standard land is worked out where it lies, not drawn once per
 * tile: shores, worn earth and the edges of the soils follow the map, a
 * tile may have versions chosen by its square's place (the hill's six
 * layouts), and below the world the land has its own (grey grass and
 * stone). So after the tiles come those: each tile's versions and its
 * Underworld version, and stretches of the real map - Britannia, the
 * Underworld, towns, a fight - drawn square by square as the game draws
 * them.
 *
 * Above the tiles, the game itself at a place chosen from a list - the
 * places the Go to... cheat offers, BRIT.CBT's battle arenas and two rooms of
 * each dungeon (devStarts.ts) - in a game of its own that saves nothing, in
 * the UX and Tiles chosen on the page; a map tile clicked shows its example
 * there.
 */

import { gameFiles } from '../boot.ts';
import { lzwDecompress } from '../data/lzw.ts';
import { TILE_NAMES } from '../data/tileNames.ts';
import { TileAnimator, TileCycles } from '../ui/animate.ts';
import { EgaArt, HI_WIDTH, type TileArt } from '../ui/framebuffer.ts';
import { egaTileArt } from '../ui/egaTiles.ts';
import { loadAppleArt, loadStandardArt } from '../ui/loadArt.ts';
import { CELL, LAND, type StandardArt, variantOf } from '../ui/standardArt.ts';
import { DataOvl } from '../data/dataOvl.ts';
import { readBritannia, readLocations, readTownLevel, readUnderworld, tileAt, type TileMap } from '../data/maps.ts';
import type { GameFiles } from '../data/files.ts';
import type { Place } from '../game/io.ts';
import { ARENAS, roomsToShow } from '../game/devStarts.ts';

const params = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

async function start(): Promise<void> {
  const files = await gameFiles();
  const tiles = lzwDecompress(files.get('TILES.16'));
  const ega = new EgaArt(tiles);
  const animator = new TileAnimator(tiles);
  const cycles = new TileCycles();
  // The Standard look's sets (settings.ts Tiles): Modern PC, its actors and furniture from the game's own tiles
  // (originals.ts); Apple ][, the Apple II's colours (appleArt.ts).
  const modern = await loadStandardArt();
  modern?.useOriginals(tiles);
  const sets: Record<string, StandardArt | null> = {
    'modern-pc': modern,
    apple2: await loadAppleArt(tiles, modern),
    'pc-ega': egaTileArt(tiles, modern),
  };
  const set = $<HTMLSelectElement>('tiles');
  // Modern PC's people and creatures outlined (Settings' Outlines).
  const outlines = $<HTMLSelectElement>('outlines');
  outlines.value = params.get('outlines') === 'off' || params.get('outlines') === '0' ? 'off' : 'on';
  set.value = params.get('tiles') ?? set.value;
  // The UX, as Settings has it (PC EGA, Standard), or both side by side; `show` is its old name in the address.
  const show = $<HTMLSelectElement>('ux');
  show.value = params.get('ux') ?? params.get('show') ?? show.value;
  const ground = $<HTMLSelectElement>('ground');
  const size = $<HTMLSelectElement>('size');
  const animate = $<HTMLInputElement>('animate');
  const filter = $<HTMLInputElement>('filter');
  for (const el of [ground, size]) el.value = params.get(el.id) ?? el.value;
  filter.value = params.get('find') ?? '';
  const main = $('sets');
  const examples = findExamples(files);
  // The look the view of a place is drawn in: the page's UX (Modern where both are shown) and Tiles.
  const view = placeView(files, () => ({ ux: show.value === 'original' ? 'original' : 'standard', tiles: set.value }));

  // One scratch page the width of the colour pages, a cell high, that each tile is drawn into.
  const page = new Uint32Array(HI_WIDTH * CELL);
  // A creature is shown as one figure going through its four frames (`frames`), as the game animates it.
  type Drawn = { canvas: HTMLCanvasElement; art: TileArt; tile: number; frames?: number[] | undefined };
  const drawn: Drawn[] = [];
  let frame = 0;
  const paint = (c: Drawn): void => {
    const g = Number(ground.value);
    // At the game's pace on average: a figure moves on at every other update with even odds (frame.ts animateActors),
    // and in the Standard look on every other pass of the key-wait loop (input.ts) - a frame every two ticks of the
    // page's in the PC EGA look, every four in the Standard.
    const step = Math.floor(frame / (c.art instanceof EgaArt ? 2 : 4));
    const own = c.frames ? c.frames[step % c.frames.length] : c.tile;
    const t = own < 0x100 ? cycles.shown[own] : own;
    page.fill(0xff000000);
    // Whatever stands on a ground is shown on the chosen one, where its art lets it show: not the land itself.
    const on = g >= 0 && own !== g && !LAND.has(own) ? cycles.shown[g] : undefined;
    c.art.draw(page, t, 0, 0, on);
    const ctx = c.canvas.getContext('2d')!;
    const img = ctx.createImageData(CELL, CELL);
    const out = new Uint32Array(img.data.buffer);
    for (let y = 0; y < CELL; y++) out.set(page.subarray(y * HI_WIDTH, y * HI_WIDTH + CELL), y * CELL);
    ctx.putImageData(img, 0, 0);
  };

  const build = (): void => {
    const standard = sets[set.value];
    // Tiles is the Standard UX's, and Outlines Modern PC's, as in Settings.
    set.disabled = show.value === 'original';
    outlines.disabled = show.value === 'original' || set.value !== 'modern-pc';
    if (modern) modern.outlined = outlines.value === 'on';
    const q = new URLSearchParams({ ux: show.value, tiles: set.value, ground: ground.value, size: size.value });
    if (outlines.value === 'off') q.set('outlines', 'off');
    if (params.has('dev')) q.set('dev', '');
    if (filter.value) q.set('find', filter.value);
    // The place in the view, kept as placeView put it.
    const place = new URLSearchParams(location.search).get('place');
    if (place) q.set('place', place);
    history.replaceState(null, '', `?${q.toString().replace('dev=&', 'dev&').replace(/dev=$/, 'dev')}`);
    main.textContent = '';
    drawn.length = 0;
    const arts: TileArt[] = [];
    if (show.value !== 'standard') arts.push(ega);
    if (show.value !== 'original' && standard) arts.push(standard);
    const px = (CELL / 2) * Number(size.value);
    const f = filter.value.trim().toLowerCase();
    for (const [title, from, to] of [
      ['Map tiles', 0, 0x100],
      ['Actor tiles', 0x100, 0x200],
    ] as const) {
      const h = document.createElement('h2');
      h.textContent = title;
      main.appendChild(h);
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (let tile = from; tile < to; tile++) {
        // A creature's four frames as one (the game animates every four from 0x134 but the fields and the regalia).
        const frames = animated(tile) ? [tile, tile + 1, tile + 2, tile + 3] : undefined;
        const tiles = frames ?? [tile];
        if (frames) tile += 3;
        const name = frames ? TILE_NAMES[tiles[0]].replace(/ \d+$/, '') : TILE_NAMES[tile];
        const hit = (t: number): boolean => String(t) === f || `0x${t.toString(16)}` === f;
        if (f && !name.toLowerCase().includes(f) && !tiles.some(hit)) continue;
        const fig = document.createElement('figure');
        fig.style.setProperty('--w', `${arts.length * (px + 4)}px`);
        const row = document.createElement('div');
        for (const art of arts) {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = CELL;
          canvas.style.width = canvas.style.height = `${px}px`;
          row.appendChild(canvas);
          const c = { canvas, art, tile: tiles[0], frames };
          drawn.push(c);
          paint(c);
        }
        // A map tile opens the game beside a good example of it, in a new window, in a game of its own (never saved).
        const example = tiles[0] < 0x100 ? examples.get(tiles[0]) : undefined;
        if (example) {
          fig.style.cursor = 'pointer';
          fig.addEventListener('click', () => view.show(example, `${tiles[0]} ${name}`));
        }
        const cap = document.createElement('figcaption');
        const first = tiles[0];
        const span = frames ? `${first}-${first + 3}` : `${first}`;
        cap.innerHTML = `<b>${span}</b> ${name}`;
        cap.title = `${span} (0x${first.toString(16)}) ${name}${example ? ' - click to see it in the game' : ''}`;
        fig.append(row, cap);
        grid.appendChild(fig);
      }
      main.appendChild(grid);
    }
    if (!standard && show.value !== 'original')
      main.insertAdjacentHTML('afterbegin', '<p>No Standard sheet yet (public/graphics/standard-tiles.png).</p>');
    if (standard && show.value !== 'original' && !f) land(main, standard, files, px / (CELL / 2));
    view.look();
  };
  for (const el of [show, set, outlines, ground, size]) el.addEventListener('change', build);
  filter.addEventListener('input', build);
  build();

  // The game's animation rate: about nine ticks a second (every other DOS timer tick).
  setInterval(
    () => {
      if (!animate.checked) return;
      animator.tick();
      cycles.step();
      for (const art of Object.values(sets)) art?.tick();
      frame++;
      for (const c of drawn) paint(c);
    },
    (1000 / 18.2) * 2,
  );
}

start().catch((err: unknown) => {
  $('sets').textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
});

/** A place's name as a sentence has it: the game keeps most in capitals (IOLO'S HUT, Iolo's Hut). */
const cased = (n: string): string =>
  n === n.toUpperCase() ? n.toLowerCase().replace(/(^|[\s-])(\w)/g, (_, a: string, b: string) => a + b.toUpperCase()) : n;

/**
 * The view of a place (tiles.html #place): the list - the places, the arenas, the rooms - Next, and the game at the
 * one chosen in a frame, a game of its own that saves nothing (?peek), in the look `look` gives. `show` puts a tile's
 * example there; `look` draws it again when the page's UX or Tiles has changed. The choice is kept in the address.
 */
function placeView(
  files: GameFiles,
  look: () => { ux: string; tiles: string },
): { show: (at: string, label: string) => void; look: () => void } {
  const pick = $<HTMLSelectElement>('place-pick');
  const frame = $<HTMLIFrameElement>('place-view');
  const group = (label: string, entries: [value: string, text: string][], shown = true): HTMLOptGroupElement => {
    const g = document.createElement('optgroup');
    g.label = label;
    for (const [value, text] of entries) g.append(new Option(text, value));
    if (shown) pick.append(g);
    return g;
  };
  const locations = readLocations(new DataOvl(files.get('DATA.OVL')));
  const named = (id: number): string => cased(locations.find((l) => l.id === id)?.name ?? String(id));
  group(
    'Places',
    locations.map((l): [string, string] => [l.id > 32 ? `dungeon:${l.id - 32}` : `town:${l.id}`, cased(l.name)]),
  );
  group(
    'Battle arenas',
    ARENAS.map((a, n): [string, string] => [`arena:${n}`, a.name]),
  );
  group(
    'Dungeon rooms',
    roomsToShow(files.get('DUNGEON.DAT')).map((r): [string, string] => [
      `room:${r.dungeon}:${r.room}:${r.level}`,
      `${named(32 + r.dungeon)}: room ${r.room}, level ${r.level + 1}`,
    ]),
  );
  // A tile's example, when one is clicked: a group of its own, of that one, put in the list then.
  const tileGroup = group('Tile example', [], false);
  let at = '';
  let url = '';
  const load = (): void => {
    if (!at) {
      frame.hidden = true;
      return;
    }
    const { ux, tiles } = look();
    const next = `index.html?play&new&peek&autoscan=true&ux=${ux}&tiles=${tiles}&at=${at}`;
    frame.hidden = false;
    if (next !== url) frame.src = url = next;
  };
  const choose = (value: string): void => {
    at = value;
    const q = new URLSearchParams(location.search);
    if (value) q.set('place', value);
    else q.delete('place');
    history.replaceState(null, '', `?${q.toString()}`);
    load();
  };
  pick.addEventListener('change', () => choose(pick.value));
  // Next: the list's next entry, round to its first.
  $('place-next').addEventListener('click', () => {
    const count = pick.options.length;
    for (let i = 1; i < count; i++) {
      const o = pick.options[(pick.selectedIndex + i) % count];
      if (o.value) {
        pick.value = o.value;
        break;
      }
    }
    choose(pick.value);
  });
  const asked = params.get('place');
  if (asked && [...pick.options].some((o) => o.value === asked)) {
    pick.value = asked;
    at = asked;
  }
  return {
    show: (where, label) => {
      tileGroup.replaceChildren(new Option(label, where));
      pick.append(tileGroup);
      pick.value = where;
      choose(where);
      frame.scrollIntoView({ block: 'nearest' });
    },
    look: load,
  };
}

/** The Standard land as the game lays it down: each tile's versions and Underworld version, then real stretches. */
function land(main: HTMLElement, art: StandardArt, files: GameFiles, scale: number): void {
  const px = (CELL / 2) * scale;
  const square = (tile: number, place: Place): HTMLCanvasElement => {
    const page = new Uint32Array(HI_WIDTH * CELL);
    page.fill(0xff000000);
    art.draw(page, tile, 0, 0, LAND.has(tile) ? undefined : GRASS, place);
    return toCanvas(page, CELL, CELL, px);
  };
  const around = (tile: number): Uint8Array => new Uint8Array(25).fill(tile);

  // Versions: a tile's layouts, chosen by its square's place; and each land tile below the world.
  heading(main, "Versions: by the square's place, and below the world");
  const grid = document.createElement('div');
  grid.className = 'grid';
  for (const tile of LAND) {
    // Squares whose places choose each of its versions in turn (variantOf), where it has more than one.
    const n = art.versions(tile);
    const versions: HTMLCanvasElement[] = [];
    for (let v = 0; v < n; v++) {
      let x = 0;
      while (variantOf(x, 0, n) !== v) x++;
      versions.push(square(tile, { map: 0, x, y: 0, around: around(tile) }));
    }
    const below = square(tile, { map: 1, x: 0, y: 0, around: around(tile) });
    const fig = document.createElement('figure');
    fig.style.setProperty('--w', `${(versions.length + 1) * (px + 4)}px`);
    const row = document.createElement('div');
    row.append(...versions, below);
    const cap = document.createElement('figcaption');
    cap.innerHTML = `<b>${tile}</b> ${TILE_NAMES[tile]}${versions.length > 1 ? ` (${versions.length} versions)` : ''}, and below`;
    fig.append(row, cap);
    grid.appendChild(fig);
  }
  main.appendChild(grid);

  // In place: stretches of the real map, each square drawn as the game draws it.
  const ovl = new DataOvl(files.get('DATA.OVL'));
  const brit = readBritannia(files, ovl);
  const under = readUnderworld(files);
  const locations = readLocations(ovl);
  const town = (id: number): TileMap => readTownLevel(files, locations.find((l) => l.id === id)!, 0);
  const arena = files.get('BRIT.CBT').subarray(6 * 0x160, 6 * 0x160 + 0x160);
  const W = 16;
  const H = 10;
  const stretches: [string, number, (x: number, y: number) => number, number, number][] = [
    ['Britannia: the eastern mountains', 0, (x, y) => tileAt(brit, x & 0xff, y & 0xff), 227, 217],
    ['Britannia: a range and the fen', 0, (x, y) => tileAt(brit, x & 0xff, y & 0xff), 159, 21],
    ['Britannia: hill country', 0, (x, y) => tileAt(brit, x & 0xff, y & 0xff), 63, 169],
    ['Britannia: a lake, woods and a river', 0, (x, y) => tileAt(brit, x & 0xff, y & 0xff), 18, 57],
    ['The Underworld: mountains and hills', 1, (x, y) => tileAt(under, x & 0xff, y & 0xff), 231, 40],
    ['The Underworld: the high country', 1, (x, y) => tileAt(under, x & 0xff, y & 0xff), 90, 46],
    ['Stonegate (a town): hills', 0x100 + 29 * 16, (x, y) => tileAt(town(29), clamp(x, 31), clamp(y, 31)), 0, 0],
    ["Grendel's hut", 0x100 + 16 * 16, (x, y) => tileAt(town(16), clamp(x, 31), clamp(y, 31)), 8, 0],
    ['A fight: the mountain arena', 2, (x, y) => arena[clamp(y, 10) * 32 + clamp(x, 10)], 0, 0],
  ];
  heading(main, 'In place: stretches of the map, drawn as the game draws them');
  for (const [title, map, at, x0, y0] of stretches) {
    const w = map === 2 ? 11 : W;
    const h = map === 2 ? 11 : H;
    const page = new Uint32Array(HI_WIDTH * CELL);
    const canvas = document.createElement('canvas');
    canvas.width = w * CELL;
    canvas.height = h * CELL;
    canvas.style.width = `${w * px}px`;
    canvas.style.height = `${h * px}px`;
    const ctx = canvas.getContext('2d')!;
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const [x, y] = [x0 + i, y0 + j];
        const round = new Uint8Array(25);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) round[(dy + 2) * 5 + dx + 2] = at(x + dx, y + dy);
        const tile = at(x, y);
        page.fill(0xff000000);
        art.draw(page, tile, 0, 0, LAND.has(tile) ? undefined : GRASS, { map, x: x & 0xff, y: y & 0xff, around: round });
        ctx.drawImage(toCanvas(page, CELL, CELL, CELL), i * CELL, j * CELL);
      }
    const fig = document.createElement('figure');
    fig.style.setProperty('--w', `${w * px}px`);
    const cap = document.createElement('figcaption');
    cap.textContent = title;
    fig.append(canvas, cap);
    main.appendChild(fig);
  }
}

const GRASS = 0x05;

/** Ground the party can stand on, to be set down beside a tile (findExamples). */
const WALK = new Set([
  0x05, 0x06, 0x07, 0x08, 0x09, 0x0b, 0x0e, 0x0f, 0x1e, 0x1f, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x2c, 0x2d, 0x30, 0x31, 0x32, 0x33,
  0x40, 0x44, 0x45, 0x48, 0x49, 0xe3,
]);

/**
 * Where each map tile is best seen in the game, as the game's ?at takes it (main.ts): of every place it lies on
 * Britannia, the Underworld and each level of each settlement, the one with most of its kind round it, and the party
 * set down on ground beside it (or on it, where there is none). A tile only ever shown as another's frame (a fountain's,
 * a clock's) is found as that one.
 */
function findExamples(files: GameFiles): Map<number, string> {
  const ovl = new DataOvl(files.get('DATA.OVL'));
  type Grid = { at: (x: number, y: number) => number; size: number; wrap: boolean; name: (x: number, y: number) => string };
  const maps: Grid[] = [];
  const brit = readBritannia(files, ovl);
  const under = readUnderworld(files);
  maps.push({ at: (x, y) => tileAt(brit, x & 0xff, y & 0xff), size: 256, wrap: true, name: (x, y) => `world:${x},${y}` });
  maps.push({ at: (x, y) => tileAt(under, x & 0xff, y & 0xff), size: 256, wrap: true, name: (x, y) => `under:${x},${y}` });
  for (const loc of readLocations(ovl)) {
    if (!loc.file) continue;
    for (const level of loc.levels ?? [0]) {
      let m: TileMap;
      try {
        m = readTownLevel(files, loc, level);
      } catch {
        continue;
      }
      maps.push({
        at: (x, y) => tileAt(m, clamp(x, 31), clamp(y, 31)),
        size: 32,
        wrap: false,
        name: (x, y) => `town:${loc.id}:${x},${y}:${level}`,
      });
    }
  }
  const best = new Map<number, [score: number, where: string]>();
  for (const map of maps)
    for (let y = 0; y < map.size; y++)
      for (let x = 0; x < map.size; x++) {
        const t = map.at(x, y);
        let score = 0;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const [nx, ny] = [x + dx, y + dy];
            // Beyond a settlement's edge is nothing, not more of the edge.
            if (!map.wrap && (nx < 0 || ny < 0 || nx >= map.size || ny >= map.size)) continue;
            if (map.at(nx, ny) === t) score++;
          }
        if ((best.get(t)?.[0] ?? -1) >= score) continue;
        // Beside it: the first ground found, the sides before the corners; else on it.
        let stand: [number, number] = [x, y];
        for (const [dx, dy] of [
          [0, 1],
          [1, 0],
          [-1, 0],
          [0, -1],
          [1, 1],
          [-1, 1],
          [1, -1],
          [-1, -1],
        ]) {
          const [nx, ny] = [x + dx, y + dy];
          if (!map.wrap && (nx < 0 || ny < 0 || nx >= map.size || ny >= map.size)) continue;
          if (WALK.has(map.at(nx, ny))) {
            stand = [map.wrap ? nx & 0xff : nx, map.wrap ? ny & 0xff : ny];
            break;
          }
        }
        best.set(t, [score, map.name(...stand)]);
      }
  const out = new Map<number, string>();
  for (let t = 0; t < 0x100; t++) {
    const found = best.get(t) ?? best.get(t & ~1) ?? best.get(t & ~3);
    if (found) out.set(t, found[1]);
  }
  return out;
}

/** Whether actor tile `t` begins a creature the game animates through four frames (frame.ts animateActors). */
function animated(t: number): boolean {
  const base = t - 0x100;
  return t >= 0x100 && (base & 3) === 0 && base > 0x33 && base !== 0xe8 && base !== 0xb4;
}
const clamp = (v: number, hi: number): number => Math.max(0, Math.min(hi, v));

function heading(main: HTMLElement, text: string): void {
  const h = document.createElement('h2');
  h.textContent = text;
  main.appendChild(h);
}

/** A cell-high strip of a colour page (HI_WIDTH wide), its first `w` x `h` pixels, as a canvas `px` wide on screen. */
function toCanvas(page: Uint32Array, w: number, h: number, px: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = canvas.style.height = `${px}px`;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const out = new Uint32Array(img.data.buffer);
  for (let y = 0; y < h; y++) out.set(page.subarray(y * HI_WIDTH, y * HI_WIDTH + w), y * w);
  ctx.putImageData(img, 0, 0);
  return canvas;
}
