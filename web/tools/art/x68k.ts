/**
 * x68k.ts
 *
 * The Sharp X68k tile sheet (public/graphics/x68k-u5-tiles.png) from the Japanese Sharp X68000 release's tiles (Infinity
 * Co., Ltd., for Pony Canyon, 1990), as the Ultima Codex shows them on "Ultima V internal formats": `npm run x68k --
 * <World Tiles .png> <NPC Tiles .png>`, the wiki's two images (Ultima_V_Sharp_X68000_World_Tiles.png and
 * Ultima_V_Sharp_X68000_NPC_Tiles.png). Each image is 256 tiles of 32 by 32, sixteen to a row, in the PC's order -
 * the world's the PC's first 256 (the land, the towns' floors and walls, the things), the NPC image its last 256 (the
 * party, the people and the creatures). The sheet is the two end to end, 32 tiles to a row as the other sheets are, in
 * the X68000's eight colours; the NPC image's grey ground (128, 128, 128) is left clear, which the set's figures stand
 * on.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng, newImage, type Image } from '../png.ts';

export const TILES = 512;
export const TILE = 32;
export const SHEET_COLUMNS = 32;
/** How many tiles to a row of the wiki's images. */
const WIKI_COLUMNS = 16;
/** The NPC image's ground, left clear. */
const GROUND = [128, 128, 128];

/** The sheet: the world's 256 tiles, then the NPCs', 32 to a row; the NPCs' grey ground clear. */
export function sheet(world: Image, npc: Image): Image {
  for (const [img, name] of [
    [world, 'World Tiles'],
    [npc, 'NPC Tiles'],
  ] as const)
    if (img.width !== WIKI_COLUMNS * TILE || img.height !== WIKI_COLUMNS * TILE)
      throw new Error(`${name} is ${img.width} by ${img.height}, not ${WIKI_COLUMNS * TILE} square`);
  const out = newImage(SHEET_COLUMNS * TILE, (TILES / SHEET_COLUMNS) * TILE);
  for (let t = 0; t < TILES; t++) {
    const [img, k] = t < 256 ? [world, t] : [npc, t - 256];
    const [sx, sy] = [(k % WIKI_COLUMNS) * TILE, Math.floor(k / WIKI_COLUMNS) * TILE];
    const [dx, dy] = [(t % SHEET_COLUMNS) * TILE, Math.floor(t / SHEET_COLUMNS) * TILE];
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const i = ((sy + y) * img.width + sx + x) * 4;
        const o = ((dy + y) * out.width + dx + x) * 4;
        const [r, g, b] = [img.data[i], img.data[i + 1], img.data[i + 2]];
        const ground = t >= 256 && r === GROUND[0] && g === GROUND[1] && b === GROUND[2];
        out.data.set(ground ? [0, 0, 0, 0] : [r, g, b, 0xff], o);
      }
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [worldPath, npcPath] = process.argv.slice(2);
  if (!worldPath || !npcPath) {
    console.error('usage: npm run x68k -- <Ultima_V_Sharp_X68000_World_Tiles.png> <Ultima_V_Sharp_X68000_NPC_Tiles.png>');
    process.exit(1);
  }
  const out = new URL('../../public/graphics/x68k-u5-tiles.png', import.meta.url);
  writeFileSync(out, encodePng(sheet(decodePng(readFileSync(worldPath)), decodePng(readFileSync(npcPath)))));
  console.log(`${out.pathname}: ${TILES} tiles`);
}
