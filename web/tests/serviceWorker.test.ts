import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cacheName, cacheNameFor, MUSIC_FOLDER } from '../src/brand.ts';
import { runtimeCaching } from '../tools/serviceWorker.ts';

/**
 * The service worker's run-time caches (tools/serviceWorker.ts, vite.config.ts): named for the game, since every game
 * on one origin (github.io) shares one Cache Storage - Ultima V's the names its players' caches have always had.
 */
describe("the service worker's caches", () => {
  it("are Ultima V's plain names for Ultima V, and the game's id before them for any other game", () => {
    expect(cacheNameFor('ultima5', 'music')).toBe('music');
    expect(cacheNameFor('ultima4', 'music')).toBe('ultima4-music');
    expect(cacheNameFor('ultima3', 'music')).not.toBe(cacheNameFor('ultima4', 'music'));
  });

  it("keep Ultima V's music in 'music', fetched from its own folder alone", () => {
    expect(MUSIC_FOLDER).toBe('music');
    expect(cacheName('music')).toBe('music');
    const routes = runtimeCaching();
    expect(routes.map((r) => r.options?.cacheName)).toEqual(['music']);
    const [music] = routes;
    expect(music.handler).toBe('CacheFirst');
    expect(music.options?.expiration).toEqual({ maxEntries: 160, maxAgeSeconds: 90 * 24 * 60 * 60 });
    expect(music.options?.rangeRequests).toBe(true);
    const pattern = music.urlPattern as RegExp;
    expect(pattern.test('https://synthwave-pixel.github.io/ultima5/music/classical/BRITLAND.3fa9c01d.ogg')).toBe(true);
    expect(pattern.test('https://synthwave-pixel.github.io/ultima4/u4music/classical/LARGE.3fa9c01d.ogg')).toBe(false);
    expect(pattern.test('https://synthwave-pixel.github.io/ultima5/music/BRITLAND.xmi')).toBe(false);
  });

  it('are named in vite.config.ts by these alone, never by a name of its own', () => {
    const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
    expect(config).toContain('runtimeCaching: runtimeCaching()');
    expect(config).not.toMatch(/cacheName\s*:/);
  });
});
