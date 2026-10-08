import { describe, expect, it } from 'vitest';
import { Framebuffer, HI, type Words } from '../src/ui/framebuffer.ts';

const fb = (): Framebuffer =>
  new Framebuffer(new Uint8Array(512 * 128), [{ rows: new Uint8Array(128 * 8) }, { rows: new Uint8Array(128 * 8) }]);

/** A line of words whose box is EGA pixels (x, y) to (x + w, y + h). */
const line = (text: string, x: number, y: number, w = 40, h = 8): Words => ({
  run: { text, x: x * HI, y: (y + h) * HI, size: 24, face: 'body', colour: 0xffffff },
  box: [x * HI, y * HI, (x + w) * HI, (y + h) * HI],
  alpha: 1,
});
const texts = (f: Framebuffer, page: number): string[] => f.words[page].map((w) => w.run.text);

describe("the story's words, kept over the pages as words", () => {
  it('go with a copy between pages, moved as it is, and those under the copy go', () => {
    const f = fb();
    f.addWords(1, [line('coming', 200, 50)]);
    f.addWords(0, [line('old', 200, 60), line('beside', 10, 10)]);
    f.transfer(1, 0, 150, 0, 319, 199, 140, 0);
    expect(texts(f, 0)).toEqual(['beside', 'coming']);
    expect(f.words[0][1].run.x).toBe(190 * HI);
    expect(texts(f, 1)).toEqual(['coming']); // a copy, not a move
  });

  it('are cleared with the pixels under them: a fill, a picture, a cleared page', () => {
    const f = fb();
    f.addWords(0, [line('a', 10, 10), line('b', 10, 100), line('c', 200, 150)]);
    f.fill(0, 95, 100, 120, 0);
    expect(texts(f, 0)).toEqual(['a', 'c']);
    f.image({ width: 20, height: 20, stride: 10, pixels: new Uint8Array(200), mask: null }, 210, 150);
    expect(texts(f, 0)).toEqual(['a']);
    f.clearPage(0);
    expect(texts(f, 0)).toEqual([]);
  });

  it('are put back with a page, and a part of one', () => {
    const f = fb();
    f.addWords(0, [line('kept', 10, 10), line('also', 200, 100)]);
    const shot = f.snapshot(0);
    f.clearPage(0);
    f.restoreRect(0, shot, 0, 0, 100, 50);
    expect(texts(f, 0)).toEqual(['kept']);
    f.restorePage(0, shot);
    expect(texts(f, 0)).toEqual(['kept', 'also']);
  });

  it('dissolve with a reveal: those coming fade in as those going fade out, and at its end only the new stand', () => {
    const f = fb();
    f.addWords(0, [line('going', 20, 20), line('elsewhere', 250, 180)]);
    f.addWords(1, [line('coming', 30, 40)]);
    const step = f.revealWords(0, 0, 160, 100);
    step(0.25);
    const alpha = Object.fromEntries(f.words[0].map((w) => [w.run.text, w.alpha]));
    expect(alpha).toEqual({ going: 0.75, elsewhere: 1, coming: 0.25 });
    step(1);
    expect(texts(f, 0)).toEqual(['elsewhere', 'coming']);
    expect(f.words[0].every((w) => w.alpha === 1)).toBe(true);
  });
});
