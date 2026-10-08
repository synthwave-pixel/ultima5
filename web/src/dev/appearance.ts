/**
 * appearance.ts
 *
 * The appearance page (appearance.html): the Avatar's figures, skins, hair and clothes' hues (appearance.ts) for
 * checking by eye. Each figure's regions as avatarRegions.ts labels them (over the original, in flat test colours);
 * every figure in each skin, each hair colour and each hue of its main clothes and its trim; the people of Sosaria's
 * skin (PEOPLE_RULES, in the Modern PC tiles); and the Avatar walking as the five choices make it, as the game draws it.
 */

import { gameFiles } from '../boot.ts';
import { lzwDecompress } from '../data/lzw.ts';
import { DEFAULT_APPEARANCE, FIGURES, HAIR, HUES, PEOPLE_SKIN, randomAppearance, SKIN, type Appearance } from '../game/appearance.ts';
import { HI_WIDTH } from '../ui/framebuffer.ts';
import { loadStandardArt } from '../ui/loadArt.ts';
import { dress, labels, type Region } from '../ui/avatarRegions.ts';
import { indices, original, PEOPLE_RULES } from '../ui/originals.ts';
import { CELL } from '../ui/standardArt.ts';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** The regions' test colours. */
const TEST: Partial<Record<Region, string>> = { s: '#f0f', h: '#0ff', m: '#ff0', t: '#fff' };
/** A cell is drawn CELL pixels across and shown at this many times that. */
const SCALE = 2;
/** The EGA pixel's size in a cell (CELL is sixteen of them). */
const BLOCK = CELL / 16;

const hueName = (i: number): string => {
  const h = HUES[i];
  return h === null ? 'as drawn' : typeof h === 'string' ? h : `${h}°`;
};

async function start(): Promise<void> {
  const files = await gameFiles();
  const tiles = lzwDecompress(files.get('TILES.16'));
  const art = await loadStandardArt();
  const main = $('page');
  if (!art) {
    main.textContent = 'No Standard sheet (public/graphics/standard-tiles.png).';
    return;
  }
  art.useOriginals(tiles);
  art.outlined = true;
  main.textContent = '';

  /** A canvas of one cell, shown at SCALE, in `parent` with a caption. Its context is returned. */
  const cell = (parent: HTMLElement, caption: string): CanvasRenderingContext2D => {
    const fig = document.createElement('figure');
    const canvas = document.createElement('canvas');
    canvas.width = CELL;
    canvas.height = CELL;
    canvas.style.width = `${CELL * SCALE}px`;
    canvas.style.height = `${CELL * SCALE}px`;
    canvas.style.background = '#2a3a24';
    const cap = document.createElement('figcaption');
    cap.textContent = caption;
    fig.append(canvas, cap);
    parent.appendChild(fig);
    return canvas.getContext('2d')!;
  };
  const section = (title: string): void => {
    const h = document.createElement('h2');
    h.textContent = title;
    main.appendChild(h);
  };
  const row = (title: string): HTMLElement => {
    const div = document.createElement('div');
    div.className = 'row';
    const h = document.createElement('h3');
    h.textContent = title;
    div.appendChild(h);
    main.appendChild(div);
    return div;
  };
  /** RGBA (memory order) cell `px`, over what the context has, at (0, 0). */
  const put = (ctx: CanvasRenderingContext2D, px: Uint32Array): void => {
    const scratch = document.createElement('canvas');
    scratch.width = CELL;
    scratch.height = CELL;
    scratch.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px.slice().buffer), CELL, CELL), 0, 0);
    ctx.drawImage(scratch, 0, 0);
  };
  /** Figure `f` in frame 0 as `look`: the original dressed through its regions. */
  const dressed = (f: number, look: Appearance): Uint32Array => {
    const base = FIGURES[f].base;
    return dress(original(tiles, base), indices(tiles, base), labels(tiles, base, 0), look);
  };

  // Regions: each figure's four frames, the original with its labelled pixels covered in their test colours.
  section('Regions');
  FIGURES.forEach(({ name, base }) => {
    const r = row(`${name} (${base.toString(16)})`);
    for (let frame = 0; frame < 4; frame++) {
      const ctx = cell(r, `frame ${frame}`);
      put(ctx, original(tiles, base + frame));
      const regions = labels(tiles, base, frame);
      ctx.globalAlpha = 0.6;
      regions.forEach((region, i) => {
        const colour = TEST[region];
        if (!colour) return;
        ctx.fillStyle = colour;
        ctx.fillRect((i % 16) * BLOCK, Math.floor(i / 16) * BLOCK, BLOCK, BLOCK);
      });
      ctx.globalAlpha = 1;
    }
  });

  // People: each figure of the townsfolk (originals.ts's PEOPLE_RULES), the pixels painted in the people's skin covered in
  // the test colour.
  section('People');
  const ramp = SKIN[PEOPLE_SKIN].map((c) => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0);
  for (const base of PEOPLE_RULES.keys()) {
    const r = row(`${base.toString(16)}`);
    // The Avatar standing is one tile, the three after it being others.
    for (let frame = 0; frame < (base === 0x11c ? 1 : 4); frame++) {
      const ctx = cell(r, `frame ${frame}`);
      const px = original(tiles, base + frame);
      put(ctx, px);
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = TEST.s!;
      for (let i = 0; i < 256; i++)
        if (ramp.includes(px[(Math.floor(i / 16) * BLOCK + 1) * CELL + (i % 16) * BLOCK + 1]))
          ctx.fillRect((i % 16) * BLOCK, Math.floor(i / 16) * BLOCK, BLOCK, BLOCK);
      ctx.globalAlpha = 1;
    }
  }

  // Skins, hair and hues: every figure, frame 0, one choice changed from the default.
  section('Skins');
  FIGURES.forEach(({ name }, f) => {
    const r = row(name);
    SKIN.forEach((_, s) => put(cell(r, `skin ${s + 1}`), dressed(f, { ...DEFAULT_APPEARANCE, skin: s })));
  });
  section('Hair');
  FIGURES.forEach(({ name }, f) => {
    const r = row(name);
    HAIR.forEach((h, k) => put(cell(r, h.name), dressed(f, { ...DEFAULT_APPEARANCE, hair: k })));
  });
  section('Hues: the main clothes, then the trim (the other as drawn)');
  for (const part of ['main', 'trim'] as const)
    FIGURES.forEach(({ name }, f) => {
      const r = row(`${name}: ${part}`);
      HUES.forEach((_, k) => put(cell(r, hueName(k)), dressed(f, { ...DEFAULT_APPEARANCE, [part]: k })));
    });

  // Live: the Avatar walking as chosen.
  section('Live');
  const live = document.createElement('div');
  live.id = 'live';
  main.appendChild(live);
  const look: Appearance = { ...DEFAULT_APPEARANCE };
  const selects = new Map<keyof Appearance, HTMLSelectElement>();
  const choices: [keyof Appearance, string, string[]][] = [
    ['figure', 'Figure', FIGURES.map((f) => f.name)],
    ['skin', 'Skin', SKIN.map((_, i) => String(i + 1))],
    ['hair', 'Hair', HAIR.map((h) => h.name)],
    ['main', 'Clothes', HUES.map((_, i) => hueName(i))],
    ['trim', 'Trim', HUES.map((_, i) => hueName(i))],
  ];
  for (const [key, label, options] of choices) {
    const div = document.createElement('div');
    const l = document.createElement('label');
    l.textContent = label;
    const select = document.createElement('select');
    options.forEach((text, i) => select.add(new Option(text, String(i))));
    select.value = String(look[key]);
    select.addEventListener('change', () => {
      look[key] = Number(select.value);
      art.setAppearance(look);
      paint();
    });
    l.htmlFor = `pick-${key}`;
    select.id = `pick-${key}`;
    div.append(l, select);
    live.appendChild(div);
    selects.set(key, select);
  }
  const surprise = document.createElement('button');
  surprise.textContent = 'Surprise me';
  surprise.addEventListener('click', () => {
    Object.assign(
      look,
      randomAppearance((lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1))),
    );
    for (const [key, select] of selects) select.value = String(look[key]);
    art.setAppearance(look);
    paint();
  });
  live.appendChild(surprise);
  const walker = document.createElement('canvas');
  walker.width = CELL;
  walker.height = CELL;
  walker.style.width = `${CELL * 3}px`;
  walker.style.height = `${CELL * 3}px`;
  live.appendChild(walker);

  const page = new Uint32Array(HI_WIDTH * CELL);
  let frame = 0;
  const paint = (): void => {
    page.fill(0xff000000);
    art.draw(page, 0x14c + frame, 0, 0, 0x05);
    const ctx = walker.getContext('2d')!;
    const img = ctx.createImageData(CELL, CELL);
    const out = new Uint32Array(img.data.buffer);
    for (let y = 0; y < CELL; y++) out.set(page.subarray(y * HI_WIDTH, y * HI_WIDTH + CELL), y * CELL);
    ctx.putImageData(img, 0, 0);
  };
  art.setAppearance(look);
  paint();
  setInterval(() => {
    frame = (frame + 1) & 3;
    paint();
  }, 440);
}

start().catch((err: unknown) => {
  $('page').textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
});
