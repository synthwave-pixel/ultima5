import { describe, expect, it } from 'vitest';
import { TITLE_DIALOG } from '../src/game/chromeTone.ts';
import { chromeColours } from '../src/ui/framebuffer.ts';
import { nameBoxStyle } from '../src/ui/nameBox.ts';

/**
 * The page's own box for a name (pageHooks.ts textBox, askName's "Type a name" from a keyboard or a touch) dressed as
 * the title's dialogs are: the lettering in the font chosen, at the game's text size, in the title's blue frame
 * (menu.ts framed: the copper toned to TITLE_DIALOG in the Standard look, the EGA's blue and white in Retro).
 */
describe('the name box (nameBoxStyle)', () => {
  const hex = (v: number): string => `#${v.toString(16).padStart(6, '0')}`;

  it('letters in the font chosen, at the game’s text size: SixtyFour, Legible’s ExtraBold, Dyslexic', () => {
    const six = nameBoxStyle('sixtyfour', 'standard', 32);
    expect(six.family).toBe('"U5 Letters"');
    expect(six.weight).toBe(400);
    expect(six.size).toBeCloseTo(32 * 0.88);
    const legible = nameBoxStyle('legible', 'standard', 32);
    expect(legible.family).toBe('"U5 Legible", "U5 Letters"');
    expect(legible.weight).toBe(800);
    expect(nameBoxStyle('dyslexic', 'standard', 32).family).toBe('"U5 Dyslexic", "U5 Letters"');
  });

  it('letters DOS’s choice in SixtyFour: its 8-by-8 letters are no font the page can set', () => {
    expect(nameBoxStyle('dos', 'standard', 32).family).toBe('"U5 Letters"');
  });

  it('frames it in the title dialogs’ blue in the Standard look: the copper toned, not the copper', () => {
    const blue = chromeColours(TITLE_DIALOG);
    const style = nameBoxStyle('sixtyfour', 'standard', 32);
    expect(style.frame).toEqual({ light: hex(blue.light[0]), shade: hex(blue.shade[0]), base: hex(blue.base), rim: hex(blue.rim) });
    expect(style.frame.base).not.toBe(hex(chromeColours(null).base));
    const b = blue.base & 0xff;
    const r = blue.base >> 16;
    expect(b).toBeGreaterThan(r);
  });

  it('frames it in the EGA’s blue, a white line inside, in Retro, as the title draws its own', () => {
    expect(nameBoxStyle('sixtyfour', 'original', 32).frame).toEqual({
      light: '#0000aa',
      shade: '#0000aa',
      base: '#0000aa',
      rim: '#ffffff',
    });
  });

  it('draws its band as the title’s, seven EGA pixels deep at the game’s size', () => {
    expect(nameBoxStyle('sixtyfour', 'standard', 32).band).toBeCloseTo(28);
    expect(nameBoxStyle('sixtyfour', 'standard', 16).band).toBeCloseTo(14);
  });

  it('keeps the copper as it is where no tone is asked (chromeColours)', () => {
    expect(chromeColours(null).base).toBe(0x623318);
    expect(chromeColours(null).rim).toBe(0x3e210f);
  });
});
