import { describe, expect, it } from 'vitest';
import type { Effects } from '../src/game/io.ts';
import { Framebuffer, HI, HI_WIDTH } from '../src/ui/framebuffer.ts';
import { Screen } from '../src/ui/screen.ts';

/**
 * A figure of the Standard look's grown to a square of EGA pixels, see-through about it (Effects.figureLarge): what
 * is under its clear pixels left as the page has it - a scene's own ground, which tileLarge's square would cover - and
 * only what falls within the clip drawn (a thing rising out of the ground, cut at it). Nothing in the PC (1988) look.
 */
describe('a figure grown, see-through (figureLarge)', () => {
  const RED = 0xff0000ff; // memory order: opaque red
  const GREEN = 0xff00ff00;
  /** A screen in `look`, its art's every figure the left half red and the right half clear; its colour page green. */
  const make = (look: 'standard' | 'original') => {
    const fb = new Framebuffer(new Uint8Array(1024 * 128), [{ rows: new Uint8Array(128 * 8) }, { rows: new Uint8Array(128 * 8) }]);
    fb.hi[0].fill(GREEN);
    const figure = new Uint32Array(32 * 32);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) figure[y * 32 + x] = RED;
    const screen = Object.create(Screen.prototype) as Screen;
    Object.assign(screen, { fb, look, standard: { figure: () => figure } });
    const fx = (screen as unknown as { makeEffects: () => Effects }).makeEffects();
    return { fb, fx };
  };
  const at = (fb: Framebuffer, x: number, y: number): number => fb.hi[0][y * HI * HI_WIDTH + x * HI];

  it('lays the figure’s ink, and leaves the page under its clear pixels', () => {
    const { fb, fx } = make('standard');
    fx.figureLarge?.(0x1dc, 10, 20, 16, [0, 0, 319, 199]);
    expect(at(fb, 11, 21)).toBe(RED);
    expect(at(fb, 24, 21)).toBe(GREEN);
    expect(at(fb, 9, 21)).toBe(GREEN);
  });

  it('draws only what falls within the clip: the top rows, as it rises out of the ground', () => {
    const { fb, fx } = make('standard');
    fx.figureLarge?.(0x1dc, 10, 20, 16, [10, 20, 25, 27]);
    expect(at(fb, 11, 27)).toBe(RED);
    expect(at(fb, 11, 28)).toBe(GREEN);
  });

  it('draws nothing in the PC (1988) look', () => {
    const { fb, fx } = make('original');
    fx.figureLarge?.(0x1dc, 10, 20, 16, [0, 0, 319, 199]);
    expect(at(fb, 11, 21)).toBe(GREEN);
  });
});
