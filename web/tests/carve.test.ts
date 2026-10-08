import { describe, expect, it } from 'vitest';
import { CARVE_STYLES, GROOVE_RED, carve, plate } from '../src/ui/carve';
import { DUNGEON_TINTS, RUNE_RED, signInk } from '../src/ui/colours';
import { RUNE_INK } from '../src/game/runeWords';

/** A sign's letter cut into the wall (web/src/ui/carve.ts): a square stroke in the middle of a cell of plain wall. */
describe("a dungeon sign's letters cut into the wall", () => {
  const side = 32;
  const WALL = 0xff806070; // a mid purple-grey
  const mask = new Uint8Array(side * side);
  for (let y = 8; y < 24; y++) for (let x = 8; x < 24; x++) mask[y * side + x] = 1;
  const wall = new Uint32Array(side * side).fill(WALL);
  const bright = (v: number): number => (v & 0xff) + ((v >>> 8) & 0xff) + ((v >>> 16) & 0xff);

  it('leaves the wall as it is outside the letter, but for the lit lip below and to the right of it', () => {
    for (const style of CARVE_STYLES) {
      const out = carve(mask, wall, side, style, 0xffffffff);
      expect(out[2 * side + 2], style).toBe(WALL);
      expect(out[16 * side + 4], style).toBe(WALL);
    }
  });

  it('shades a cut where its side faces away from the light (up and left), and lights it where it faces it', () => {
    for (const style of ['groove', 'fresh', 'vcut'] as const) {
      const out = carve(mask, wall, side, style, 0xffffffff);
      // The cut's left side and its right, half way down.
      const upperLeft = bright(out[16 * side + 8]);
      const lowerRight = bright(out[16 * side + 23]);
      expect(upperLeft, style).toBeLessThan(bright(WALL));
      expect(lowerRight, style).toBeGreaterThan(upperLeft);
    }
  });

  it('paints the letter in its ink, the way the sign was before carving', () => {
    const out = carve(mask, wall, side, 'paint', 0xffffffff);
    expect(out[16 * side + 16]).toBe(0xffffffff);
  });

  it("keeps the wall's texture in the cut: a darker brick shows darker there", () => {
    const dark = wall.map((v, i) => ((i & 1) === 0 ? v : 0xff403038));
    const out = carve(mask, dark, side, 'groove', 0xffffffff);
    expect(bright(out[16 * side + 17])).toBeLessThan(bright(out[16 * side + 16]));
  });
});

describe("a dungeon's signs, in another dungeon's light", () => {
  const hue = (rgb: number): string => {
    const [r, g, b] = [(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff];
    return r >= g && r >= b ? 'red' : g >= r && g >= b ? 'green' : 'blue';
  };

  it('cuts the violet dungeons in red, the green ones in violet, and the red ones in green', () => {
    for (const d of [1, 4, 7]) expect(hue(signInk(d)), `dungeon ${d}`).toBe('red');
    for (const d of [2, 5, 6]) expect(hue(signInk(d)), `dungeon ${d}`).toBe('blue');
    for (const d of [3, 8]) expect(hue(signInk(d)), `dungeon ${d}`).toBe('green');
  });

  it('keeps the hue of the light it is taken from, and is lighter than that light, to be read', () => {
    const light = (rgb: number): number => ((rgb >> 16) & 0xff) + ((rgb >> 8) & 0xff) + (rgb & 0xff);
    for (const d of [2, 3]) {
      const donor = DUNGEON_TINTS[d === 2 ? 7 : 6];
      expect(hue(signInk(d)), `dungeon ${d}`).toBe(hue(donor));
      expect(light(signInk(d)), `dungeon ${d}`).toBeGreaterThan(light(donor));
    }
    expect(signInk(0)).toBe(0); // outside a dungeon, the cut's own stone
  });

  it("cuts the violet dungeons' signs in the runes' red, the groove's and the log's", () => {
    for (const d of [1, 4, 7]) expect(signInk(d), `dungeon ${d}`).toBe(RUNE_RED);
    expect(GROOVE_RED).toBe(0xff1f20c8);
    expect(RUNE_INK.evil).toBe(RUNE_RED);
  });
});

describe("a sign's plate and its groove's red", () => {
  const red = (v: number): number => v & 0xff;
  const green = (v: number): number => (v >>> 8) & 0xff;

  it("cuts the groove's sides in its red, darker and lighter - no black or white to scatter through it far off", () => {
    const side = 32;
    const mask = new Uint8Array(side * side);
    for (let y = 8; y < 24; y++) for (let x = 8; x < 24; x++) mask[y * side + x] = 1;
    const wall = new Uint32Array(side * side).fill(0xff523832); // the plate
    const out = carve(mask, wall, side, 'groove', 0xffffffff);
    const blue = (v: number): number => (v >>> 16) & 0xff;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      expect(red(out[i]), `${i}`).toBeGreaterThan(green(out[i]) + 30);
      expect(red(out[i]), `${i}`).toBeGreaterThan(blue(out[i]) + 30);
    }
    // The upper left side darker than the floor, the lower right lighter.
    const [upper, floor, lower] = [out[16 * side + 8], out[16 * side + 16], out[16 * side + 23]];
    expect(red(upper)).toBeLessThan(red(floor));
    expect(red(lower)).toBeGreaterThan(red(floor));
    // The plate's face along the letter's lower right, where the light enters the cut: tinted that red, not whitened.
    const lip = out[16 * side + 24];
    expect(lip).not.toBe(0xff523832);
    expect(red(lip) - red(0xff523832)).toBeGreaterThan(2 * (blue(lip) - blue(0xff523832)));
  });

  it("fills the groove's floor with its deep red, whatever the dungeon's colour", () => {
    const side = 32;
    const mask = new Uint8Array(side * side);
    for (let y = 8; y < 24; y++) for (let x = 8; x < 24; x++) mask[y * side + x] = 1;
    const wall = new Uint32Array(side * side).fill(0xff806070);
    for (const tint of [0, 0xff00ff00]) {
      const floor = carve(mask, wall, side, 'groove', 0xffffffff, tint)[16 * side + 16];
      expect(red(floor)).toBeGreaterThan(green(floor) * 2);
      expect(red(floor)).toBeLessThanOrEqual(red(GROOVE_RED) + 20);
    }
  });

  it("lays a plate in the cobbles' colours over the wall inside its box alone, bevelled, with dark bolts", () => {
    const [W, H] = [120, 80];
    const page = new Uint32Array(W * H).fill(0xff806070);
    plate(page, W, 10, 10, 100, 60, 4);
    expect(page[5 * W + 5]).toBe(0xff806070);
    // Its face one grey, wherever there is no bolt; its outline dark; its bevel lit above, shaded below.
    const face = page[40 * W + 60];
    expect(page[40 * W + 40]).toBe(face);
    expect(page[30 * W + 80]).toBe(face);
    expect(red(page[10 * W + 60])).toBeLessThan(0x30);
    expect(red(page[12 * W + 60])).toBeGreaterThan(red(face));
    expect(red(page[67 * W + 60])).toBeLessThan(red(face));
    // The top left bolt, four squares of two pixels in: the cobbles' joint.
    expect(page[(10 + 4 * 2) * W + 10 + 4 * 2]).toBe(0xff261a18);
  });

  it("is drawn in squares of half one of 1988's pixels, the grain of the wall round it", () => {
    const W = 120;
    const page = new Uint32Array(W * 80).fill(0xff806070);
    plate(page, W, 10, 10, 100, 60, 4);
    for (let y = 10; y < 70; y += 2)
      for (let x = 10; x < 110; x += 2) {
        const v = page[y * W + x];
        expect([page[y * W + x + 1], page[(y + 1) * W + x], page[(y + 1) * W + x + 1]]).toEqual([v, v, v]);
      }
  });
});
