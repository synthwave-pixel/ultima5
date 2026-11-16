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
import { loadSkin } from '../ui/loadArt.ts';
import { ownPiece, pieceFileOf, type Skin } from '../ui/skins.ts';
import { TILES_NAMES, type Tiles } from '../game/settings.ts';

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
  /** The sets with a skin of their own (skins.ts), each made once, when first shown. */
  const SKINNED: Tiles[] = ['pc-cga', 'apple2', 'apple2e', 'apple2c', 'x68k', 'c64'];
  const skins = new Map<Tiles, Skin | null>();
  for (const t of SKINNED) skins.set(t, await loadSkin(t));

  const build = (): void => {
    const q = new URLSearchParams({ file: file.value, show: show.value, size: size.value });
    if (params.has('dev')) q.set('dev', '');
    history.replaceState(null, '', `?${q.toString().replace('dev=&', 'dev&').replace(/dev=$/, 'dev')}`);
    main.textContent = '';
    const scale = Number(size.value);
    const skinsShown = show.value === 'skins';
    const listed = file.value === 'every file' ? names : [file.value];
    for (const name of skinsShown ? listed.filter((n) => pieceFileOf(n)) : listed) {
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
        if (skinsShown) {
          // The PC's own, then each set's, its name beside it; a piece the PC's recoloured for that set, outlined.
          const file = pieceFileOf(name)!;
          row.appendChild(canvasOf(doubled(v), v.width * 2, v.height * 2, scale));
          for (const t of SKINNED) {
            const piece = skins.get(t)?.piece(file, i);
            if (!piece) continue;
            // At its own size, drawn into twice the PC piece's (nearest), as the game draws it into the PC's place.
            const [bw, bh] = [v.width * 2, v.height * 2];
            const big = new Uint32Array(bw * bh);
            for (let y = 0; y < bh; y++)
              for (let x = 0; x < bw; x++)
                big[y * bw + x] = piece.px[Math.floor(((y + 0.5) * piece.h) / bh) * piece.w + Math.floor(((x + 0.5) * piece.w) / bw)];
            const canvas = canvasOf(big, v.width * 2, v.height * 2, scale);
            canvas.title = `${TILES_NAMES[t]}${ownPiece(t, file, i) ? '' : ", the PC's recoloured"}`;
            if (!ownPiece(t, file, i)) canvas.style.outline = '2px dashed #c86';
            row.appendChild(canvas);
          }
          fig.append(cap, row);
          main.appendChild(fig);
          continue;
        }
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
