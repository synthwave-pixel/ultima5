import { describe, expect, it } from 'vitest';
import type { ChromeTone } from '../src/ui/framebuffer.ts';
import { Pad } from '../src/game/io.ts';
import { choose, confirm } from '../src/game/menu.ts';
import { newGame } from './helpers.ts';

/**
 * The Standard look at the title: its frame copper, the dialogs over it in the overworld's blue, a question that
 * warns (Are you sure?) in a Shadowlord's purple. In play a dialog keeps the frame's tone of where the party is.
 */
describe("the title's dialogs, in tones of their own", () => {
  const watched = () => {
    const { g, p } = newGame();
    const tones: (ChromeTone | undefined)[] = [];
    g.draw.chrome = (_on, _row, only, tone) => {
      if (only) tones.push(tone);
    };
    return { g, p, tones };
  };

  it('frames a menu at the title in the overworld blue', async () => {
    const { g, p, tones } = watched();
    g.inPlay = false;
    p.keys.push(Pad.B);
    await choose(g, 'Manage Saves', [{ label: 'Export' }, { label: 'Import' }], 0, true);
    expect(tones.length).toBeGreaterThan(0);
    for (const t of tones) expect(t).toMatchObject({ hue: 215 });
  });

  it('frames an Are you sure? at the title in purple, boxed or in the Settings panel', async () => {
    for (const boxed of [true, false]) {
      const { g, p, tones } = watched();
      g.inPlay = false;
      p.keys.push(Pad.B);
      await confirm(g, 'Delete Rowan and all their saves?', boxed);
      expect(tones.length, `boxed ${boxed}`).toBeGreaterThan(0);
      expect(tones[tones.length - 1], `boxed ${boxed}`).toMatchObject({ hue: 285 });
    }
  });

  it('goes back to blue for the menu after the question', async () => {
    const { g, p, tones } = watched();
    g.inPlay = false;
    p.keys.push(Pad.B, Pad.B);
    await confirm(g, 'Forget the installed files?', true);
    tones.length = 0;
    await choose(g, 'Manage Saves', [{ label: 'Export' }], 0, true);
    for (const t of tones) expect(t).toMatchObject({ hue: 215 });
  });

  it('leaves a question in play to the frame where the party is', async () => {
    const { g, p, tones } = watched();
    g.inPlay = true;
    p.keys.push(Pad.B);
    await confirm(g, 'Save the game and leave off playing?');
    expect(tones).toEqual([]);
  });
});
