import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from '../src/game/appearance.ts';
import { lookCommand } from '../src/game/look.ts';
import { enterTown } from '../src/game/town.ts';
import { drawView, setTileAt } from '../src/game/world.ts';
import { K, Pad } from '../src/game/io.ts';
import { newGame } from './helpers.ts';

describe('a mirror', () => {
  const beforeMirror = async (tiles: 'modern-pc' | 'apple2', tile9 = 0x9d) => {
    const { g, p } = newGame();
    Object.assign(g.options, { tileSet: 'standard', tiles, input: 'controller' });
    Object.assign(g.s, { mapId: 1, level: 0, x: 15, y: 20 });
    await enterTown(g, true);
    g.inPlay = true;
    Object.assign(g.s, { x: 15, y: 20 });
    setTileAt(g, 15, 19, tile9);
    // What the screen was told of its frame: the boxes over the map, the copper on or off, the boxes of its own.
    const boxes: ([number, number, number, number] | null)[] = [];
    const chrome: string[] = [];
    Object.assign(p.draw, {
      chromeBox: (r: [number, number, number, number] | null) => boxes.push(r),
      chrome: (on: boolean, _row?: number, only?: number[]) => chrome.push(`${on}${only ? ':' + only.join(',') : ''}`),
    });
    return { g, p, boxes, chrome };
  };

  it('opens the Appearance screen at once with the Modern PC tiles', async () => {
    const { g, p } = await beforeMirror('modern-pc');
    // Look north; the Avatar's reflection (first of the party); in the Appearance screen, Figure right once, up
    // (round) to Done, the last row, A.
    p.keys.push(K.Up, Pad.A, K.Right, K.Up, Pad.A);
    await lookCommand(g);
    expect(g.appearance.figure).toBe(1);
  });

  it('keeps the appearance on B, and opens nothing with other tiles', async () => {
    const { g, p } = await beforeMirror('modern-pc');
    p.keys.push(K.Up, Pad.A, Pad.B); // look north; the Avatar's reflection; B in the Appearance screen
    await lookCommand(g);
    expect(g.appearance).toEqual(DEFAULT_APPEARANCE);
    const other = await beforeMirror('apple2');
    other.p.keys.push(K.Up); // nothing more asked: the look is all
    await lookCommand(other.g);
    expect(other.g.appearance).toEqual(DEFAULT_APPEARANCE);
  });

  it('draws the view again after B, at a mirror and at the reflection of one being stood before (0x9e)', async () => {
    for (const tile of [0x9d, 0x9e]) {
      const { g, p, boxes } = await beforeMirror('modern-pc', tile);
      p.keys.push(K.Up, Pad.A, Pad.B);
      await lookCommand(g);
      expect(boxes[boxes.length - 1] ?? null).toBeNull(); // no box left over the map
      expect(g.menuShown).toBeNull();
      expect(g.appearance).toEqual(DEFAULT_APPEARANCE);
      expect(g.viewDirty).toBe(0); // the view was drawn again
    }
  });

  it('tells the tile art where the party’s leader stands each time the view is drawn, for the mirror he is before', async () => {
    const { g, p } = await beforeMirror('modern-pc');
    const leaders: unknown[] = [];
    p.draw.leader = (at) => void leaders.push(at);
    drawView(g);
    expect(leaders).toEqual([{ map: 0x100 + g.s.mapId * 16 + (g.s.level & 0xf), x: 15, y: 20 }]);
  });

  it('opens it at the reflecting mirror (0x9e) too', async () => {
    const { g, p } = await beforeMirror('modern-pc', 0x9e);
    p.keys.push(K.Up, Pad.A, K.Right, K.Up, Pad.A);
    await lookCommand(g);
    expect(g.appearance.figure).toBe(1);
  });

  it('leaves the appearance alone when the Appearance screen is given up, and the game’s screen as it was', async () => {
    const { g, p, boxes, chrome } = await beforeMirror('modern-pc');
    p.keys.push(K.Up, Pad.A, K.Right, Pad.B);
    await lookCommand(g);
    expect(g.appearance).toEqual(DEFAULT_APPEARANCE);
    expect(boxes[boxes.length - 1]).toBeNull();
    expect(chrome[chrome.length - 1]).toBe('true'); // the frame's copper on again
  });

  it('lays the Appearance screen out in play as at the title: its box above the room, the screen cleared', async () => {
    const { g, p, chrome } = await beforeMirror('modern-pc');
    const cleared: number[][] = [];
    p.draw.fill = (x1, y1, x2, y2) => void cleared.push([x1, y1, x2, y2, p.draw.pen]);
    p.keys.push(K.Up, Pad.A, Pad.B);
    await lookCommand(g);
    expect(cleared).toContainEqual([0, 0, 319, 199, 0]);
    // The copper let go, then the menu's own frame - text rows 2 to 10 in the title's arrangement, whose frame runs
    // from row 1 to 11 - above the room's box (from EGA row 0x80), and the copper back on after.
    expect(chrome[0]).toMatch(/^false$/);
    const frame = chrome
      .find((c) => c.startsWith('true:'))!
      .slice(5)
      .split(',')
      .map(Number);
    expect(frame[1]).toBe(8);
    expect(frame[3]).toBeLessThan(0x80);
    expect(chrome[chrome.length - 1]).toBe('true');
  });

  it('asks whose reflection only where the Avatar is not alone, and opens at once where they are', async () => {
    const { g, p } = await beforeMirror('modern-pc');
    g.s.partySize = 1;
    p.keys.push(K.Up, K.Right, K.Up, Pad.A); // no question: the Figure row first
    await lookCommand(g);
    expect(g.appearance.figure).toBe(1);
  });

  it("dresses a companion of the party in the mirror: their colours only, kept apart from the Avatar's", async () => {
    const { g, p } = await beforeMirror('modern-pc');
    const shamino = g.s.members[1].name;
    let title = '';
    let first = '';
    const avatarDrawn: (number | undefined)[] = [];
    // The screen as the figure is drawn again for each change: its title and first row, once it has drawn its rows.
    p.draw.avatar = (_look, _lady, base) => {
      avatarDrawn.push(base);
      if (g.menuShown?.title === shamino && !title) [title, first] = [g.menuShown.title, g.menuShown.labels[0]];
    };
    // Look north; the second of the party; Skin right once; up (round) to Done; A.
    p.keys.push(K.Up, K.Down, Pad.A, K.Right, K.Up, Pad.A);
    await lookCommand(g);
    expect(title).toBe(shamino);
    expect(first).toMatch(/^Skin/); // no Figure row: the trade is theirs
    expect(g.companionLooks.get(shamino)?.skin).toBe(DEFAULT_APPEARANCE.skin + 1);
    expect(g.appearance).toEqual(DEFAULT_APPEARANCE);
    expect(avatarDrawn[0]).toBe(0x148); // the fighter he walks as, in the Avatar's place
    expect(avatarDrawn.at(-1)).toBeUndefined(); // and the Avatar the Avatar again
  });
});
