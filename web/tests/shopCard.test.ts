import { describe, expect, it } from 'vitest';
import { Colour } from '../src/ui/colours.ts';
import { journeyOnward } from '../src/game/run.ts';
import { type Line, sortWares, standing, wareCard } from '../src/game/shopCard.ts';
import { newGame } from './helpers.ts';

/** A line as it reads, and the colour its difference (its last run) is in. */
const text = (l: Line | undefined): string => (l ?? []).map((r) => r.text).join('');
const tint = (l: Line | undefined): number | undefined => l?.[l.length - 1]?.colour;

/** Shamino of the new game: a short sword and a small shield in hand, ring mail, a leather helm. */
function shamino() {
  const { g } = newGame();
  journeyOnward(g);
  g.s.members[1].str = 20;
  return g;
}

const BOW = 0x1a;
const ARROWS = 0x1b;
const MAGIC_BOW = 0x24;
const LONG_SWORD = 0x1e;
const AXE_2H = 0x20;

describe('an armoury’s wares for one of the party', () => {
  it('are offered those to be had first, then those the party cannot afford, then those too heavy for them', () => {
    const g = shamino();
    const wares = [0x10, 0x11, BOW, ARROWS, 0x1c, 0x1d, MAGIC_BOW];
    g.s.gold = 100;
    g.s.members[1].str = 10; // with the ring mail and the shield kept on, the bow is too much for him
    const price = (item: number): number => (item === MAGIC_BOW ? 1000 : 10);
    expect(sortWares(g, 1, wares, price)).toEqual([0x10, 0x11, ARROWS, 0x1c, 0x1d, MAGIC_BOW, BOW]);
    // Too heavy and too dear both: too heavy is what it says.
    expect(standing(g, 1, BOW, 1000)).toBe(2);
  });

  it('weighs a sword against the sword it would replace: better green, worse red', () => {
    const g = shamino();
    const { rows, note } = wareCard(g, 1, LONG_SWORD);
    expect(rows.map(text).map((s) => s.trim())).toEqual(['Sht. Sword', 'vs', 'Long Sword', 'Atk  15 (+3)', 'Wt    9 (+4)']);
    expect(tint(rows[3])).toBe(Colour.brightGreen);
    expect(tint(rows[4])).toBe(Colour.brightRed); // heavier is worse
    expect(note).toEqual([]);
  });

  it('weighs a two-handed axe against the sword and the shield both, and says the shield must go', () => {
    const g = shamino();
    const { rows, note } = wareCard(g, 1, AXE_2H);
    expect(text(rows[0]).trim()).toBe('Sht. Sword+Shld');
    expect(rows.slice(3).map(text)).toEqual(['Atk  20 (+8)', 'Def   0 (-2)', 'Wt   15 (+8)']);
    expect(tint(rows[4])).toBe(Colour.brightRed);
    // No row left above the food and gold: the note goes under them.
    expect(text(note)).toBe('2 hands');
    expect(tint(note)).toBe(Colour.brightRed);
  });

  it('says Too heavy in the stat block, and what a weapon brings beyond its numbers in green', () => {
    const g = shamino();
    g.s.members[1].str = 5;
    const { rows } = wareCard(g, 1, LONG_SWORD);
    // A sword for a sword: two numbers, so the note has a row of its own in the block.
    expect(text(rows[5])).toBe('Too heavy');
    expect(tint(rows[5])).toBe(Colour.brightRed);
    g.s.members[1].str = 30;
    const magicAxe = wareCard(g, 1, 0x26);
    const all = [...magicAxe.rows, magicAxe.note].map(text).join('|');
    expect(all).toContain('+Returns');
    expect(all).toContain('+Magic');
  });

  it('shows the same as the same: (+0), in white', () => {
    const g = shamino();
    const { rows } = wareCard(g, 1, 0x17); // a short sword against his short sword
    expect(text(rows[3])).toBe('Atk  12 (+0)');
    expect(tint(rows[3])).toBe(Colour.brightWhite);
  });

  it('weighs arrows against nothing: how many the party has', () => {
    const g = shamino();
    g.s.equipment[ARROWS] = 7;
    const { rows } = wareCard(g, 1, ARROWS);
    expect(rows.map(text).map((s) => s.trim())).toEqual(['Arrows', 'Arrows had 7']);
  });
});

describe('the card on the party panel', () => {
  it('leaves the row under the food and gold blank where it has nothing to say - no date there', async () => {
    const { drawWareCard } = await import('../src/game/shopCard.ts');
    const g = shamino();
    g.options.tileSet = 'standard';
    const s = g.s;
    const date = `${s.month}-${s.day}-${String(s.year).padStart(3, '0')}`;
    const { holdFullPanel } = await import('../src/game/layout.ts');
    holdFullPanel(g); // the panel at its full height, as the shop has it while the card is up
    // The full panel's date, where 1988 has it under the food and gold (frame.ts drawVitals).
    const { Win } = await import('../src/game/frame.ts');
    g.text.select(Win.stats);
    g.text.moveTo(3, 8);
    g.print(date);
    drawWareCard(g, 1, LONG_SWORD);
    // The party's panel (the border's date below the map is the one meant to be seen).
    const panel = Array.from({ length: 12 }, (_, r) => g.text.screenText(r, 24, 39)).join('\n');
    expect(panel).toContain('Long Sword');
    expect(panel).not.toContain(date);
  });
});
