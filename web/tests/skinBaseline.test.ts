import { describe, expect, it } from 'vitest';
import { loadResource, picture } from '../src/data/images.ts';
import { DataOvl } from '../src/data/dataOvl.ts';
import { Framebuffer, HI, HI_HEIGHT, HI_WIDTH } from '../src/ui/framebuffer.ts';
import { restyle, doubled, type PictureKind } from '../src/ui/standardPictures.ts';
import { gameFiles } from './helpers.ts';

const fonts = [{ rows: new Uint8Array(128 * 8) }, { rows: new Uint8Array(128 * 8) }];

/** The colour page as the canvas is given it, hashed (FNV-1a, 32 bits). */
function hash(fb: Framebuffer): string {
  const image = { data: new Uint8ClampedArray(HI_WIDTH * HI_HEIGHT * 4), width: HI_WIDTH, height: HI_HEIGHT } as ImageData;
  fb.present(image);
  const px = new Uint32Array(image.data.buffer);
  let h = 0x811c9dc5;
  for (const v of px) {
    h ^= v;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Every piece of `name`, each in turn at (8, 8) and flipped each way, the PC way (no over) or the Modern way. */
function drawn(name: string, kind: PictureKind | null): string {
  const files = gameFiles();
  const res = loadResource(files, new DataOvl(files.get('DATA.OVL')), name);
  const fb = new Framebuffer(new Uint8Array(512 * 128), fonts);
  const hashes: string[] = [];
  for (let i = 0; ; i++) {
    const v = picture(res, i);
    if (!v) break;
    for (const flags of [0, 1, 2, 3]) {
      fb.fill(0, 0, 319, 199, 8);
      const over = kind
        ? { kind: 'rgba' as const, px: doubled(restyle(v, kind), v.width * 2, v.height * 2), width: v.width * HI, scale: HI }
        : undefined;
      fb.image(v, 8, 8, flags, over);
      hashes.push(hash(fb));
    }
  }
  return hashes.join(' ');
}

/**
 * Modern PC and PC EGA must look exactly as they did before the machine skins (docs/superpowers/plans/
 * 2026-11-13-machine-skins.md): every dungeon picture drawn as the PC (1988) look draws it, and the things and
 * creatures as the Modern look restyles them, fingerprinted. A change here is a change to those two sets (the things
 * made sharp, 2026-11-14: their snapshot taken again).
 */
describe('the dungeon pictures of Modern PC and PC EGA, unchanged', () => {
  const pc = ['DNG1.16', 'DNG2.16', 'DNG3.16', 'ITEMS.16', ...Array.from({ length: 8 }, (_, n) => `MON${n}.16`)];
  // Every piece, four ways each, through the whole framebuffer: seconds of work, longer under a full run's load.
  it('draw every piece the PC way as before', () => {
    expect(pc.map((n) => `${n} ${drawn(n, null)}`)).toMatchSnapshot();
  }, 60_000);
  it('draw every thing and creature the Modern way as before', () => {
    const modern: [string, PictureKind][] = [
      ['ITEMS.16', 'thing'],
      ...Array.from({ length: 8 }, (_, n): [string, PictureKind] => [`MON${n}.16`, 'creature']),
    ];
    expect(modern.map(([n, k]) => `${n} ${drawn(n, k)}`)).toMatchSnapshot();
  }, 60_000);
});
