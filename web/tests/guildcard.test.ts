import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { cardLines, GUILD_USES } from '../src/game/shopCard.ts';
import { merchant } from '../src/game/shops.ts';
import { newGame } from './helpers.ts';

/**
 * The guild's card (shopCard.ts drawGuildCard): while the bar is on keys, gems or torches in the Choose list, the party
 * panel shows how many the party holds, what it is for, and a lot's price - as the apothecary's does for a reagent.
 */
describe("the guild's card", () => {
  it('shows what the bar is on over the party: how many held, what it is for, its lot and price', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    g.options.input = 'controller';
    s.mapId = g.data.bytes(0x23ca + 5 * 16, 16)[0]; // the first place with a guild
    Object.assign(s, { keys: 0, gems: 7, torches: 2 });
    const panels: { at: number; text: string }[] = [];
    let chose = false;
    p.next = () => {
      const m = g.menuShown;
      if (!m) return Pad.A;
      if (m.title === 'Choose') {
        panels.push({ at: m.at, text: p.rows.map((r) => r.join('')).join('\n') });
        if (!chose && m.at < 2) return K.Down;
        chose = true;
        return Pad.B;
      }
      return chose ? Pad.B : Pad.A;
    };
    await merchant(g, 0x86);
    const seen = new Map(panels.map((x) => [x.at, x.text]));
    expect(seen.get(0)).toContain('Keys:');
    expect(seen.get(0)).toContain('Held: 0');
    expect(seen.get(0)).toMatch(/3 for \d+gp/);
    const rows = seen.get(0)!.split('\n');
    expect(rows[rows.findIndex((row) => row.includes('Held:')) + 1]).toMatch(/3 for \d+gp/); // under the count held
    expect(seen.get(1)).toContain('Gems:');
    expect(seen.get(1)).toContain('Held: 7');
    expect(seen.get(1)).toMatch(/4 for \d+gp/);
    expect(seen.get(2)).toContain('Torches:');
    expect(seen.get(2)).toContain('Held: 2');
    expect(seen.get(2)).toMatch(/5 for \d+gp/);
    // Left, the party on the panel again.
    expect(p.rows.map((r) => r.join('')).join('\n')).not.toContain('Torches:');
  });

  it("says each thing's use in the rows the card has for it", () => {
    for (const use of GUILD_USES) expect(cardLines(use).length, use).toBeLessThanOrEqual(4); // under the count and price
  });
});
