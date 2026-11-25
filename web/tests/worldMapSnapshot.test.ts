import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { readFont } from '../src/data/font.ts';
import { lzwDecompress } from '../src/data/lzw.ts';
import { readLocations, WORLD_SIZE } from '../src/data/maps.ts';
import type { Game } from '../src/game/game.ts';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { mapKey, showMap } from '../src/ui/mapView.ts';
import { StandardArt, type Manifest } from '../src/ui/standardArt.ts';
import { decodePng } from '../tools/png';
import { fakePage, type FakeElement, type FakePage } from './fakeMapDom.ts';
import { newGame } from './helpers.ts';

/**
 * Ultima V's maps, as they show, kept: each page and each step of the d-pad, X and Y over a fixed record of what the
 * party has seen - the pictures (hashed), where the world's picture is placed on the view, and the legend's words. Taken
 * before the map was split into a game's source and the neutral map (worldMapView.ts showWorldMap), and held after.
 */
describe("Ultima V's maps, as they show", () => {
  let page: FakePage | null = null;
  afterEach(() => {
    page?.restore();
    page = null;
  });

  const standard = (): StandardArt => {
    const png = decodePng(readFileSync(new URL('../public/graphics/standard-tiles.png', import.meta.url)));
    const manifest = JSON.parse(readFileSync(new URL('../public/graphics/standard-tiles.json', import.meta.url), 'utf8')) as Manifest;
    return new StandardArt(new Uint32Array(png.data.buffer.slice(0)), png.width, manifest);
  };

  /** A fixed record of sight: a stripe pattern over the whole world, and the land about (cx, cy). */
  const see = (g: Game, underworld: boolean, cx: number, cy: number): void => {
    for (let y = 0; y < WORLD_SIZE; y++)
      for (let x = 0; x < WORLD_SIZE; x++) {
        const near = Math.abs(x - cx) < 20 && Math.abs(y - cy) < 20;
        if (near || (x * 7 + y * 13) % 11 < 3) g.fog.mark(underworld, x, y);
      }
  };

  const game = (): Game => {
    const { g } = newGame();
    journeyOnward(g);
    g.fog.clear();
    // Outdoors, a little off Britain (the new game starts in Iolo's hut).
    const britain = readLocations(g.data.ovl).find((l) => l.name === 'BRITAIN')!;
    Object.assign(g.s, { mapId: 0, level: 0, x: britain.x + 3, y: britain.y + 2 });
    // Names learnt: a towne, a shrine, a dungeon down below.
    for (const key of ['place:1', 'place:7', 'shrine:2', 'place:40']) g.fog.named.add(key);
    return g;
  };

  /** The map shown for `g` and driven by `keys`, what it shows after each; `before` runs once it is up. */
  const run = (g: Game, underworld: boolean, art: StandardArt | null, keys: number[], focus = '', before?: (p: FakePage) => void) => {
    page = fakePage();
    const p = page;
    const font = readFont(g.data.files.get('IBM.CH'));
    const tiles = lzwDecompress(g.data.files.get('TILES.16'));
    let closed = 0;
    const done = showMap(g, tiles, underworld, () => closed++, art, focus);
    before?.(p);
    const shots: unknown[] = [{ open: p.shot(font) }];
    for (const k of keys) {
      if (k === -1) p.blink();
      else mapKey(k);
      p.flush();
      shots.push({ [k === -1 ? 'blink' : `key ${k.toString(16)}`]: p.shot(font) });
    }
    shots.push({ closed });
    return { shots, done };
  };

  const WALK = [K.Right, K.Down, K.Left, K.Up, K.Up, Pad.Y, -1, -1, Pad.X, K.Right, Pad.X, Pad.B];

  for (const look of ['the game tiles', 'the Standard look'] as const) {
    const art = (): StandardArt | null => (look === 'the Standard look' ? standard() : null);

    it(`Britannia, the party outdoors, in ${look}`, async () => {
      const g = game();
      see(g, false, g.s.x, g.s.y);
      const { shots, done } = run(g, false, art(), WALK);
      await done;
      expect(shots).toMatchSnapshot();
    });

    it(`the Underworld, the party below, in ${look}`, async () => {
      const g = game();
      see(g, false, 40, 40);
      Object.assign(g.s, { level: 0xff, x: 100, y: 100 });
      see(g, true, 100, 100);
      const { shots, done } = run(g, true, art(), WALK);
      await done;
      expect(shots).toMatchSnapshot();
    });

    it(`inside Britain, in ${look}`, async () => {
      const g = game();
      see(g, false, 0, 0);
      const britain = readLocations(g.data.ovl).find((l) => l.name === 'BRITAIN')!;
      Object.assign(g.s, { mapId: britain.id, level: 0, x: 15, y: 20 });
      for (let y = 10; y < 28; y++) for (let x = 6; x < 26; x++) g.fog.markPlace(britain.id, 0, x, y);
      const { shots, done } = run(g, false, art(), [-1, K.Right, Pad.X, K.Right, Pad.Y, -1, Pad.X, Pad.X, Pad.B]);
      await done;
      expect(shots).toMatchSnapshot();
    });

    it(`in a dungeon, in ${look}`, async () => {
      const g = game();
      g.s.dungeon.set(g.data.files.get('DUNGEON.DAT').subarray(0, 0x200));
      Object.assign(g.s, { mapId: 0x21, level: 0, x: 1, y: 1 });
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) g.fog.markPlace(0x21, 0, x, y);
      const { shots, done } = run(g, false, art(), [-1, K.Up, Pad.X, K.Left, Pad.X, Pad.B]);
      await done;
      expect(shots).toMatchSnapshot();
    });

    it(`the journal's View of a place below, the Underworld unseen, in ${look}`, async () => {
      const g = game();
      see(g, false, g.s.x, g.s.y);
      const { shots, done } = run(g, false, art(), [K.Right, Pad.Y, Pad.X, K.Down, Pad.X, Pad.B], 'place:40');
      await done;
      expect(shots).toMatchSnapshot();
    });

    it(`with the cloth map beside the page, in ${look}`, async () => {
      const g = game();
      see(g, false, g.s.x, g.s.y);
      const keys = [Pad.X, Pad.Y, K.Right, K.Down, 0x2d, Pad.Y, Pad.Y, Pad.Y, Pad.X, Pad.B];
      const { shots, done } = run(g, false, art(), keys, '', (p) => {
        const cloth = p.made.find((e) => e.tag === 'img')!;
        Object.assign(cloth, { naturalWidth: 1500, naturalHeight: 1571 });
        cloth.fire('load');
      });
      await done;
      expect(shots).toMatchSnapshot();
    });
  }

  it('blinks nothing on the Underworld while the party is on Britannia, and is lit again back there', async () => {
    const g = game();
    see(g, false, g.s.x, g.s.y);
    see(g, true, 60, 60);
    const { shots, done } = run(g, false, null, [Pad.X, -1, Pad.X, -1, -1, Pad.B]);
    await done;
    expect(shots).toMatchSnapshot();
  });

  /** The map driven from the keyboard (its keydown, not mapKey): `keys` as DOM key names. */
  const typed = (g: Game, keys: string[]) => {
    page = fakePage();
    const p = page;
    const font = readFont(g.data.files.get('IBM.CH'));
    const tiles = lzwDecompress(g.data.files.get('TILES.16'));
    let closed = 0;
    const done = showMap(g, tiles, false, () => closed++, null, '');
    const win = window as unknown as FakeElement;
    const shots: unknown[] = [{ open: p.shot(font) }];
    for (const key of keys) {
      let stopped = 0;
      win.fire('keydown', { key, preventDefault: () => stopped++, stopPropagation: () => stopped++ });
      p.flush();
      shots.push({ [key]: { ...p.shot(font), stopped } });
    }
    shots.push({ closed });
    return { shots, done };
  };

  it('takes the keyboard read as a controller: WASD, a modifier alone, C for the other page, X to close', async () => {
    const g = game();
    see(g, false, g.s.x, g.s.y);
    see(g, true, 60, 60);
    g.options.input = 'controller';
    const { shots, done } = typed(g, ['d', 's', 'Shift', 'ArrowLeft', 'c', 'w', 'c', '.', 'Enter', 'x']);
    await done;
    expect(shots).toMatchSnapshot();
  });

  it("takes the keyboard's own letters: X the other page, Y home, a letter that is no key of the map's closing it", async () => {
    const g = game();
    see(g, false, g.s.x, g.s.y);
    see(g, true, 60, 60);
    const { shots, done } = typed(g, ['ArrowRight', 'ArrowDown', 'Control', 'x', 'ArrowUp', 'X', 'y', ' ', 'd']);
    await done;
    expect(shots).toMatchSnapshot();
  });
});
