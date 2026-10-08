import { describe, expect, it } from 'vitest';
import { Colour } from '../src/ui/colours.ts';
import { journeyOnward } from '../src/game/run.ts';
import { type Line, replaced, wareCard } from '../src/game/shopCard.ts';
import { attackOf } from '../src/game/readyCard.ts';
import { readyFromPack } from '../src/game/zstats.ts';
import { newGame } from './helpers.ts';

const text = (l: Line): string => l.map((r) => r.text).join('');

/**
 * What the member has on, by place (helm, armour, the two hands, ring, amulet): 0xff for nothing. Each a way of
 * being armed the card must weigh a ware against - the swords that are not as their numbers say among them.
 */
const LOADOUTS: Record<string, number[]> = {
  'nothing at all': [0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
  'a glass sword': [0xff, 0x09, 0x27, 0xff, 0xff, 0xff],
  'the sword of chaos (two hands)': [0x02, 0x0d, 0x23, 0xff, 0xff, 0xff],
  'the jeweled sword and jewel shield': [0x00, 0x0a, 0x28, 0x08, 0xff, 0xff],
  'the mystic arms and a spiked helm': [0x03, 0x0f, 0x29, 0xff, 0xff, 0xff],
  'a main gauche and a short sword': [0x00, 0x0b, 0x14, 0x17, 0xff, 0xff],
  'a bow': [0xff, 0x0a, 0x1a, 0xff, 0xff, 0xff],
  'a magic axe and a magic shield': [0x01, 0x0c, 0x26, 0x07, 0xff, 0xff],
  'a halberd': [0x02, 0x0e, 0x22, 0xff, 0xff, 0xff],
  'a sling, a ring and an amulet': [0xff, 0x09, 0x11, 0xff, 0x2a, 0x2d],
  'a dagger and a spiked shield': [0x03, 0x0b, 0x10, 0x06, 0x2c, 0x2e],
};

/** A new game with Shamino (member 1) armed so, strong enough for anything, the party with arrows and quarrels. */
function armed(equips: number[]) {
  const { g } = newGame();
  journeyOnward(g);
  const s = g.s;
  s.members[1].equips.set(equips);
  s.members[1].str = 99;
  s.equipment.fill(0);
  s.equipment[0x1b] = s.equipment[0x1d] = 10;
  return g;
}

describe('an armoury’s card, every ware against every way of being armed', () => {
  for (const [name, equips] of Object.entries(LOADOUTS)) {
    it(`fits the panel, and reckons each number against what readying it would put away, for ${name}`, async () => {
      for (let item = 0; item < 0x30; item++) {
        const g = armed(equips);
        const { rows, note } = wareCard(g, 1, item);
        const where = `${name}: ware ${item.toString(16)}`;
        expect(rows.length, where).toBeLessThanOrEqual(6);
        for (const l of [...rows, note]) {
          expect(text(l).length, `${where}: "${text(l)}"`).toBeLessThanOrEqual(15);
          expect(text(l), where).not.toMatch(/undefined|NaN/);
        }
        if (item === 0x1b || item === 0x1d) continue; // arrows and quarrels: what the party has, nothing replaced
        // Each number's difference is the ware's less what it replaces, green better, red worse, white the same.
        const gone = replaced(g, 1, item);
        const def = g.data.bytes(0x1634, 0x30);
        const weight = g.data.bytes(0x1aae, 0x30);
        const sum = (f: (i: number) => number): number => gone.reduce((n, i) => n + f(i), 0);
        const expected: Record<string, [number, number, boolean]> = {
          Atk: [attackOf(g, item), sum((i) => (i === 0x27 ? 0 : attackOf(g, i))), false], // a glass sword's 99 not weighed
          Def: [def[item], sum((i) => def[i]), false],
          Wt: [weight[item], sum((i) => weight[i]), true],
        };
        for (const l of rows) {
          const m = /^(Atk|Def|Wt) +(\d+) \(([+-]\d+)\)$/.exec(text(l));
          if (!m) continue;
          const [value, was, lower] = expected[m[1]];
          expect(Number(m[2]), `${where} ${m[1]}`).toBe(value);
          expect(Number(m[3]), `${where} ${m[1]} difference`).toBe(value - was);
          const diff = value - was;
          const colour = l[l.length - 1].colour;
          const want = diff === 0 ? Colour.brightWhite : (lower ? diff < 0 : diff > 0) ? Colour.brightGreen : Colour.brightRed;
          expect(colour, `${where} ${m[1]} colour`).toBe(want);
        }
        // What the card says it replaces is what readying it puts back in the pack, no more and no less.
        g.s.equipment[item] = 1;
        const before = [...g.s.members[1].equips].filter((v) => v !== 0xff);
        if (await readyFromPack(g, 1, item, () => {})) {
          const after = [...g.s.members[1].equips];
          const off = before.filter((v) => !after.includes(v));
          expect(off.sort(), `${where}: put away`).toEqual([...gone].sort());
        }
      }
    });
  }

  it('weighs a ware against a glass sword without its 99: its sure hit and magic lost - costs said first', () => {
    // A shield in the other hand, so a long sword would take the glass sword's (a free hand it would go to instead).
    const g = armed([0xff, 0x09, 0x27, 0x04, 0xff, 0xff]);
    const { rows, note } = wareCard(g, 1, 0x1e);
    const all = [...rows, note];
    const run = (s: string) => all.flat().find((r) => r.text === s);
    expect(text(rows[0]).trim()).toBe('Glass Swrd');
    expect(all.map(text)).toContain('Atk  15 (+15)');
    expect(run('-Sure hit')?.colour).toBe(Colour.brightRed);
    expect(run('-Magic')?.colour).toBe(Colour.brightRed);
    // Its shattering, well lost, is a gain: said only where a row is left for it (none is, here).
    expect(run('-Shatters')).toBeUndefined();
    const free = armed([0xff, 0x09, 0x27, 0x04, 0xff, 0xff]);
    free.s.equipment[0x1b] = 10;
    const bow = wareCard(free, 1, 0x1a); // a bow: both hands, the shield too - its own notes
    expect([...bow.rows, bow.note].flat().find((r) => r.text === '2 hands')?.colour).toBe(Colour.brightRed);
  });

  it('shows a glass sword as what it is - one hit, one kill, one use - with no numbers', () => {
    const g = armed(LOADOUTS['a main gauche and a short sword']);
    const { rows, note } = wareCard(g, 1, 0x27);
    expect(rows.map(text).map((t) => t.trim())).toEqual(['Glass Sword', '', '1 hit', '1 kill', '1 use']);
    expect(rows[2][0].colour).toBe(Colour.brightGreen);
    expect(rows[4][0].colour).toBe(Colour.brightRed);
    expect(note).toEqual([]);
    g.s.members[1].str = 1;
    expect(text(wareCard(g, 1, 0x27).rows[5]).trim()).toBe('Too heavy');
  });

  it('never leaves the cost of the sword of chaos unsaid, however many gains it brings', () => {
    const g = armed(LOADOUTS['nothing at all']);
    const { rows, note } = wareCard(g, 1, 0x23);
    const all = [...rows, note].flat();
    expect(all.find((r) => r.text === '+Charms you')?.colour).toBe(Colour.brightRed);
  });
});
