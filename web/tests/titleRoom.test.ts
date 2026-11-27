import { describe, expect, it } from 'vitest';
import { Intro } from '../src/game/intro.ts';
import { DEFAULT_APPEARANCE } from '../src/game/appearance.ts';
import { chooseLook, ultima5Mirror } from '../src/game/appearanceMenu.ts';
import { Pad } from '../src/game/io.ts';
import { framedBox } from '../src/game/menu.ts';
import { TitleMenu, type TitleContent } from '../src/game/titleMenu.ts';
import { newGame } from './helpers.ts';

/**
 * A dialog at the title (menu.ts framedBox) is kept above the title menu's box, a row clear of its top border: the
 * room is the game's (titleMenu.ts TitleContent menuRow, or boxTop where the border is not a row under it). Ultima
 * V's is the fourteen rows it always had; a box whose border is row 12 (Ultima IV's) leaves eleven.
 */
describe("a dialog over the title's box", () => {
  /** The frame (EGA pixels, inclusive) of a dialog six lines tall, at the title of the game whose content `title` makes. */
  const frameAt = (title: (g: ReturnType<typeof newGame>['g']) => void): number[] => {
    const { g } = newGame();
    title(g);
    g.inPlay = false;
    let rect: number[] = [];
    g.draw.chrome = (_on, _row, only) => {
      if (only) rect = [...only];
    };
    framedBox(g, 'Delete whom?', 10, 6);
    return rect;
  };
  const content = (over: Partial<TitleContent>): TitleContent => ({ menuRow: 112, ...over }) as unknown as TitleContent;

  it("keeps Ultima V's where it always was: fourteen rows above its box", () => {
    expect(frameAt((g) => new Intro(g))).toEqual([112, 16, 207, 95]);
    expect(frameAt((g) => new TitleMenu(g, content({ menuRow: 112 })))).toEqual([112, 16, 207, 95]);
  });

  it('keeps a box whose top border is row 12 clear, a row between', () => {
    const rect = frameAt((g) => new TitleMenu(g, content({ menuRow: 96, boxTop: 96 })));
    expect(rect[3]).toBeLessThanOrEqual(87);
    expect(rect).toEqual([112, 0, 207, 79]);
  });
});

/**
 * The Appearance screen's box is kept above its scene (appearanceMenu.ts chooseLook, MirrorScene rect): where the
 * title's room is too short for it - Ultima IV's eleven rows, its eight rows twelve tall - it takes the screen's top,
 * its frame ending above the scene's border, not centred on the screen over the scene. Ultima V's is where it was.
 */
describe("the Appearance screen's box over the title", () => {
  /** The box's frame (EGA pixels, inclusive), at the title or in play, in the scene `rect` (null: Ultima V's own). */
  const frameOf = async (
    over: Partial<TitleContent> | null,
    rect: readonly [number, number, number, number] | null,
    who?: { name: string; base: number; lady: boolean },
    inPlay = false,
  ): Promise<number[]> => {
    const { g, p } = newGame();
    if (over) new TitleMenu(g, content(over));
    else new Intro(g);
    g.inPlay = inPlay;
    let frame: number[] = [];
    g.draw.chrome = (_on, _row, only) => {
      if (only) frame = [...only];
    };
    const own = ultima5Mirror(g);
    const scene = rect ? { ...own, rect, world: () => {}, scene: () => {}, banner: () => {} } : own;
    p.keys.push(Pad.B);
    await chooseLook(g, { ...DEFAULT_APPEARANCE }, scene, who);
    return frame;
  };
  const content = (over: Partial<TitleContent>): TitleContent => ({ menuRow: 112, ...over }) as unknown as TitleContent;
  const U4_SCENE = [8, 104, 311, 183] as const;
  const U4_TITLE = { menuRow: 96, boxTop: 96 };

  it("at Ultima IV's title, the screen's top, its frame ending above the scene's border", async () => {
    const frame = await frameOf(U4_TITLE, U4_SCENE);
    expect(frame[1]).toBe(0);
    expect(frame[3]).toBeLessThanOrEqual(U4_SCENE[1] - 9);
  });

  it("in Ultima IV's play, and for a companion (a row fewer), above the scene too", async () => {
    expect((await frameOf(U4_TITLE, U4_SCENE, undefined, true))[3]).toBeLessThanOrEqual(U4_SCENE[1] - 9);
    const who = { name: 'Iolo', base: 0x20, lady: false };
    expect((await frameOf(U4_TITLE, U4_SCENE, who))[3]).toBeLessThanOrEqual(U4_SCENE[1] - 9);
  });

  it("leaves Ultima V's where it was, at the title and in play", async () => {
    expect(await frameOf(null, null)).toEqual([64, 8, 247, 103]);
    expect(await frameOf(null, null, undefined, true)).toEqual([64, 8, 247, 103]);
    expect(await frameOf(null, null, { name: 'Iolo', base: 0x20, lady: false })).toEqual([64, 8, 247, 95]);
  });
});
