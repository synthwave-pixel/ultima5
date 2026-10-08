import { afterEach, describe, expect, it, vi } from 'vitest';
import { EGA_RGBA, Framebuffer, HI, HI_WIDTH, type TileArt } from '../src/ui/framebuffer';
import { DISSOLVE_MS, HOLD_MS, RuneReveal, STAGGER_MS } from '../src/ui/runeReveal';
import { Text } from '../src/ui/text';

/**
 * The Standard look reads the runes (runeReveal.ts): a rune letter is drawn as the game draws it, and after a moment
 * dissolves into its English; a key finishes it at once. Here the runes are a solid left half and their English a
 * solid right half, so a cell's two halves say which it shows.
 */

const RUNES = new Uint8Array(128 * 8).fill(0xf0);
const fonts = [{ rows: new Uint8Array(128 * 8).fill(0xff) }, { rows: RUNES }];
const rightHalf = new Uint8Array(1024);
for (let y = 0; y < 32; y++) for (let x = 16; x < 32; x++) rightHalf[y * 32 + x] = 1;

/** The Standard look's art: runes read, 0x41 to 0x5f. */
const reading = (): TileArt => ({
  draw: () => {},
  block: () => {},
  fineRunes: true,
  reading: (code) => (code >= 0x41 && code <= 0x5f ? rightHalf : null),
});

const page = (fb: Framebuffer): Uint32Array => (fb as unknown as { hx: Uint32Array }).hx;
/** What cell (column, row) shows: 'rune' (the left half inked), 'english' (the right), 'both', or 'none'. */
function shows(fb: Framebuffer, column: number, row: number): string {
  const at = (x: number, y: number): boolean => page(fb)[(row * 8 * HI + y) * HI_WIDTH + column * 8 * HI + x] === EGA_RGBA[15];
  const [left, right] = [at(4, 16), at(28, 16)];
  return left && right ? 'both' : left ? 'rune' : right ? 'english' : 'none';
}

function standard(): Framebuffer {
  const fb = new Framebuffer(new Uint8Array(512 * 128), fonts);
  fb.art = reading();
  fb.carve = 'paint'; // a sign's letters in white, to tell rune from English by (carving is carve.test.ts's)
  return fb;
}

afterEach(() => vi.restoreAllMocks());

describe('the runes read in the Standard look', () => {
  it('shows a rune as a rune for a moment, then dissolves it into its English', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const fb = standard();
    fb.glyph(1, 0x41, 2, 3, 15, 0);
    expect(shows(fb, 2, 3)).toBe('rune');
    fb.stepRunes(HOLD_MS - 1);
    expect(shows(fb, 2, 3)).toBe('rune');
    fb.stepRunes(HOLD_MS + DISSOLVE_MS / 2); // half way: some pixels of each
    let english = 0;
    const p = page(fb);
    for (let y = 0; y < 32; y++) for (let x = 16; x < 32; x++) if (p[(3 * 32 + y) * HI_WIDTH + 2 * 32 + x] === EGA_RGBA[15]) english++;
    expect(english).toBeGreaterThan(100);
    expect(english).toBeLessThan(412);
    fb.stepRunes(HOLD_MS + DISSOLVE_MS);
    expect(shows(fb, 2, 3)).toBe('english');
    expect(fb.runes.active).toBe(false);
  });

  it('reads the runes at once when a key comes', () => {
    const fb = standard();
    fb.glyph(1, 0x5b, 0, 0, 15, 0); // TH
    fb.glyph(1, 0x42, 1, 0, 15, 0);
    fb.finishRunes();
    expect([shows(fb, 0, 0), shows(fb, 1, 0)]).toEqual(['english', 'english']);
  });

  it("leaves the runes' dividers and frame pieces, and every rune in the EGA look, as the game draws them", () => {
    const fb = standard();
    fb.glyph(1, 0x40, 0, 0, 15, 0); // the word divider
    fb.glyph(1, 0x61, 1, 0, 15, 0); // a frame piece
    expect(fb.runes.active).toBe(false);
    const ega = new Framebuffer(new Uint8Array(512 * 128), fonts);
    ega.glyph(1, 0x41, 0, 0, 15, 0);
    expect(ega.runes.active).toBe(false);
  });

  it('moves the waiting runes with a window that scrolls, and forgets those cleared or written over', () => {
    const fb = standard();
    fb.glyph(1, 0x41, 3, 10, 15, 0);
    fb.glyph(1, 0x41, 4, 10, 15, 0);
    fb.glyph(1, 0x41, 5, 10, 15, 0);
    fb.scroll(0, 9 * 8, 39 * 8 + 7, 12 * 8 + 7, -8); // up a row: the runes now on row 9
    fb.fill(4 * 8, 9 * 8, 4 * 8 + 7, 9 * 8 + 7, 0); // one cleared
    fb.glyph(0, 0x20, 5, 9, 15, 0); // one written over
    fb.finishRunes();
    expect(shows(fb, 3, 9)).toBe('english');
    expect(shows(fb, 3, 10)).toBe('none');
    expect(shows(fb, 4, 9)).toBe('none');
    expect(fb.runes.active).toBe(false);
  });

  it('runs the reading as a wave from the first rune printed: a column a step, a row two', () => {
    const r = new RuneReveal();
    const page = new Uint32Array(1);
    const begun: string[] = [];
    r.add(10, 5, 0x41, 15, 0, page, 0);
    r.add(11, 5, 0x41, 15, 0, page, 0);
    r.add(10, 6, 0x41, 15, 0, page, 0);
    r.step(HOLD_MS + STAGGER_MS, (c) => begun.push(`${c.column},${c.row}`));
    expect(begun).toEqual(['10,5', '11,5']); // the row below begins two steps on
  });

  it("draws a rune drawn again from the text's record as read: an overlay lifted does not turn English back to runes", () => {
    const fb = standard();
    fb.glyph(1, 0x41, 0, 0, 15, 0, true);
    expect(shows(fb, 0, 0)).toBe('english');
    expect(fb.runes.active).toBe(false);
    // Through the text layer: a sign's line read, the panel laid over it and lifted.
    const t = new Text({
      glyph: (font, code, column, row, fg, bg, _underline, again) => fb.glyph(font, code, column, row, fg, bg, again),
      clearCells: (c1, r1, c2, r2, colour) => fb.fill(c1 * 8, r1 * 8, c2 * 8 + 7, r2 * 8 + 7, colour),
      scrollCells: (c1, r1, c2, r2, colour) => fb.scroll(c1 * 8, r1 * 8, c2 * 8 + 7, r2 * 8 + 7, -8, colour),
    });
    t.setWindow(2, 24, 9, 39, 23);
    t.select(2);
    t.font = 1;
    t.print('AB');
    t.font = 0;
    fb.finishRunes();
    t.cover(2, 24, 9, 39, 10);
    fb.fill(24 * 8, 9 * 8, 39 * 8 + 7, 10 * 8 + 7, 0); // the panel drawn over it
    t.uncover();
    expect([shows(fb, 24, 9), shows(fb, 25, 9)]).toEqual(['english', 'english']);
  });

  it("draws the game font's symbols at the lettering's grain where the art asks, but not the border's caps", () => {
    const diagonal = new Uint8Array(128 * 8);
    for (const code of [1, 5]) for (let r = 0; r < 8; r++) diagonal[code * 8 + r] = 0x80 >> r;
    const draw = (fine: boolean, code: number): Uint32Array => {
      const fb = new Framebuffer(new Uint8Array(512 * 128), [{ rows: diagonal }, { rows: RUNES }]);
      fb.art = { draw: () => {}, block: () => {}, ...(fine && { fineSymbol: (c: number) => c > 2 && c < 0x20 }) };
      fb.glyph(0, code, 0, 0, 15, 0);
      return page(fb).slice(0, 8 * HI * HI_WIDTH);
    };
    expect(draw(true, 5)).not.toEqual(draw(false, 5)); // the waiting cursor's stair-steps followed finer
    expect(draw(true, 1)).toEqual(draw(false, 1)); // a cap, the chrome's
  });
});

/** A sign in the dungeon's view is drawn anew with every frame: it is read by the time it was first shown (readSign). */
describe('a sign drawn again with each frame of the view', () => {
  // The view is drawn anew each frame, its wall and then the sign on it (dungeon.ts drawDungeon): a wall of brown here.
  const WALL = 6;
  const draw = (fb: Framebuffer, key: string): void => {
    fb.fill(0, 0, 319, 199, WALL);
    fb.readSign(key);
    fb.glyph(1, 0x41, 5, 5, 15, 0);
    fb.glyph(1, 0x42, 6, 5, 15, 0);
    fb.readSign(null);
  };

  it('shows its runes, then its English as it is read, however often it is drawn again meanwhile', () => {
    const fb = standard();
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    draw(fb, 'here');
    expect(shows(fb, 5, 5)).toBe('rune');
    now += HOLD_MS - 10;
    draw(fb, 'here'); // drawn again before the hold is out: runes still, not begun again
    expect(shows(fb, 5, 5)).toBe('rune');
    now += 10 + DISSOLVE_MS;
    draw(fb, 'here');
    expect(shows(fb, 5, 5)).toBe('english');
    // The next letter along the wave is a little behind, and done once its own dissolve is.
    now += STAGGER_MS;
    draw(fb, 'here');
    expect(shows(fb, 6, 5)).toBe('english');
  });

  it('stays in runes however long it is shown until it is read, then reads from that moment', () => {
    const fb = standard();
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const sealed = (): void => {
      fb.fill(0, 0, 319, 199, WALL);
      fb.readSign('here', false);
      fb.glyph(1, 0x41, 5, 5, 15, 0);
      fb.readSign(null);
    };
    sealed();
    now += HOLD_MS + DISSOLVE_MS * 10;
    sealed();
    expect(shows(fb, 5, 5)).toBe('rune');
    // Read (bumped into): the runes held, then their English, from the reading on.
    draw(fb, 'here#1');
    expect(shows(fb, 5, 5)).toBe('rune');
    now += HOLD_MS + DISSOLVE_MS;
    draw(fb, 'here#1');
    expect(shows(fb, 5, 5)).toBe('english');
  });

  it('is on the wall itself in the Standard look: no plate, the wall bare between its letters', () => {
    const fb = standard();
    vi.spyOn(performance, 'now').mockImplementation(() => 1000);
    draw(fb, 'here');
    const cell = (column: number, row: number): Uint32Array =>
      Uint32Array.from({ length: 32 * 32 }, (_, i) => page(fb)[(row * 32 + (i >> 5)) * HI_WIDTH + column * 32 + (i & 31)]);
    const pixels = [...cell(5, 5), ...cell(6, 5)];
    expect(pixels.filter((v) => v === EGA_RGBA[WALL]).length).toBeGreaterThan(pixels.length / 4); // the fixture's glyphs are half ink
    expect(pixels.some((v) => v === EGA_RGBA[15])).toBe(true); // the letters, in the plate's white
    expect(pixels.some((v) => v === EGA_RGBA[0])).toBe(false); // and no black behind them
  });

  it('is cut into the wall, as the Standard look draws it: its letters the wall shaded and lit, no plate', () => {
    const fb = standard();
    fb.carve = 'fresh';
    vi.spyOn(performance, 'now').mockImplementation(() => 1000);
    draw(fb, 'here');
    const pixels = Array.from({ length: 32 * 32 }, (_, i) => page(fb)[(5 * 32 + (i >> 5)) * HI_WIDTH + 5 * 32 + (i & 31)]);
    const wall = pixels.filter((v) => v === EGA_RGBA[WALL]).length;
    expect(wall).toBeGreaterThan(pixels.length / 4);
    expect(wall).toBeLessThan(pixels.length);
    expect(pixels.some((v) => v === EGA_RGBA[0] || v === EGA_RGBA[15])).toBe(false); // neither plate nor paint
  });

  it('begins again for another sign, or the same one seen from elsewhere', () => {
    const fb = standard();
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    draw(fb, 'here');
    now += HOLD_MS + DISSOLVE_MS + STAGGER_MS;
    draw(fb, 'here');
    expect(shows(fb, 5, 5)).toBe('english');
    draw(fb, 'there');
    expect(shows(fb, 5, 5)).toBe('rune');
  });

  it('is read at once with a key, and stays read as it is drawn again', () => {
    const fb = standard();
    vi.spyOn(performance, 'now').mockImplementation(() => 1000);
    draw(fb, 'here');
    fb.finishRunes();
    draw(fb, 'here');
    expect(shows(fb, 5, 5)).toBe('english');
    expect(shows(fb, 6, 5)).toBe('english');
  });
});
