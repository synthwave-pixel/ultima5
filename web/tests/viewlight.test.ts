import { describe, expect, it } from 'vitest';
import { Framebuffer, HI, HI_WIDTH } from '../src/ui/framebuffer';

const fonts = [{ rows: new Uint8Array(128 * 8) }, { rows: new Uint8Array(128 * 8) }];

/** What gives a light of its own (framebuffer.ts emit, shine): left in the dark, all else put out. */
describe('what gives light in the view', () => {
  const view = (): { fb: Framebuffer; at: (page: number, x: number, y: number) => number } => {
    const fb = new Framebuffer(new Uint8Array(512 * 128), fonts);
    fb.page = 1;
    fb.fill(0x10, 0xe, 0xaf, 0xb2, 7); // the view, light grey
    fb.emit(true);
    fb.fill(0x58, 0x50, 0x68, 0x60, 12); // a light of its own in the middle
    fb.emit(false);
    fb.plot(0x60, 0x70, 9); // a drip: no light of its own
    fb.page = 0;
    return { fb, at: (page, x, y) => fb.hi[page][(y * HI + 1) * HI_WIDTH + x * HI + 1] };
  };

  it('in the dark, keeps a light of its own alone, the rest black', () => {
    const { fb, at } = view();
    const light = at(1, 0x60, 0x58);
    fb.page = 1;
    fb.darkenUnlit(0x10, 0xe, 0xaf, 0xb2);
    expect(at(1, 0x60, 0x58)).toBe(light);
    expect(at(1, 0x60, 0x70)).toBe(0xff000000);
    expect(at(1, 0x40, 0x60)).toBe(0xff000000);
  });

  it('gives no light once drawn over, and none drawn after emit(false)', () => {
    const { fb, at } = view();
    fb.page = 1;
    fb.fill(0x58, 0x50, 0x68, 0x60, 7);
    fb.plot(0x70, 0x70, 12);
    fb.darkenUnlit(0x10, 0xe, 0xaf, 0xb2);
    expect(at(1, 0x60, 0x58)).toBe(0xff000000);
    expect(at(1, 0x70, 0x70)).toBe(0xff000000);
  });
});

describe("a sign's letters, carved", () => {
  it('are put out in the dark with the wall they are cut in', () => {
    const fb = new Framebuffer(new Uint8Array(512 * 128), fonts);
    fb.letterMask = (_face, _text, side = 32) => new Uint8Array(side * side).fill(1);
    fb.page = 1;
    fb.fill(0x10, 0xe, 0xaf, 0xb2, 7);
    const grey = fb.hi[1][0x20 * HI * HI_WIDTH + 0x20 * HI];
    expect(fb.carveSign('A', 11, 11, 'here', false)).toBe(true);
    const view = (): number[] => {
      const out: number[] = [];
      for (let y = 0xe * HI; y < 0xb3 * HI; y++) for (let x = 0x10 * HI; x < 0xb0 * HI; x++) out.push(fb.hi[1][y * HI_WIDTH + x]);
      return out;
    };
    expect(view().filter((v) => v !== grey).length).toBeGreaterThan(100);
    fb.darkenUnlit(0x10, 0xe, 0xaf, 0xb2);
    expect(view().every((v) => v === 0xff000000)).toBe(true);
  });
});

describe("a dungeon sign's look in play", () => {
  it("is grooved in the runes' red into a bolted plate", () => {
    const fb = new Framebuffer(new Uint8Array(512 * 128), fonts);
    expect([fb.carve, fb.signPlate, fb.signScale]).toEqual(['groove', true, 1.5]);
  });
});

describe('the view sliding away as the party falls (viewSlide)', () => {
  it('shows the view as it was, slid up by the part asked, black below, and lets it go at the end', () => {
    const fb = new Framebuffer(new Uint8Array(512 * 128), fonts);
    fb.fill(8, 8, 0xb7, 0x5f, 7); // the view's top half light grey
    fb.fill(8, 0x60, 0xb7, 0xb7, 1); // its bottom half blue
    const at = (x: number, y: number): number => fb.hi[0][y * HI * HI_WIDTH + x * HI];
    const [grey, blue] = [at(0x40, 0x20), at(0x40, 0x90)];
    fb.viewSlide(8, 8, 0xb7, 0xb7, 0);
    expect([at(0x40, 0x20), at(0x40, 0x90)]).toEqual([grey, blue]);
    fb.viewSlide(8, 8, 0xb7, 0xb7, 0.5); // half way: the blue half at the top, black beneath
    expect([at(0x40, 0x20), at(0x40, 0x90)]).toEqual([blue, 0xff000000]);
    fb.viewSlide(8, 8, 0xb7, 0xb7, 1);
    expect(at(0x40, 0x20)).toBe(0xff000000);
    expect(at(4, 4)).not.toBe(0xff000000 + 1); // outside the box untouched (the frame)
    fb.viewSlide(8, 8, 0xb7, 0xb7, null);
    fb.fill(8, 8, 0xb7, 0xb7, 7);
    fb.viewSlide(8, 8, 0xb7, 0xb7, 0); // a new fall takes the view as it is now
    expect(at(0x40, 0x90)).toBe(grey);
  });
});

describe("a sign's grain", () => {
  it("cuts its letters and its plate in squares of two pixels, the corridor pictures' grain, on one grid", () => {
    const fb = new Framebuffer(new Uint8Array(512 * 128), fonts);
    const letter = new Uint8Array(24 * 24);
    for (let y = 4; y < 20; y++) for (let x = 6; x < 18; x++) letter[y * 24 + x] = 1; // a block, cut at 12 squares
    fb.letterMask = (_face, _text, side = 32) => {
      const m = new Uint8Array(side * side);
      for (let y = 0; y < side; y++)
        for (let x = 0; x < side; x++) m[y * side + x] = letter[Math.floor((y * 24) / side) * 24 + Math.floor((x * 24) / side)];
      return m;
    };
    fb.page = 1;
    fb.fill(0x10, 0xe, 0xaf, 0xb2, 7);
    expect(fb.carveSign('AB', 11, 11, 'here', false)).toBe(true);
    const h = fb.hi[1];
    let changed = 0;
    for (let y = 0xe * HI; y < 0xb2 * HI; y += 2)
      for (let x = 0x10 * HI; x < 0xaf * HI; x += 2) {
        const v = h[y * HI_WIDTH + x];
        expect([h[y * HI_WIDTH + x + 1], h[(y + 1) * HI_WIDTH + x], h[(y + 1) * HI_WIDTH + x + 1]]).toEqual([v, v, v]);
        if (v !== h[0x20 * HI * HI_WIDTH + 0x20 * HI]) changed++;
      }
    expect(changed).toBeGreaterThan(500);
  });
});

describe('a sign seen from further off (farSign, sideSign)', () => {
  const made = (): { fb: Framebuffer; grey: number; box: () => [number, number, number, number] | null; colours: () => number } => {
    const fb = new Framebuffer(new Uint8Array(512 * 128), fonts);
    const block = new Uint8Array(32 * 32);
    for (let y = 8; y < 24; y++) for (let x = 10; x < 22; x++) block[y * 32 + x] = 1;
    fb.letterMask = (_face, _text, side = 32) => {
      const m = new Uint8Array(side * side);
      for (let y = 0; y < side; y++)
        for (let x = 0; x < side; x++) m[y * side + x] = block[Math.floor((y * 32) / side) * 32 + Math.floor((x * 32) / side)];
      return m;
    };
    fb.page = 1;
    fb.fill(0x10, 0xe, 0xaf, 0xb2, 7);
    const grey = fb.hi[1][0x20 * HI * HI_WIDTH + 0x20 * HI];
    const changed = (f: (v: number, x: number, y: number) => void): void => {
      for (let y = 0xe * HI; y < 0xb3 * HI; y++)
        for (let x = 0x10 * HI; x < 0xb0 * HI; x++) if (fb.hi[1][y * HI_WIDTH + x] !== grey) f(fb.hi[1][y * HI_WIDTH + x], x, y);
    };
    return {
      fb,
      grey,
      box: () => {
        let b: [number, number, number, number] | null = null;
        changed((_, x, y) => {
          b = b ? [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)] : [x, y, x, y];
        });
        return b ? ((b as number[]).map((v) => v / HI) as [number, number, number, number]) : null;
      },
      colours: () => {
        const seen = new Set<number>();
        changed((v) => void seen.add(v));
        return seen.size;
      },
    };
  };
  const SIGN = 'BOTTOMLESS\n   PIT    ';

  it('shows a sign two squares ahead on that wall (x and y 72-120), plate and runes, and nothing without a plate', () => {
    const { fb, box, colours } = made();
    fb.farSign(SIGN, 7, 10);
    const [x1, y1, x2, y2] = box()!;
    expect(x1).toBeGreaterThanOrEqual(72);
    expect(x2).toBeLessThan(120);
    expect(y1).toBeGreaterThanOrEqual(72);
    expect(y2).toBeLessThan(120);
    expect(x2 - x1).toBeGreaterThan(30);
    expect(colours()).toBeGreaterThan(4); // the plate's face, edge and bolts, and the runes cut in it
    const bare = made();
    bare.fb.signPlate = false;
    bare.fb.farSign(SIGN, 7, 10);
    expect(bare.box()).toBeNull();
  });

  it("shows a sign on a side wall between that wall's near and far edges, left or right, beside the party or ahead", () => {
    for (const [side, depth, [lo, hi]] of [
      [0, 0, [16, 40]],
      [0, 1, [40, 72]],
      [1, 0, [152, 176]],
      [1, 1, [120, 152]],
    ] as const) {
      const { fb, box, colours } = made();
      fb.sideSign(SIGN, 7, 10, side, depth);
      const [x1, , x2] = box()!;
      expect(x1, `${side} ${depth}`).toBeGreaterThanOrEqual(lo);
      expect(x2, `${side} ${depth}`).toBeLessThan(hi);
      expect(colours(), `${side} ${depth}`).toBeGreaterThan(3);
    }
  });

  it('keeps a stroke thinner than one of its squares in a sign two squares ahead', () => {
    const thin = made();
    const stroke = new Uint8Array(32 * 32);
    for (let y = 4; y < 28; y++) stroke[y * 32 + 16] = stroke[y * 32 + 17] = 1; // a stroke a square wide near to
    thin.fb.letterMask = (_face, _text, side = 32) => {
      const m = new Uint8Array(side * side);
      for (let y = 0; y < side; y++)
        for (let x = 0; x < side; x++) m[y * side + x] = stroke[Math.floor((y * 32) / side) * 32 + Math.floor((x * 32) / side)];
      return m;
    };
    thin.fb.farSign(SIGN, 7, 10);
    // Some of its squares red, as the letters are cut: every letter's stroke still there, far off.
    let reds = 0;
    for (let y = 72 * HI; y < 120 * HI; y += 2)
      for (let x = 72 * HI; x < 120 * HI; x += 2) {
        const v = thin.fb.hi[1][y * HI_WIDTH + x];
        if ((v & 0xff) > ((v >>> 8) & 0xff) + 40) reds++;
      }
    expect(reds).toBeGreaterThan(14 * 6); // the sign's fourteen runes, each a stroke some squares tall
  });

  it("draws the runes alone, however the sign near to is being read, in squares of the corridor's grain", () => {
    const a = made();
    a.fb.farSign(SIGN, 7, 10);
    const b = made();
    b.fb.carveSign(SIGN, 7, 10, 'here', true); // a reading under way on the wall right ahead
    b.fb.fill(0x10, 0xe, 0xaf, 0xb2, 7);
    b.fb.farSign(SIGN, 7, 10);
    expect(b.fb.hi[1]).toEqual(a.fb.hi[1]);
    const h = a.fb.hi[1];
    for (let y = 72 * HI; y < 120 * HI; y += 2)
      for (let x = 72 * HI; x < 120 * HI; x += 2) {
        const v = h[y * HI_WIDTH + x];
        expect([h[y * HI_WIDTH + x + 1], h[(y + 1) * HI_WIDTH + x + 1]]).toEqual([v, v]);
      }
  });
});
