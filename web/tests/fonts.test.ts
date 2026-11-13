import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appearanceLines, wrap } from '../src/game/menu.ts';
import { DEFAULTS, FONTS, normaliseOptions } from '../src/game/settings.ts';
import { EGA_RGBA, Framebuffer, HI, HI_WIDTH, type TileArt } from '../src/ui/framebuffer';
import { newGame } from './helpers.ts';

/**
 * Appearance > Font (settings.ts Options.font, screen.ts setFont): SixtyFour, Legible, Dyslexic or DOS, whatever the
 * UX; a player already in the PC (1988) look keeping its letters, the game's own (DOS).
 */
describe('the font', () => {
  it('is SixtyFour to begin with, and DOS for a player already in the PC (1988) look', () => {
    expect(DEFAULTS.font).toBe('sixtyfour');
    expect(normaliseOptions({ tileSet: 'original' }).font).toBe('dos');
    expect(normaliseOptions({ tileSet: 'standard' }).font).toBeUndefined();
    // Chosen, it is kept, in either look; one this build has not got is dropped for the default.
    expect(normaliseOptions({ tileSet: 'original', font: 'legible' }).font).toBe('legible');
    expect(normaliseOptions({ tileSet: 'standard', font: 'dos' }).font).toBe('dos');
    expect(normaliseOptions({ tileSet: 'standard', font: 'comic' as never }).font).toBeUndefined();
  });

  it('is chosen in Appearance, one font after another, each saying what it is, in either UX', async () => {
    const { g } = newGame();
    const line = () => appearanceLines(g).find((l) => l.label.startsWith('Font:'))!;
    const seen: string[] = [];
    for (let i = 0; i < FONTS.length; i++) {
      seen.push(line().label);
      expect(line().note!.length).toBeGreaterThan(10);
      expect(line().note!.match(/[^\x20-\x7e]/g) ?? []).toEqual([]);
      // Three rows at most: in play the fourth meets the date on the frame below.
      expect(wrap(line().note!).length, line().note).toBeLessThanOrEqual(3);
      await line().act?.();
    }
    expect(seen).toEqual(['Font: SixtyFour', 'Font: Legible', 'Font: Dyslexic', 'Font: DOS']);
    expect(g.options.font).toBe('sixtyfour');
    g.options.tileSet = 'original';
    expect(line().label).toBe('Font: SixtyFour');
  });

  it('ships each font with its licence', () => {
    const fonts = join(import.meta.dirname, '..', 'public', 'fonts');
    for (const file of [
      'Sixtyfour.ttf',
      'AtkinsonHyperlegibleMono.ttf',
      'OFL-atkinsonhyperlegiblemono.txt',
      'OpenDyslexicMono-Regular.otf',
      'LICENSE-opendyslexicmono.txt',
    ])
      expect(existsSync(join(fonts, file)), file).toBe(true);
  });
});

/** DOS (Framebuffer.dosLetters): the game's own 8-by-8 letters, not a tile set's smoothed lettering. */
describe('DOS letters', () => {
  const fonts = [{ rows: new Uint8Array(128 * 8).fill(0x80) }, { rows: new Uint8Array(128 * 8).fill(0xff) }];
  /** A tile set with lettering of its own: every letter solid. */
  const lettered = (): TileArt => ({
    draw: () => {},
    block: () => {},
    glyph: (code) => (code >= 0x20 && code <= 0x7a ? new Uint8Array(1024).fill(1) : null),
  });
  const page = (fb: Framebuffer): Uint32Array => (fb as unknown as { hx: Uint32Array }).hx;

  it("draws the game's glyph, its one column of ink, where the set's lettering would fill the cell", () => {
    for (const dos of [false, true]) {
      const fb = new Framebuffer(new Uint8Array(512 * 128), fonts);
      fb.art = lettered();
      fb.dosLetters = dos;
      fb.glyph(0, 0x41, 2, 3, 15, 1);
      const at = (x: number, y: number): number => page(fb)[(3 * 8 * HI + y) * HI_WIDTH + 2 * 8 * HI + x];
      expect(at(0, 0)).toBe(EGA_RGBA[15]); // the glyph's first column, or the set's, inked either way
      expect(at(HI, 0)).toBe(dos ? EGA_RGBA[1] : EGA_RGBA[15]); // the next: the ground under DOS
    }
  });
});
