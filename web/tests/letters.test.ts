import { describe, expect, it } from 'vitest';
import { EGA_RGBA, Framebuffer, RUNE_LETTER } from '../src/ui/framebuffer';

/** A font whose every glyph is a filled square (so a letter's cell differs from a cleared one). */
const solid = { rows: new Uint8Array(128 * 8).fill(0x7e) };

/** A framebuffer setting the letters in faces, as the Standard look does once they have loaded. */
function lettered(): Framebuffer {
  const fb = new Framebuffer(new Uint8Array(512 * 128), [solid, solid]);
  fb.letterOf = (font, code) =>
    font === 0 && code >= 0x21 && code <= 0x7a
      ? { face: 'mono', text: String.fromCharCode(code) }
      : font === 1 && code >= 0x41 && code <= 0x5f
        ? { face: 'runes', text: RUNE_LETTER[code - 0x41] }
        : null;
  return fb;
}

const shownText = (fb: Framebuffer): string[] =>
  fb
    .lettersShown()
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((l) => l.text);

describe("the Standard look's letters, set in faces over their cells", () => {
  it('are kept for letters and figures, not spaces or symbols, with the colour page left only its ground', () => {
    const fb = lettered();
    for (const [i, c] of [...'Hi 5'].entries()) fb.glyph(0, c.charCodeAt(0), 2 + i, 3, 15, 0);
    fb.glyph(0, 0x7c, 8, 3, 15, 0); // a frame's symbol: the colour page's
    expect(shownText(fb)).toEqual(['H', 'i', '5']);
    const [h] = fb.lettersShown();
    expect(h).toMatchObject({ face: 'mono', colour: 0xffffff, x: 16, y: 24 });
    // The colour page holds the cell's ground alone: black throughout.
    expect(new Set(fb.hi[0].subarray(24 * 4 * 1280 + 16 * 4, 24 * 4 * 1280 + 16 * 4 + 32))).toEqual(new Set([EGA_RGBA[0]]));
  });

  it('go when anything is drawn over their cells - a fill, a letter in their place - and not otherwise', () => {
    const fb = lettered();
    for (const [i, c] of [...'ABC'].entries()) fb.glyph(0, c.charCodeAt(0), i, 0, 15, 0);
    fb.fill(8, 0, 15, 7, 0); // over B
    expect(shownText(fb)).toEqual(['A', 'C']);
    fb.glyph(0, 0x20, 0, 0, 15, 0); // a space over A
    expect(shownText(fb)).toEqual(['C']);
  });

  it('are inverted with their cells, and stand again inverted back (a line flashed, a line chosen)', () => {
    const fb = lettered();
    for (const [i, c] of [...'Iolo'].entries()) fb.glyph(0, c.charCodeAt(0), 24 + i, 3, 15, 0);
    fb.xorFill(0xc0, 24, 0x137, 31, 15);
    expect(shownText(fb)).toEqual([...'Iolo']);
    expect(fb.lettersShown()[0].colour).toBe(0x000000);
    fb.xorFill(0xc0, 24, 0x137, 31, 15);
    expect(fb.lettersShown().map((l) => [l.text, l.colour])).toEqual([...'Iolo'].map((t) => [t, 0xffffff]));
  });

  it('go with a page copied, and a window scrolled', () => {
    const fb = lettered();
    fb.page = 1;
    fb.glyph(0, 0x51, 5, 5, 15, 0);
    fb.page = 0;
    fb.transfer(1, 0, 0, 0, 319, 199);
    expect(shownText(fb)).toEqual(['Q']);
    fb.scroll(0, 0, 319, 199, -8);
    expect(fb.lettersShown().map((l) => [l.x, l.y])).toEqual([[40, 32]]);
    fb.scroll(0, 32, 319, 47, -16); // carried out of the window
    expect(shownText(fb)).toEqual([]);
  });

  it('set a rune in the runes, giving way to its English as it is read', () => {
    const fb = lettered();
    fb.art = { ...fb.art, reading: () => new Uint8Array(1024), fineRunes: true };
    fb.glyph(1, 0x5b, 1, 1, 15, 0); // TH
    const [rune] = fb.lettersShown();
    expect(rune).toMatchObject({ face: 'runes', text: 'æ', to: { face: 'mono', text: 'TH' }, k: 0 });
    fb.finishRunes();
    expect(fb.lettersShown()[0]).toMatchObject({ face: 'mono', text: 'TH', to: undefined, colour: 0xffffff });
  });

  it("reads a rune into English in the colour asked for (a word's kind), the rune in its own", () => {
    const fb = lettered();
    fb.art = { ...fb.art, reading: () => new Uint8Array(1024), fineRunes: true };
    fb.readInk = 0x5e74d0;
    fb.glyph(1, 0x41, 1, 1, 15, 0); // A
    fb.readInk = null;
    fb.glyph(1, 0x42, 2, 1, 15, 0); // B, as ever
    const [a, b] = fb.lettersShown();
    expect(a).toMatchObject({ colour: 0xffffff, to: { text: 'A', colour: 0x5e74d0 } });
    expect(b.to).not.toHaveProperty('colour');
    fb.finishRunes();
    expect(fb.lettersShown().map((l) => l.colour)).toEqual([0x5e74d0, 0xffffff]);
  });

  it('are not kept in the EGA look (no faces): the glyphs are the colour page', () => {
    const fb = new Framebuffer(new Uint8Array(512 * 128), [solid, solid]);
    fb.glyph(0, 0x41, 0, 0, 15, 0);
    expect(fb.lettersShown()).toEqual([]);
  });
});
