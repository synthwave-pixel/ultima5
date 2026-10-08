/**
 * pictures.ts
 *
 * The picture test page (pictures.html): every picture of the game's
 * picture files in Original (the EGA colours doubled) and Standard (the
 * restyling of ui/standardPictures.ts), side by side. The choices are
 * kept in the URL.
 */

import { gameFiles } from '../boot.ts';
import { loadResource, picture, type Picture } from '../data/images.ts';
import { GameData } from '../game/data.ts';
import { EGA_PALETTE } from '../data/tiles.ts';
import { restyle } from '../ui/standardPictures.ts';

const params = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** The picture in its EGA colours at twice its size, as Original draws it. */
function doubled(v: Picture): Uint32Array {
  const out = new Uint32Array(v.width * 2 * v.height * 2);
  const w = v.width * 2;
  for (let y = 0; y < v.height; y++) {
    for (let x = 0; x < v.width; x++) {
      const masked = v.mask && (v.mask.bits[y * v.mask.stride + (x >> 3)] & (0x80 >> (x & 7))) !== 0;
      const b = v.pixels[y * v.stride + (x >> 1)];
      const rgb = EGA_PALETTE[x & 1 ? b & 15 : b >> 4];
      const c = masked ? 0 : (0xff000000 | ((rgb & 0xff) << 16) | (rgb & 0xff00) | (rgb >> 16)) >>> 0;
      const o = y * 2 * w + x * 2;
      out[o] = out[o + 1] = out[o + w] = out[o + w + 1] = c;
    }
  }
  return out;
}

function canvasOf(px: Uint32Array, w: number, h: number, scale: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  new Uint32Array(img.data.buffer).set(px);
  ctx.putImageData(img, 0, 0);
  canvas.style.width = `${w * scale}px`;
  canvas.style.height = `${h * scale}px`;
  return canvas;
}

async function start(): Promise<void> {
  const files = await gameFiles();
  const data = new GameData(files);
  // The picture files the game knows, by its own list of resources.
  const names = data.ovl
    .strings(0x25ea, 30)
    .filter((n) => n.endsWith('.16') && n !== 'TILES.16')
    .sort();
  const file = $<HTMLSelectElement>('file');
  const show = $<HTMLSelectElement>('show');
  const size = $<HTMLSelectElement>('size');
  for (const n of ['every file', ...names]) file.append(new Option(n, n));
  for (const el of [file, show, size]) el.value = params.get(el.id) ?? el.value;
  const main = $('pictures');

  const build = (): void => {
    const q = new URLSearchParams({ file: file.value, show: show.value, size: size.value });
    if (params.has('dev')) q.set('dev', '');
    history.replaceState(null, '', `?${q.toString().replace('dev=&', 'dev&').replace(/dev=$/, 'dev')}`);
    main.textContent = '';
    const scale = Number(size.value);
    for (const name of file.value === 'every file' ? names : [file.value]) {
      const res = loadResource(files, data.ovl, name);
      const count = res[0] | (res[1] << 8);
      const kind = /^(DNG|ITEMS)/.test(name) ? 'dungeon' : 'scene';
      const h2 = document.createElement('h2');
      h2.textContent = `${name} — ${count} picture${count === 1 ? '' : 's'}, as ${kind === 'dungeon' ? 'the corridor' : 'a scene'}`;
      main.appendChild(h2);
      for (let i = 0; i < count; i++) {
        const v = picture(res, i);
        if (!v) continue;
        const fig = document.createElement('figure');
        const cap = document.createElement('figcaption');
        cap.textContent = `${i}: ${v.width} by ${v.height}${v.mask ? ', masked' : ''}`;
        const row = document.createElement('div');
        if (show.value !== 'standard') row.appendChild(canvasOf(doubled(v), v.width * 2, v.height * 2, scale));
        // A scene is the game's own in both looks; only the corridor's are the Standard look's own.
        if (show.value !== 'original')
          row.appendChild(canvasOf(kind === 'scene' ? doubled(v) : restyle(v, kind), v.width * 2, v.height * 2, scale));
        fig.append(cap, row);
        main.appendChild(fig);
      }
    }
  };
  for (const el of [file, show, size]) el.addEventListener('change', build);
  build();
}

start().catch((err: unknown) => {
  $('pictures').textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
});
