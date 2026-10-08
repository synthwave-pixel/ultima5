import { describe, expect, it } from 'vitest';
import { lzwDecompress } from '../src/data/lzw.ts';
import { FIGURES, HAIR, SKIN } from '../src/game/appearance.ts';
import { dress, labels } from '../src/ui/avatarRegions.ts';
import { indices, original } from '../src/ui/originals.ts';
import { gameFiles } from './helpers.ts';

describe('the Avatar’s regions', () => {
  const tiles = lzwDecompress(gameFiles().get('TILES.16'));
  const mem = (c: number): number => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;

  /** Hue (degrees), saturation and value (0 to 255) of a memory-order RGBA colour. */
  const hsv = (c: number): { h: number; s: number; v: number } => {
    const [r, g, b] = [c & 0xff, (c >> 8) & 0xff, (c >> 16) & 0xff];
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: h * 60, s: max ? d / max : 0, v: max };
  };

  it('labels only pixels the figure draws, in every frame of every figure', () => {
    for (const { base } of FIGURES)
      for (let f = 0; f < 4; f++) {
        const px = indices(tiles, base + f);
        labels(tiles, base, f).forEach((r, i) => {
          if (r !== '.') expect(px[i], `${base.toString(16)}+${f} at ${i}`).not.toBe(0);
        });
      }
  });

  it('finds a face on every figure, hair on the mage and the shepherd, and clothes on all', () => {
    for (const { base } of FIGURES)
      for (let f = 0; f < 4; f++) {
        const r = labels(tiles, base, f);
        expect(r.filter((x) => x === 's').length, `${base.toString(16)}+${f} skin`).toBeGreaterThan(0);
        expect(r.filter((x) => x === 'm').length, `${base.toString(16)}+${f} main`).toBeGreaterThan(4);
        if (base === 0x140 || base === 0x150) expect(r.includes('h'), `${base.toString(16)}+${f} hair`).toBe(true);
      }
  });

  it('leaves no robe pixel of the mage undressed, the spell’s sparkle and the staff’s glow apart', () => {
    for (let f = 0; f < 4; f++) {
      const px = indices(tiles, 0x140 + f);
      const r = labels(tiles, 0x140, f);
      px.forEach((c, i) => {
        const [x, y] = [i % 16, Math.floor(i / 16)];
        const sparkle = f === 0 && ((x <= 4 && y <= 4) || (x >= 12 && y <= 3));
        if ((c === 1 || c === 9) && !sparkle) expect(r[i], `frame ${f} at ${x},${y}`).toBe('m');
      });
    }
    // The sparkle's brown pixel is not skin, and the beard's tip (frame 0, at 8,9) is beard.
    expect(labels(tiles, 0x140, 0)[2 * 16 + 1]).toBe('.');
    expect(labels(tiles, 0x140, 0)[9 * 16 + 8]).toBe('b');
  });

  it('makes the mage’s staff part of the trim in every frame, its yellow head as drawn', () => {
    for (let f = 0; f < 4; f++) {
      const px = indices(tiles, 0x140 + f);
      const r = labels(tiles, 0x140, f);
      const staff = [...px.keys()].filter((i) => px[i] === 13);
      expect(staff.length, `frame ${f}`).toBeGreaterThan(2);
      for (const i of staff) expect(r[i], `frame ${f} at ${i % 16},${Math.floor(i / 16)}`).toBe('t');
      px.forEach((c, i) => c === 14 && expect(r[i]).toBe('.'));
    }
    // Dressed with a trim hue, the staff is no longer its light purple.
    const t = 0x141;
    const cell = original(tiles, t);
    const i = indices(tiles, t).findIndex((c) => c === 13);
    const at = (Math.floor(i / 16) * 4 + 1) * 64 + (i % 16) * 4 + 1;
    const out = dress(cell, indices(tiles, t), labels(tiles, 0x140, 1), { figure: 1, skin: 3, hair: 0, main: 0, trim: 1 });
    expect(out[at]).not.toBe(cell[at]);
  });

  it('paints skin and hair from their ramps, and turns only the clothes’ hue', () => {
    const t = 0x150;
    const regions = labels(tiles, t, 0);
    const cell = original(tiles, t);
    const green = HAIR.findIndex((h) => h.name === 'green');
    const out = dress(cell, indices(tiles, t), regions, { figure: 4, skin: 7, hair: green, main: 9, trim: 0 });
    const at = (i: number): number => out[Math.floor(i / 16) * 4 * 64 + (i % 16) * 4];
    const was = (i: number): number => cell[Math.floor(i / 16) * 4 * 64 + (i % 16) * 4];
    regions.forEach((r, i) => {
      if (r === 's') expect(SKIN[7].map(mem)).toContain(at(i));
      else if (r === 'h') expect(HAIR[green].ramp!.map(mem)).toContain(at(i));
      else if (r === 't' || r === '.') expect(at(i)).toBe(was(i));
    });
    // A main pixel (the tunic, green as drawn) turns to 240 degrees, keeping its saturation and value.
    const i = regions.indexOf('m');
    expect(Math.abs(hsv(at(i)).h - 240)).toBeLessThanOrEqual(8);
    expect(Math.abs(hsv(at(i)).v - hsv(was(i)).v)).toBeLessThanOrEqual(1);
    expect(Math.abs(hsv(at(i)).s - hsv(was(i)).s)).toBeLessThanOrEqual(0.02);
  });

  it('turns the trim to its own hue, and leaves clothes as drawn at hue 0', () => {
    const t = 0x150;
    const regions = labels(tiles, t, 0);
    const cell = original(tiles, t);
    const px = (c: Uint32Array, i: number): number => c[Math.floor(i / 16) * 4 * 64 + (i % 16) * 4];
    const trimmed = dress(cell, indices(tiles, t), regions, { figure: 4, skin: 3, hair: 1, main: 0, trim: 5 });
    const ti = regions.indexOf('t');
    expect(ti).toBeGreaterThanOrEqual(0);
    // The trousers, red as drawn, turned to 120 degrees (HUES[5]); the tunic untouched.
    expect(Math.abs(hsv(px(trimmed, ti)).h - 120)).toBeLessThanOrEqual(8);
    expect(Math.abs(hsv(px(trimmed, ti)).v - hsv(px(cell, ti)).v)).toBeLessThanOrEqual(1);
    regions.forEach((r, i) => {
      if (r === 'm') expect(px(trimmed, i)).toBe(px(cell, i));
    });
    const plain = dress(cell, indices(tiles, t), regions, { figure: 4, skin: 3, hair: 1, main: 0, trim: 0 });
    regions.forEach((r, i) => {
      if (r === 'm' || r === 't') expect(px(plain, i)).toBe(px(cell, i));
    });
  });

  const px = (c: Uint32Array, i: number): number => c[Math.floor(i / 16) * 4 * 64 + (i % 16) * 4 + 64 + 1];
  const dressed = (
    t: number,
    f: number,
    hair: number,
    main = 0,
    lady = false,
  ): { cell: Uint32Array; out: Uint32Array; regions: ReturnType<typeof labels> } => {
    const regions = labels(tiles, t, f);
    const cell = original(tiles, t + f);
    return { cell, out: dress(cell, indices(tiles, t + f), regions, { figure: 0, skin: 3, hair, main, trim: 0 }, lady), regions };
  };
  const auburn = HAIR.findIndex((h) => h.name === 'auburn');

  it('keeps the fighter’s helm and the bard’s hat as drawn by default, and makes them hair once a colour is chosen', () => {
    for (const t of [0x14c, 0x144])
      for (let f = 0; f < 4; f++) {
        const plain = dressed(t, f, 0);
        const headgear = plain.regions.flatMap((r, i) => (r === 'g' ? [i] : []));
        expect(headgear.length, `${t.toString(16)}+${f}`).toBeGreaterThan(2);
        for (const i of headgear) expect(px(plain.out, i)).toBe(px(plain.cell, i));
        const dyed = dressed(t, f, auburn);
        for (const i of headgear) expect(HAIR[auburn].ramp!.map(mem)).toContain(px(dyed.out, i));
      }
  });

  it('dresses the jester’s hood as the suit by default, and braids it as hair once a colour is chosen, the bells kept', () => {
    for (let f = 0; f < 4; f++) {
      const suit = dressed(0x158, f, 0, 9); // blue clothes, default hair
      const hood = suit.regions.flatMap((r, i) => (r === 'j' ? [i] : []));
      expect(hood.length, `frame ${f}`).toBeGreaterThan(2);
      for (const i of hood) expect(Math.abs(hsv(px(suit.out, i)).h - 240)).toBeLessThanOrEqual(8);
      const braided = dressed(0x158, f, auburn, 9);
      const shades = new Set(hood.map((i) => px(braided.out, i)));
      for (const c of shades) expect(HAIR[auburn].ramp!.map(mem)).toContain(c);
      expect(shades.size).toBeGreaterThan(1); // plaited, not one flat colour
      // The bells (cyan, yellow and green) are left as drawn.
      const ega = indices(tiles, 0x158 + f);
      ega.forEach((c, i) => {
        if ([2, 3, 10, 11, 14].includes(c)) expect(px(braided.out, i), `frame ${f} bell at ${i}`).toBe(px(braided.cell, i));
      });
    }
  });

  it('gives the mage his beard as hair, and a Lady mage none: her chin skin and the robe below it', () => {
    for (let f = 0; f < 4; f++) {
      const sir = dressed(0x140, f, auburn);
      const beard = sir.regions.flatMap((r, i) => (r === 'b' ? [i] : []));
      expect(beard.length, `frame ${f}`).toBeGreaterThan(3);
      for (const i of beard) expect(HAIR[auburn].ramp!.map(mem)).toContain(px(sir.out, i));
      const lady = dressed(0x140, f, auburn, 0, true);
      const chin = beard.filter((i) => sir.regions[i - 16] !== 'b');
      const chest = beard.filter((i) => sir.regions[i - 16] === 'b');
      for (const i of chin) expect(SKIN[3].map(mem)).toContain(px(lady.out, i));
      for (const i of chest) {
        expect(HAIR[auburn].ramp!.map(mem)).not.toContain(px(lady.out, i));
        expect(hsv(px(lady.out, i)).h).toBeGreaterThan(180); // the robe's blue
      }
    }
  });
});
