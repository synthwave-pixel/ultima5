import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { pauseMenu } from '../src/game/menu.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/** The Pause menu's saving lines, greyed, say why (menu.ts pauseMenu), the bar resting on them. */
describe("the Pause menu's greyed saving", () => {
  it('rests on Save game inside a command, saying why, and A there does nothing', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    g.options.input = 'controller';
    let note = '';
    let rested = false;
    p.next = () => {
      const m = g.menuShown;
      if (!m || m.title !== 'Paused') return Pad.B;
      const i = m.labels.indexOf('Save game');
      if (m.at !== i) return m.at < i ? K.Down : K.Up;
      if (!rested) {
        rested = true;
        note = p.rows
          .map((r) => r.join(''))
          .join(' ')
          .replace(/\s+/g, ' ');
        return Pad.A; // nothing: the list stays
      }
      return Pad.B;
    };
    await pauseMenu(g, true);
    expect(rested).toBe(true);
    expect(note).toMatch(/Not in the middle of a command/);
  });
});
