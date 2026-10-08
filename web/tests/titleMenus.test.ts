import { describe, expect, it } from 'vitest';
import { chooseAppearance } from '../src/game/appearanceMenu.ts';
import { K, Pad } from '../src/game/io.ts';
import { box, letterPicker, settingsMenu, titleShown } from '../src/game/menu.ts';
import { newGame } from './helpers.ts';

/** The title's menus and dialogs, where no game is being played (Game.inPlay false). */
describe('the menus at the title', () => {
  it('put no map or party stats up on coming back from Gameplay to Settings', async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    let went = false;
    let backs = 0;
    p.next = () => {
      const m = g.menuShown!;
      if (m.title === 'Settings' && !went) {
        if (m.labels[m.at] !== 'Gameplay') return K.Down;
        went = true;
        return Pad.A;
      }
      return ++backs > 4 ? undefined : Pad.B;
    };
    await settingsMenu(g, true);
    expect(went).toBe(true);
    // The party's names are what the stats would print.
    expect(p.log).not.toContain('Shamino');
  });

  it('keep the title’s own boxes after the letter picker - the Appearance screen at the top, not low over the room', async () => {
    const { g, p } = newGame();
    titleShown(); // the title drawn, as before a character is made
    p.keys.push(Pad.B); // nothing picked: the picker gives back nothing
    await letterPicker(g, true, false);
    box(g, 'Appearance', 18, 6);
    // The title's own box, high above the scenes' room (menu.ts framedBox), not the map's square's, low in it.
    expect(g.text.win.top).toBeLessThan(8);
  });

  it('name the Appearance screen’s room The Mirror in the border under it, at the title', async () => {
    const { g, p } = newGame();
    titleShown();
    p.keys.push(Pad.B); // backed out of at once
    await chooseAppearance(g, g.appearance);
    expect(p.log).toContain('The Mirror');
  });
});

/** The letter picker a controller types with (menu.ts letterPicker). */
describe('the letter picker', () => {
  const typed = (result: number[]): string => String.fromCharCode(...result.filter((c) => c !== K.Enter));

  it('switches the case with Y and rubs out with X; the case has a row of its own, down from Space', async () => {
    const { g, p } = newGame();
    const down = (n: number): number[] => Array<number>(n).fill(K.Down);
    p.keys.push(
      Pad.A, // A
      Pad.Y, // to lower case
      Pad.A, // a
      Pad.X, // rubbed out
      ...down(4), // Space
      K.Down, // the case's row, below Space
      Pad.A, // to upper case again
      ...Array<number>(5).fill(K.Up), // back up to the letters' first row
      Pad.A, // A
      ...down(4),
      K.Right,
      K.Right, // Done
      Pad.A,
    );
    expect(typed(await letterPicker(g, true, false))).toBe('AA');
  });

  it('has no case row nor Y for a word in capitals: down from Space is the letters again', async () => {
    const { g, p } = newGame();
    p.keys.push(Pad.Y, ...Array<number>(5).fill(K.Down), Pad.A, ...Array<number>(4).fill(K.Down), K.Right, K.Right, Pad.A);
    expect(typed(await letterPicker(g, false, false))).toBe('A');
  });
});
