import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { SPELL_EFFECTS } from '../src/game/magic.ts';
import { recipe } from '../src/game/magicPanel.ts';
import { journeyOnward } from '../src/game/run.ts';
import { REAGENT_USES, reagentUseLines } from '../src/game/shopCard.ts';
import { merchant } from '../src/game/shops.ts';
import { newGame } from './helpers.ts';

/**
 * The apothecary's card (shopCard.ts drawReagentCard): while the bar is on a reagent in the Choose list, the party
 * panel shows its name, how many the party holds, a lot's price under that, and what kind of spells it goes into.
 */
describe("the apothecary's reagent card", () => {
  it('shows the reagent under the bar over the party, its count held, its lot under that, and its spells', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    g.options.input = 'controller';
    s.mapId = g.data.bytes(0x23ca + 4 * 16, 16)[0]; // the first place with an apothecary
    s.reagents.fill(0);
    s.reagents[1] = 12; // ginseng
    const names = g.data.table(0x3c20, 8);
    const prices = g.data.bytes(0x3a32 + (s.mapId - 1) * 8, 8);
    const panels: { at: number; text: string }[] = [];
    let chose = false;
    p.next = () => {
      const m = g.menuShown;
      if (!m) return Pad.A;
      if (m.title === 'Choose') {
        panels.push({ at: m.at, text: p.rows.map((r) => r.join('')).join('\n') });
        if (!chose && m.at < m.labels.length - 1) return K.Down;
        chose = true;
        return Pad.B;
      }
      return chose ? Pad.B : Pad.A;
    };
    await merchant(g, 0x85);
    const sold = [...prices.keys()].filter((i) => prices[i] !== 0);
    expect(panels.length).toBeGreaterThanOrEqual(sold.length);
    for (const { at, text } of panels.slice(0, sold.length)) {
      const r = sold[at];
      expect(text, names[r]).toContain(`${names[r].trim()}:`);
      expect(text).toContain(`Held: ${s.reagents[r]}`);
      expect(text).not.toMatch(/In \d+ spells/);
      // The lot's price on the row under the count held.
      const rows = text.split('\n');
      const held = rows.findIndex((row) => row.includes('Held:'));
      expect(rows[held + 1]).toMatch(/\d+ for \d+gp/);
    }
    // Left, the party is on the panel again: no reagent's name on its border.
    expect(p.rows.map((r) => r.join('')).join('\n')).not.toMatch(new RegExp(`${names[sold[0]].trim()}:`));
  });

  it("says what each reagent's spells are, as their recipes have it", () => {
    const { g } = newGame();
    const spellsOf = (r: number): string[] =>
      [...Array(0x30).keys()].filter((sp) => recipe(g, sp).includes(r)).map((sp) => SPELL_EFFECTS[sp].toLowerCase());
    // A spell of each kind named, among that reagent's.
    const kinds: string[][] = [
      ['light', 'fire bolt', 'fire field', 'magic lock'],
      ['heal', 'cure poison', 'awaken', 'create food'],
      ['protection', 'cure poison', 'repel undead', 'negate magic'],
      ['sleep field', 'sleep', 'charm', 'heal'],
      ['blink', 'up a level', 'magic lock', 'quickness'],
      ['magic missile', 'fire bolt', 'death bolt', 'energy field'],
      ['poison field', 'sleep', 'charm', 'invisibility'],
      ['resurrect', 'time stop', 'fire storm', 'gate travel'],
    ];
    expect(REAGENT_USES).toHaveLength(8);
    // Each in the four rows the card has under its count and price.
    for (let r = 0; r < 8; r++) expect(reagentUseLines(r).length, REAGENT_USES[r]).toBeLessThanOrEqual(4);
    kinds.forEach((spells, r) => {
      for (const sp of spells) expect(spellsOf(r), `${g.data.table(0x3c20, 8)[r]}: ${sp}`).toContain(sp);
    });
  });
});
