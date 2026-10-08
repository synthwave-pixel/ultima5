import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { merchant } from '../src/game/shops.ts';
import { newGame } from './helpers.ts';

/** An armoury's Buy list, sorted again after a purchase: the bar stays on the ware bought (shops.ts buyArmsFor). */
describe("an armoury's wares, bought one after another", () => {
  it('come back with the bar on the ware just bought, wherever the sorting has put it', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    s.mapId = g.data.bytes(0x23ca, 16)[0];
    s.gold = 5000;
    s.members[0].str = 30; // strong enough to carry any of them: only the gold sorts them
    s.townAir = 0xff; // a towne no Shadowlord is in: the change is not short (shops.ts shortChange)
    g.options.input = 'controller';
    let chosen = '';
    let again = '';
    p.next = () => {
      const m = g.menuShown;
      if (!m) return Pad.A;
      if (m.title === 'Buy') {
        if (!chosen) {
          // The bow, bought with all but 20 of the party's gold: after it what costs 20 or less is still to be had, and
          // the list sorts again with the arrows above it.
          const i = m.labels.findIndex((l) => l.startsWith('Bow '));
          if (m.at !== i) return m.at < i ? K.Down : K.Up;
          s.gold = Number(/(\d+)g$/.exec(m.labels[i])![1]) + 20;
          chosen = m.labels[i].slice(0, 13).trim();
          return Pad.A;
        }
        if (!again) again = m.labels[m.at].slice(0, 13).trim();
        return Pad.B;
      }
      if (m.title === 'Who is buying?') return chosen ? Pad.B : Pad.A;
      // Yes to the purchase; anything else after it (readying it), the first.
      return Pad.A;
    };
    await merchant(g, 0x81);
    expect(chosen).not.toBe('');
    expect(again).toBe(chosen);
  });
});
