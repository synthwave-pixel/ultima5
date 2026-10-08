/**
 * animate.ts
 *
 * The EGA driver's tile effects, done on the packed tileset (two pixels a
 * byte, 128 bytes a tile) exactly as u5d graphics/animate.c does them:
 * flowing water and lava, shimmering bridges and shores, flickering
 * flames, flapping flags, and the time-of-day changes (the clock's hands,
 * the ladders). Offsets are byte offsets into TILES.16 as expanded.
 */

const MASK_BYTES = [
  0x00, 0x00, 0x0f, 0x00, 0xf0, 0x00, 0xff, 0x00, 0x00, 0x0f, 0x0f, 0x0f, 0xf0, 0x0f, 0xff, 0x0f, 0x00, 0xf0, 0x0f, 0xf0, 0xf0, 0xf0, 0xff,
  0xf0, 0x00, 0xff, 0x0f, 0xff, 0xf0, 0xff, 0xff, 0xff,
];

const rd = (t: Uint8Array, o: number): number => t[o] | (t[o + 1] << 8);
const wr = (t: Uint8Array, o: number, v: number): void => {
  t[o] = v & 0xff;
  t[o + 1] = (v >> 8) & 0xff;
};
const ror16 = (v: number, n: number): number => ((v >>> n) | (v << (16 - n))) & 0xffff;

function shiftDown(t: Uint8Array, base: number): void {
  const tail = t.slice(base + 0x78, base + 0x80);
  t.copyWithin(base + 8, base, base + 0x78);
  t.set(tail, base);
}

function swapPairs(t: Uint8Array, off: number): void {
  const a0 = rd(t, off);
  const a1 = rd(t, off + 2);
  const b0 = rd(t, off + 0x10);
  const b1 = rd(t, off + 0x12);
  wr(t, off, b0);
  wr(t, off + 2, b1);
  wr(t, off + 0x10, a0);
  wr(t, off + 0x12, a1);
}
const swapPairsPlus4 = (t: Uint8Array, off: number): void => swapPairs(t, off + 4);
const swapPairsTwice = (t: Uint8Array, off: number): void => {
  swapPairs(t, off);
  swapPairsPlus4(t, off);
};

function maskColor(t: Uint8Array, off: number, mask: number, words: number): void {
  for (let i = 0; i < words; i++) wr(t, off + i * 2, rd(t, off + i * 2) & mask);
}

function maskTile(t: Uint8Array, dst: number, src: number, words: number): void {
  for (let i = 0; i < words; i++) wr(t, dst + i * 2, rd(t, dst + i * 2) & ~rd(t, src + i * 2) & 0xffff);
}

function xorMasked(t: Uint8Array, dst: number, mask: number, noise: number, count: number): void {
  for (let i = 0; i < count; i++) t[dst + i] ^= t[noise + i] & t[mask + i];
}

function xorMaskedBlocks(t: Uint8Array, dst: number, mask: number, noise: number, blocks: number): void {
  for (let b = 0; b < blocks; b++) for (let o = 0; o < 0x80; o++) t[dst + b * 0x80 + o] ^= t[noise + o] & t[mask + b * 0x80 + o];
}

function mixTilesUsingMask(t: Uint8Array, dst: number, mask: number, src: number, blocks: number): void {
  for (let b = 0; b < blocks; b++) {
    for (let o = 0; o < 0x80; o += 2) {
      const d = dst + b * 0x80 + o;
      wr(t, d, rd(t, d) | (rd(t, mask + b * 0x80 + o) & rd(t, src + o)));
    }
  }
}

function storeSrcOrMask(t: Uint8Array, dst: number, src: number, mask: number, blocks: number): void {
  for (let b = 0; b < blocks; b++) {
    for (let o = 0; o < 0x80; o += 2) wr(t, dst + b * 0x80 + o, rd(t, src + b * 0x80 + o) | rd(t, mask + o));
  }
}

function invertWords(t: Uint8Array, off: number, words: number): void {
  for (let i = 0; i < words; i++) wr(t, off + i * 2, ~rd(t, off + i * 2) & 0xffff);
}

function maskedMergeBlock(t: Uint8Array, dst: number, src: number, noise: number): void {
  invertWords(t, src, 0x40);
  for (let i = 0; i < 0x80; i++) t[dst + i] &= t[src + i];
  invertWords(t, src, 0x40);
  for (let i = 0; i < 0x80; i++) t[dst + i] = (t[noise + i] & t[src + i]) | t[dst + i];
}

/** The tileset effects, one per animation tick; keeps the driver's noise seed. */
export class TileAnimator {
  private seed = 0x7664;

  constructor(private readonly tiles: Uint8Array) {}

  private generateMasks(): void {
    const t = this.tiles;
    let off = 0xf400;
    for (let i = 0; i < 0x20; i++) {
      this.seed = ror16((this.seed + 0x9248) & 0xffff, 3);
      this.seed = ((this.seed ^ 0x9248) + 0x11) & 0xffff;
      const b = this.seed & 0xff;
      const dx = MASK_BYTES[b >> 4] | (MASK_BYTES[(b >> 4) + 1] << 8);
      const ax = MASK_BYTES[b & 0xf] | (MASK_BYTES[(b & 0xf) + 1] << 8);
      for (const v of [ax, dx]) {
        wr(t, off, v & 0xaaaa);
        wr(t, off + 0x80, v & 0xdddd);
        wr(t, off + 0x100, v & 0xdddd & 0xcccc);
        wr(t, off + 0x180, v & 0x9999);
        off += 2;
      }
    }
  }

  /** One tick of the water, shore, flame and flag effects (u5d AnimateTileset). */
  tick(): void {
    const t = this.tiles;
    this.generateMasks();
    shiftDown(t, 0x0080);
    shiftDown(t, 0x0100);
    shiftDown(t, 0x0180);
    shiftDown(t, 0x4780);
    maskColor(t, 0x3000, 0x6666, 0x280);
    t.fill(0, 0x3500, 0x3510);
    t.fill(0, 0x3570, 0x3580);
    maskTile(t, 0x3580, 0x3d80, 0x40);
    maskColor(t, 0x3600, 0x6666, 0x100);
    mixTilesUsingMask(t, 0x3000, 0x3800, 0x0180, 16);
    maskedMergeBlock(t, 0x8400, 0x8000, 0xf580);
    maskedMergeBlock(t, 0xda00, 0x8000, 0xf480);
    maskTile(t, 0x1a00, 0x6800, 0x100);
    mixTilesUsingMask(t, 0x1a00, 0x6800, 0x0180, 4);
    storeSrcOrMask(t, 0x7200, 0x6800, 0x0180, 4);
    xorMaskedBlocks(t, 0x5800, 0x6000, 0xf500, 4);
    xorMaskedBlocks(t, 0x5e00, 0x6600, 0xf500, 4);
    xorMasked(t, 0x6f00, 0x6100, 0xf580, 0x80);
    const s = this.seed;
    if (s & 1) swapPairsTwice(t, 0x0900);
    if (s & 2) swapPairs(t, 0x0a10);
    if (s & 4) swapPairsTwice(t, 0x0a80);
    if (s & 8) swapPairsTwice(t, 0x1f00);
    if (s & 0x10) swapPairsPlus4(t, 0x9088);
    if (s & 0x20) swapPairs(t, 0x9188);
    if (s & 0x40) swapPairsPlus4(t, 0x9688);
    if (s & 1) swapPairs(t, 0x9788);
  }

  private clockBackground(off: number): void {
    const t = this.tiles;
    for (const o of [0x03, 0x0b, 0x0c, 0x13]) t[off + o] = (t[off + o] & 0xf0) | 0x04;
    t[off + 0x04] = 0x44;
    t[off + 0x14] = 0x44;
  }

  private clockHand(position: number): void {
    const rows = [0x10, 0x10, 0x10, 0x18, 0x20, 0x20, 0x20, 0x20, 0x20, 0x18, 0x10, 0x10];
    const cols = [4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3];
    const masks = [0xf0, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0xf0, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f];
    position %= 12;
    const off = 0x7d00 + rows[position] + cols[position];
    this.tiles[off] |= masks[position];
    this.tiles[off + 0x80] |= masks[position];
  }

  /** The clock tile's hands at this time (u5d AnimateTimeTileset mode 2). */
  setClock(hour: number, minute: number): void {
    this.clockBackground(0x7d10);
    this.clockBackground(0x7d90);
    this.clockHand(hour % 12);
    this.clockHand(Math.floor(minute / 5));
  }
}

/**
 * Which tile each map tile is drawn as this tick (D_b11e): waterfalls and
 * fountains cycle through four frames, some tiles flip between two, and
 * the ones at 0xEC and 0xFA only every second or fourth tick
 * (u5d 4000.c ULTIMA_44b8_AnimateTiles).
 */
export class TileCycles {
  readonly shown = Uint8Array.from({ length: 256 }, (_, i) => i);
  private tick = 0;

  step(): void {
    const s = this.shown;
    for (let i = 0xd4; i < 0xd8; i++) if (++s[i] === 0xd8) s[i] = 0xd4;
    for (let i = 0xd8; i < 0xdc; i++) if (++s[i] === 0xdc) s[i] = 0xd8;
    if (this.tick & 1) {
      for (let i = 0x80; i < 0x84; i++) s[i] ^= 1;
      for (let i = 0xec; i < 0xf0; i++) if (++s[i] === 0xf0) s[i] = 0xec;
      if (this.tick & 2) for (let i = 0xfa; i < 0xfe; i++) s[i] ^= 1;
    }
    this.tick = (this.tick + 1) & 0xff;
  }
}
