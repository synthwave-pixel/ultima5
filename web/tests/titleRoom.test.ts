import { describe, expect, it } from 'vitest';
import { Intro } from '../src/game/intro.ts';
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
