import { describe, expect, it } from 'vitest';
import { Pad } from '../src/game/io.ts';
import { getCommandKey } from '../src/game/input.ts';
import { choose } from '../src/game/menu.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/** B that backs out of a menu, then B again at once at the command prompt: the same press come twice (input.ts). */
describe('a B on the heels of one that backed out', () => {
  const game = () => {
    const { g, p } = newGame();
    journeyOnward(g);
    g.options.input = 'controller';
    let clock = 1000;
    p.now = () => clock;
    return { g, p, at: (t: number) => (clock = t) };
  };

  it('is ignored at the prompt, where the next press is answered', async () => {
    const { g, p, at } = game();
    p.keys.push(Pad.B);
    expect(await choose(g, 'Test', [{ label: 'One' }, { label: 'Two' }])).toBe(-1);
    at(1100); // a tenth of a second on
    p.keys.push(Pad.B, Pad.X);
    expect(await getCommandKey(g, 'outdoors')).toBe(0x41); // the X's attack, the B passed over
  });

  it('passes the turn when it comes later', async () => {
    const { g, p, at } = game();
    p.keys.push(Pad.B);
    await choose(g, 'Test', [{ label: 'One' }]);
    at(1600);
    p.keys.push(Pad.B);
    expect(await getCommandKey(g, 'outdoors')).toBe(0x20); // Space: pass
  });
});
