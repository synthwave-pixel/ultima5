import { describe, expect, it } from 'vitest';
import { Framebuffer } from '../src/ui/framebuffer';

/**
 * The picture marked changed tells the screen (framebuffer.ts onDirty), which with Battery saver asks for a frame only
 * then (screen.ts lazyFrames): whatever draws, the frame to show it in is asked for.
 */
describe('the picture marked changed', () => {
  const fonts = [{ rows: new Uint8Array(128 * 8) }, { rows: new Uint8Array(128 * 8) }];

  it('tells the screen whenever it is marked so, by anything drawn, and not as it is shown', () => {
    const fb = new Framebuffer(new Uint8Array(512 * 128), fonts);
    let told = 0;
    fb.onDirty = () => void told++;
    fb.dirty = false; // shown
    expect(told).toBe(0);
    fb.pen = 1;
    fb.fill(8, 8, 20, 20); // something drawn
    expect(fb.dirty).toBe(true);
    expect(told).toBeGreaterThan(0);
    const after = told;
    fb.glyph(0, 0x41, 3, 3, 15, 0);
    expect(told).toBeGreaterThan(after);
  });
});
