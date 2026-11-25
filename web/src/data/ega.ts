/**
 * ega.ts
 *
 * The PC's sixteen EGA colours, which every game here draws its own tiles
 * in (data/tiles.ts for Ultima V's TILES.16). Kept on their own so a
 * module that only needs the colours (worldMapView.ts) brings no reader
 * of a game's files with it.
 */

/** The 16 EGA colours as 0xRRGGBB (u5d graphics/grap_sdl.c). */
export const EGA_PALETTE = [
  0x000000, 0x0000aa, 0x00aa00, 0x00aaaa, 0xaa0000, 0xaa00aa, 0xaa5500, 0xaaaaaa, 0x555555, 0x5555ff, 0x55ff55, 0x55ffff, 0xff5555,
  0xff55ff, 0xffff55, 0xffffff,
];
