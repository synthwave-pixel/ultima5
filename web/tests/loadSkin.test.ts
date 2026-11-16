import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSkin } from '../src/ui/loadArt.ts';

describe("a look's skin that cannot be had", () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fails, rather than coming back as none, so the screen tries again when the look is next chosen', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    await expect(loadSkin('c64')).rejects.toThrow();
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 404 })));
    await expect(loadSkin('pc-cga')).rejects.toThrow();
  });

  it('is none for a look with no skin of its own, Remastered and PC EGA', async () => {
    await expect(loadSkin('modern-pc')).resolves.toBeNull();
    await expect(loadSkin('pc-ega')).resolves.toBeNull();
  });
});
