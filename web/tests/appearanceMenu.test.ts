// web/tests/appearanceMenu.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from '../src/game/appearance.ts';
import { ABOVE, chooseAppearance, LARGE_AT, MIRROR_SQUARE, VALUE_WIDTH, VALUES, WORLD_SQUARE } from '../src/game/appearanceMenu.ts';
import { readBritannia, tileAt } from '../src/data/maps.ts';
import { T } from '../src/game/tiles.ts';
import { SCENE_MAP, VIEW_SCENE } from '../src/game/intro.ts';
import { K, Pad } from '../src/game/io.ts';
import { newGame } from './helpers.ts';

/** A row's text without its arrows. */
const bare = (label = ''): string => label.replaceAll('\x1a', '').replaceAll('\x1b', '').trim();

describe('the Appearance screen', () => {
  const setup = () => {
    const { g, p } = newGame();
    Object.assign(g.options, { tileSet: 'standard', tiles: 'modern-pc', input: 'controller' });
    const tiles: [number, number, number][] = [];
    // The large figure beside the menu (the stage's), and where the Avatar was said to stand for the mirror.
    type Figure = { tile: number; x: number; y: number; size?: number } | null;
    const staged: (Figure | 'end')[] = [];
    const leaders: unknown[] = [];
    Object.assign(p.fx, {
      tilePx: (t: number, x: number, y: number) => tiles.push([t, x, y]),
      stage: (scene: { figure: Figure } | null) => staged.push(scene ? scene.figure : 'end'),
    });
    Object.assign(p.draw, { leader: (at: unknown) => leaders.push(at) });
    return { g, p, tiles, staged, leaders };
  };

  it('changes the row under the bar with left and right, and takes it with Done', async () => {
    const { g, p } = setup();
    // Figure right twice (Bard), down to Skin, left once, down six times to Done, A.
    p.keys.push(K.Right, K.Right, K.Down, K.Left, K.Down, K.Down, K.Down, K.Down, K.Down, K.Down, Pad.A);
    const a = await chooseAppearance(g, { ...DEFAULT_APPEARANCE });
    expect(a).toEqual({ ...DEFAULT_APPEARANCE, figure: 2, skin: DEFAULT_APPEARANCE.skin - 1 });
  });

  it('copies the large figure, grown as it is shown, and says so on the row until the next key', async () => {
    const { g, p } = setup();
    const copied: [number, number][] = [];
    const labels: string[] = [];
    Object.assign(p.fx, {
      copyFigure: async (tile: number, scale: number) => {
        copied.push([tile, scale]);
        return true;
      },
    });
    const waitKey = p.waitKey.bind(p);
    Object.assign(p, {
      waitKey: async () => {
        labels.push(bare(g.menuShown?.labels[6]));
        return waitKey();
      },
    });
    // Up twice from Figure (wrapping to Done, then Copy to clipboard), A, then Up and B.
    p.keys.push(K.Up, K.Up, Pad.A, K.Up, Pad.B);
    await chooseAppearance(g, { ...DEFAULT_APPEARANCE });
    expect(copied).toHaveLength(1);
    expect(copied[0][0]).toBeGreaterThanOrEqual(0x14c);
    expect(copied[0][0]).toBeLessThanOrEqual(0x14f);
    expect(copied[0][1]).toBe(3); // the large figure's 48 pixels to a tile's 16
    expect(labels).toEqual(['Copy to clipboard', 'Copy to clipboard', 'Copy to clipboard', 'Copied!', 'Copy to clipboard']);
  });

  it('holds the figure still on Copy to clipboard, left and right choosing the step to copy, and walks on after', async () => {
    const { g, p, staged } = setup();
    const copied: number[] = [];
    Object.assign(p.fx, {
      copyFigure: async (tile: number) => {
        copied.push(tile);
        return true;
      },
    });
    const shownNow = (): number => {
      const f = staged[staged.length - 1];
      return f && f !== 'end' ? f.tile : -1;
    };
    // Each wait for a key a while long (the screen's idle turned six times, a step every fourth - not a whole walk of
    // four steps, which would end where it began): whether the figure stepped through it, on the copy row and off it.
    let copyRow = '';
    const moved = { on: 0, off: 0 };
    const waitKey = p.waitKey.bind(p);
    Object.assign(p, {
      waitKey: async (idle: () => void | Promise<void>) => {
        const on = g.menuShown?.at === 6;
        if (on) copyRow = g.menuShown?.labels[6] ?? '';
        const was = shownNow();
        for (let i = 0; i < 6; i++) await idle();
        if (shownNow() !== was) moved[on ? 'on' : 'off']++;
        return waitKey();
      },
    });
    // Up twice to Copy to clipboard; Right, A; Left twice, A; down off the row, B.
    p.keys.push(K.Up, K.Up, K.Right, Pad.A, K.Left, K.Left, Pad.A, K.Down, Pad.B);
    await chooseAppearance(g, { ...DEFAULT_APPEARANCE });
    expect(copyRow.startsWith('\x1b') && copyRow.endsWith('\x1a')).toBe(true);
    expect(moved.on).toBe(0);
    expect(moved.off).toBeGreaterThan(0);
    // Each copy is the step shown: Right one on, then Left two back - two steps apart.
    expect(copied).toHaveLength(2);
    for (const t of copied) expect(t >= 0x14c && t <= 0x14f).toBe(true);
    expect(copied[1] - 0x14c).toBe((copied[0] - 0x14c + 2) & 3);
  });

  it('says it cannot copy where the platform has no clipboard for pictures', async () => {
    const { g, p } = setup();
    let shown = '';
    const waitKey = p.waitKey.bind(p);
    Object.assign(p, {
      waitKey: async () => {
        shown = bare(g.menuShown?.labels[6]);
        return waitKey();
      },
    });
    p.keys.push(K.Up, K.Up, Pad.A, Pad.B);
    await chooseAppearance(g, { ...DEFAULT_APPEARANCE });
    expect(shown).toBe('Cannot copy here');
  });

  it('gives nothing back on B', async () => {
    const { g, p } = setup();
    p.keys.push(K.Right, Pad.B);
    expect(await chooseAppearance(g, { ...DEFAULT_APPEARANCE })).toBeNull();
  });

  it('shows the Avatar below the mirror of the title’s bedroom, the mirror reflecting', async () => {
    const { g, p, tiles } = setup();
    p.keys.push(Pad.B);
    await chooseAppearance(g, { ...DEFAULT_APPEARANCE });
    const room = g.data.files.get('MISCMAPS.DAT').subarray(0x2c0);
    expect(room[MIRROR_SQUARE[0] + MIRROR_SQUARE[1] * 0x20]).toBe(0x9d);
    const at = (x: number, y: number): number[] => tiles.filter(([, px, py]) => px === 8 + x * 16 && py === 0x80 + y * 16).map(([t]) => t);
    expect(at(9, 1)).toContain(0x9e);
    expect(at(9, 2).some((t) => t >= 0x14c && t <= 0x14f)).toBe(true);
  });

  it('has the mirror give back the Avatar standing below it, as the party’s leader', async () => {
    const { g, p, leaders } = setup();
    p.keys.push(Pad.B);
    await chooseAppearance(g, { ...DEFAULT_APPEARANCE });
    expect(leaders).toContainEqual({ map: SCENE_MAP, x: MIRROR_SQUARE[0], y: MIRROR_SQUARE[1] + 1 });
    expect(leaders[leaders.length - 1]).toBeNull(); // and no one once it is left
  });

  it('shows the figure again, large and walking, beside the menu - clear of its box and the room - as it changes', async () => {
    const { g, p, staged } = setup();
    // Figure right (the mage), then wait a while on the menu, then B.
    p.keys.push(K.Right, Pad.B);
    const frames = new Set<number>();
    // Each wait for a key a while long: the screen's idle turns sixteen times first (a step every fourth).
    const waitKey = p.waitKey.bind(p);
    Object.assign(p, {
      waitKey: async (idle: () => void | Promise<void>) => {
        for (let i = 0; i < 16; i++) await idle();
        return waitKey();
      },
    });
    await chooseAppearance(g, { ...DEFAULT_APPEARANCE });
    expect(staged[staged.length - 1]).toBe('end'); // the stage put back as it was
    const figures = staged.filter((f): f is NonNullable<Exclude<typeof f, 'end'>> => !!f && f !== 'end');
    expect(figures.length).toBeGreaterThan(2);
    for (const f of figures) {
      expect(f.tile).toBeGreaterThanOrEqual(0x14c);
      expect(f.tile).toBeLessThanOrEqual(0x14f);
      frames.add(f.tile);
      expect([f.x, f.y]).toEqual([...LARGE_AT]);
      const size = f.size ?? 16;
      expect(size).toBeGreaterThanOrEqual(32); // large: twice a tile or more
      // Right of the menu's frame (text columns 8 to 30, rows 1 to 11), within the screen, above the room.
      expect(f.x).toBeGreaterThan(31 * 8 - 1);
      expect(f.x + size - 1).toBeLessThanOrEqual(319);
      expect(f.y).toBeGreaterThanOrEqual(8);
      expect(f.y + size - 1).toBeLessThan(VIEW_SCENE[1]);
    }
    expect(frames.size).toBeGreaterThan(1); // it walks
  });

  it('lays the world behind the menu, grown to the large figure, with the figure standing on grass', async () => {
    const { g, p } = setup();
    type Large = { tile: number; x: number; y: number; size: number; clip: number[]; place?: { x: number; y: number } | undefined };
    const large: Large[] = [];
    Object.assign(p.fx, {
      tileLarge: (tile: number, x: number, y: number, size: number, clip: number[], _ground?: number, place?: Large['place']) =>
        large.push({ tile, x, y, size, clip, place }),
    });
    p.keys.push(Pad.B);
    await chooseAppearance(g, { ...DEFAULT_APPEARANCE });
    const brit = readBritannia(g.data.files, g.data.ovl);
    const [lx, ly] = LARGE_AT;
    const under = large.find((l) => l.x === lx && l.y === ly);
    expect(under?.place).toMatchObject({ x: WORLD_SQUARE[0], y: WORLD_SQUARE[1] });
    expect(tileAt(brit, ...WORLD_SQUARE)).toBe(T.Grass);
    for (const l of large) {
      expect(l.size).toBe(under?.size);
      expect(l.clip).toEqual(ABOVE);
      expect(l.tile).toBe(g.cycles.shown[tileAt(brit, l.place!.x, l.place!.y)]);
    }
    // Every EGA pixel above the room's frame is covered by a square, and the squares end there.
    const covers = (x: number, y: number) => large.some((l) => x >= l.x && x < l.x + l.size && y >= l.y && y < l.y + l.size);
    for (const [x, y] of [
      [0, 0],
      [319, 0],
      [0, ABOVE[3]],
      [319, ABOVE[3]],
      [lx, ly],
    ])
      expect(covers(x, y), `${x},${y}`).toBe(true);
    expect(Math.min(...large.map((l) => l.y))).toBeGreaterThan(-(under?.size ?? 0));
    expect(Math.max(...large.map((l) => l.y))).toBeLessThanOrEqual(ABOVE[3]);
  });

  it('fits every value between its arrows with a space either side', () => {
    for (const row of VALUES)
      for (let v = 0; v < row.count; v++) expect(row.name(v).length, `${row.label} ${row.name(v)}`).toBeLessThanOrEqual(VALUE_WIDTH - 2);
  });
});
