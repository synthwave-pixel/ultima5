import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { choose } from '../src/game/menu.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/** Left and right in a list (menu.ts choose): a page in one too long to show whole, a line in one that is not. */
describe('left and right in a list', () => {
  const game = () => {
    const { g, p } = newGame();
    journeyOnward(g);
    g.options.input = 'controller';
    return { g, p };
  };
  const long = Array.from({ length: 48 }, (_, i) => ({ label: `Spell ${i}` }));

  it('turn a page in a long list, stopping at its end, and from the end go round', async () => {
    const { g, p } = game();
    const seen: number[] = [];
    const keys = [K.Right];
    p.next = () => {
      const at = g.menuShown!.at;
      seen.push(at);
      // Right to the end, Right once more (round to the start), then Left (round to the end), then B.
      if (seen.length > 1 && at === 0) return seen.includes(-1) ? Pad.B : (seen.push(-1), K.Left);
      if (seen.includes(-1)) return Pad.B;
      return keys[0];
    };
    await choose(g, 'Spells', long);
    const page = seen[1];
    expect(page).toBeGreaterThan(5);
    const forward = seen.slice(0, seen.indexOf(47) + 1);
    expect(forward).toEqual([...Array(Math.ceil(47 / page)).keys()].map((n) => n * page).concat(47));
    expect(seen.slice(forward.length)).toEqual([0, -1, 47]); // round to the start, then Left round to the end
  });

  it('move a line in a short one, as up and down do', async () => {
    const { g, p } = game();
    p.keys.push(K.Right, K.Right, Pad.A);
    expect(await choose(g, 'Short', [{ label: 'One' }, { label: 'Two' }, { label: 'Three' }])).toBe(2);
  });
});
