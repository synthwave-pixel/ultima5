import { describe, expect, it } from 'vitest';
import { processCommand } from '../src/game/commands.ts';
import { K, Pad } from '../src/game/io.ts';
import { nextCommand } from '../src/game/outdoors.ts';
import { newGame } from './helpers.ts';

/** Under sail, a controller's buttons are the command prompt's, as on foot. */
describe('a ship under sail, on a controller', () => {
  const sailing = () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    g.s.mapId = 0;
    g.s.sailing = K.Right;
    return { g, p };
  };

  it("brings the sheets in irons with B (the space bar's command), where every button was a key none knew", async () => {
    for (const b of [Pad.B, 0x78]) {
      // B, and a keyboard's X read as B
      const { g, p } = sailing();
      p.keys.push(b);
      const key = await nextCommand(g);
      expect(key).toBe(K.Space);
      await processCommand(g, key);
      expect(g.s.sailing).toBe(0);
      expect(p.log).toMatch(/Sheets in irons!/);
      expect(p.log).not.toMatch(/What\?/);
    }
  });

  it('opens the command menu with A', async () => {
    const { g, p } = sailing();
    let shown = '';
    p.keys.push(Pad.A);
    p.next = () => {
      shown ||= g.menuShown?.title ?? '';
      return Pad.B;
    };
    await nextCommand(g);
    expect(shown).toBe('Commands');
  });
});
