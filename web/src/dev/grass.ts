/**
 * grass.ts
 *
 * The grass page (grass.html): Modern PC's grass, its two colours - the ground between the blades and the blades
 * (originals.ts GRASS) - set by hue, saturation and value, and everything the grass is in drawn again as they change:
 * the tiles with grass in them, what stands on it out in the world, a few figures, and stretches of Britannia as the
 * game draws them (the roads, the edges between grounds and the shores drawn from the map take their grass from the
 * grass tile). The colours are kept in the URL.
 */

import { gameFiles } from '../boot.ts';
import { DataOvl } from '../data/dataOvl.ts';
import { lzwDecompress } from '../data/lzw.ts';
import { readBritannia, readUnderworld, tileAt } from '../data/maps.ts';
import { TILE_NAMES } from '../data/tileNames.ts';
import type { Place } from '../game/io.ts';
import { TileAnimator, TileCycles } from '../ui/animate.ts';
import { HI_WIDTH } from '../ui/framebuffer.ts';
import { loadStandardArt } from '../ui/loadArt.ts';
import { GRASS, GRASS_DEFAULT, grassIn, ORIGINALS, OUTDOORS } from '../ui/originals.ts';
import { CELL, LAND } from '../ui/standardArt.ts';

const params = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

type HSV = [h: number, s: number, v: number];

/** 0xRRGGBB from hue (0-360), saturation and value (0-100). */
function rgbOf([h, s, v]: HSV): number {
  const [S, V] = [s / 100, v / 100];
  const f = (n: number): number => {
    const k = (n + h / 60) % 6;
    return Math.round((V - V * S * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return (f(5) << 16) | (f(3) << 8) | f(1);
}

/** Hue (0-360), saturation and value (0-100) from 0xRRGGBB. */
function hsvOf(c: number): HSV {
  const [r, g, b] = [(c >> 16) / 255, ((c >> 8) & 0xff) / 255, (c & 0xff) / 255];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round((((h * 60) % 360) + 360) % 360), Math.round(max ? (d / max) * 100 : 0), Math.round(max * 100)];
}

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** An HSV from the URL (h,s,v), or `otherwise`. */
function fromUrl(name: string, otherwise: HSV): HSV {
  const v = (params.get(name) ?? '').split(',').map(Number);
  return v.length === 3 && v.every((n) => Number.isFinite(n)) ? (v as HSV) : otherwise;
}

async function start(): Promise<void> {
  const files = await gameFiles();
  const tiles = lzwDecompress(files.get('TILES.16'));
  const animator = new TileAnimator(tiles);
  const cycles = new TileCycles();
  const art = await loadStandardArt();
  if (!art) {
    $('tiles').textContent = 'No Standard sheet (public/graphics/standard-tiles.png).';
    return;
  }
  art.useOriginals(tiles);
  art.outlined = true;

  // The two colours, each three sliders.
  const colours = { ground: fromUrl('ground', hsvOf(GRASS_DEFAULT.ground)), blade: fromUrl('blade', hsvOf(GRASS_DEFAULT.blade)) };
  type Control = { inputs: HTMLInputElement[]; outputs: HTMLOutputElement[]; swatch: HTMLElement; hex: HTMLElement };
  const controls = new Map<'ground' | 'blade', Control>();
  for (const [key, title] of [
    ['ground', 'Grass ground'],
    ['blade', 'Grass blades'],
  ] as const) {
    const box = $(key);
    const h3 = document.createElement('h3');
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    const code = document.createElement('span');
    code.className = 'hex';
    h3.append(title, swatch, code);
    box.appendChild(h3);
    const inputs: HTMLInputElement[] = [];
    const outputs: HTMLOutputElement[] = [];
    (['Hue', 'Saturation', 'Value'] as const).forEach((label, k) => {
      const l = document.createElement('label');
      l.textContent = label;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = k === 0 ? '360' : '100';
      input.value = String(colours[key][k]);
      const out = document.createElement('output');
      input.addEventListener('input', () => {
        colours[key][k] = Number(input.value);
        changed();
      });
      box.append(l, input, out);
      inputs.push(input);
      outputs.push(out);
    });
    controls.set(key, { inputs, outputs, swatch, hex: code });
  }

  const size = $<HTMLSelectElement>('size');
  size.value = params.get('size') ?? size.value;
  const animate = $<HTMLInputElement>('animate');
  const main = $('tiles');

  // What to show: the tiles with grass in them; what stands on the grass out in the world (the places and things
  // Britannia's map has, drawn from the originals); a few figures; and stretches of the map.
  const ovl = new DataOvl(files.get('DATA.OVL'));
  const brit = readBritannia(files, ovl);
  const onBritannia = new Set(brit.tiles);
  const withGrass = [...OUTDOORS].filter((t) => grassIn(tiles, t) > 0).sort((a, b) => a - b);
  const standing = [...ORIGINALS].filter((t) => t < 0x100 && onBritannia.has(t)).sort((a, b) => a - b);
  const figures = [0x14c, 0x148, 0x144, 0x140, 0x110, 0x1c0, 0x1d8, 0x1a0];
  // Stretches of the map: [title, below the world, x, y]. Below the world the land is drawn darker and colder.
  const under = readUnderworld(files);
  const stretches: [string, boolean, number, number][] = [
    ['Britain and its lake', false, 70, 98],
    ['A wood, a road and a river', false, 18, 57],
    ['Hill country', false, 63, 169],
    ['The Underworld: grass, shrub and swamp', true, 16, 88],
    ['The Underworld: the high country', true, 90, 46],
  ];

  // Each view: a canvas and how to draw it.
  const page = new Uint32Array(HI_WIDTH * CELL);
  // Each view, and whether it moves with the ticks (the stretches of the map are drawn again only as the colours change).
  const views: { canvas: HTMLCanvasElement; paint: (ctx: CanvasRenderingContext2D) => void; moves: boolean }[] = [];
  const square = (tile: number, ground: number | undefined, place?: Place): Uint32Array => {
    page.fill(0xff000000);
    art.draw(page, tile, 0, 0, ground, place);
    return page;
  };
  const blit = (ctx: CanvasRenderingContext2D, dx: number, dy: number): void => {
    const img = ctx.createImageData(CELL, CELL);
    const out = new Uint32Array(img.data.buffer);
    for (let y = 0; y < CELL; y++) out.set(page.subarray(y * HI_WIDTH, y * HI_WIDTH + CELL), y * CELL);
    ctx.putImageData(img, dx, dy);
  };
  const figure = (
    grid: HTMLElement,
    w: number,
    h: number,
    caption: string,
    paint: (ctx: CanvasRenderingContext2D) => void,
    moves = true,
  ): void => {
    const px = (CELL / 2) * Number(size.value);
    const fig = document.createElement('figure');
    fig.style.setProperty('--w', `${w * px}px`);
    const canvas = document.createElement('canvas');
    canvas.width = w * CELL;
    canvas.height = h * CELL;
    canvas.style.width = `${w * px}px`;
    canvas.style.height = `${h * px}px`;
    const cap = document.createElement('figcaption');
    cap.innerHTML = caption;
    fig.append(canvas, cap);
    grid.appendChild(fig);
    views.push({ canvas, paint, moves });
  };
  const section = (title: string): HTMLElement => {
    const h = document.createElement('h2');
    h.textContent = title;
    main.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'grid';
    main.appendChild(grid);
    return grid;
  };

  const build = (): void => {
    main.textContent = '';
    views.length = 0;
    let grid = section(`The grass, and the ground drawn with grass in it (${withGrass.length})`);
    for (const t of withGrass)
      figure(grid, 1, 1, `<b>${t}</b> ${TILE_NAMES[t]}`, (ctx) => {
        square(cycles.shown[t], undefined);
        blit(ctx, 0, 0);
      });
    grid = section(`Standing on the grass out in the world (${standing.length})`);
    for (const t of standing)
      figure(grid, 1, 1, `<b>${t}</b> ${TILE_NAMES[t]}`, (ctx) => {
        square(cycles.shown[t], LAND.has(t) ? undefined : 0x05);
        blit(ctx, 0, 0);
      });
    grid = section('Figures on the grass');
    for (const t of figures)
      figure(grid, 1, 1, `<b>${t}</b> ${TILE_NAMES[t]}`, (ctx) => {
        square(t + (art.ticks & 3), 0x05);
        blit(ctx, 0, 0);
      });
    grid = section('In place: stretches of Britannia and the Underworld, drawn as the game draws them');
    for (const [title, below, x0, y0] of stretches) {
      const map = below ? under : brit;
      const [W, H] = [12, 8];
      figure(
        grid,
        W,
        H,
        title,
        (ctx) => {
          for (let j = 0; j < H; j++)
            for (let i = 0; i < W; i++) {
              const [x, y] = [(x0 + i) & 0xff, (y0 + j) & 0xff];
              const around = new Uint8Array(25);
              for (let dy = -2; dy <= 2; dy++)
                for (let dx = -2; dx <= 2; dx++) around[(dy + 2) * 5 + dx + 2] = tileAt(map, (x + dx) & 0xff, (y + dy) & 0xff);
              const t = around[12];
              square(t, LAND.has(t) ? undefined : 0x05, { map: below ? 1 : 0, x, y, around });
              blit(ctx, i * CELL, j * CELL);
            }
        },
        false,
      );
    }
    paint();
  };

  const paint = (all = true): void => {
    for (const v of views) if (all || v.moves) v.paint(v.canvas.getContext('2d')!);
  };

  /** The colours as the sliders have them: the grass drawn again in them, the readouts and the address kept up. */
  let pending = false;
  const changed = (): void => {
    for (const key of ['ground', 'blade'] as const) {
      const c = rgbOf(colours[key]);
      GRASS[key] = c;
      const k = controls.get(key)!;
      k.swatch.style.background = hex(c);
      k.hex.textContent = hex(c);
      colours[key].forEach((v, i) => {
        k.inputs[i].value = String(v);
        k.outputs[i].textContent = String(v);
      });
    }
    const q = new URLSearchParams({ ground: colours.ground.join(','), blade: colours.blade.join(','), size: size.value });
    if (params.has('dev')) q.set('dev', '');
    history.replaceState(null, '', `?${q.toString().replace(/%2C/g, ',').replace('dev=&', 'dev&').replace(/dev=$/, 'dev')}`);
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      art.redraw(OUTDOORS);
      paint();
    });
  };

  $('reset').addEventListener('click', () => {
    colours.ground = hsvOf(GRASS_DEFAULT.ground);
    colours.blade = hsvOf(GRASS_DEFAULT.blade);
    changed();
  });
  $('copy').addEventListener('click', () => {
    const line = (name: string, c: HSV): string => `${name} ${hex(rgbOf(c))} (H ${c[0]}, S ${c[1]}, V ${c[2]})`;
    const text = `Grass ${line('ground', colours.ground)}; ${line('blades', colours.blade)}`;
    $('copied').textContent = text;
    void navigator.clipboard?.writeText(text).catch(() => {});
  });
  size.addEventListener('change', () => {
    build();
    changed();
  });

  build();
  changed();

  // The game's animation rate: about nine ticks a second (every other DOS timer tick).
  setInterval(
    () => {
      if (!animate.checked) return;
      animator.tick();
      cycles.step();
      art.tick();
      paint(false);
    },
    (1000 / 18.2) * 2,
  );
}

start().catch((err: unknown) => {
  $('tiles').textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
});
