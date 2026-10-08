import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { merchant } from '../src/game/shops.ts';
import { newGame } from './helpers.ts';

/** A healer asked to heal one who is whole says so, in the game's own words (shops.ts healer). */
describe('a healer', () => {
  it('tells a member already whole there is no need of the art', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    g.options.input = 'controller';
    s.mapId = 30; // the Lycaeum
    const whole = s.members[0];
    for (const m of s.members) m.hp = m.maxHp; // nobody hurt: the bar on the first, the Avatar
    let asked = 0;
    p.next = () => {
      const m = g.menuShown;
      if (!m) return Pad.A; // the member: the first, the Avatar
      const to = (i: number): number => (m.at === i ? Pad.A : m.at < i ? K.Down : K.Up);
      const heal = m.labels.findIndex((l) => l.startsWith('Heal ('));
      if (heal >= 0) return to(heal);
      return to(m.labels.indexOf(asked++ === 0 ? 'Yes' : 'No'));
    };
    await merchant(g, 0x87);
    expect(p.log.replace(/\s+/g, ' ')).toMatch(/Thou hast no need of this art!/);
    expect(whole.hp).toBe(whole.maxHp);
  });
});
