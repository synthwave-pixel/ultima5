/**
 * magicPanel.ts
 *
 * The party panel while magic is chosen (the port's): with a spell to cast or mix in view, the panel shows each
 * member's mana where their hit points were (frame.ts memberLine, Game.panelMana) - the Standard look naming it Mana
 * on the border, the whole line grey for one who casts nothing - and, while a spell list is open, the spell's card
 * over the party: its words, the
 * mixtures made and its cost in mana (grey where the caster has not the mana), its circle (grey where the caster - or,
 * mixing, anyone of the party who casts - has not reached it), and its reagents with the party's stock of each (grey
 * where there is none). Everything on it is read from the player's own files.
 */

import type { Game } from './game.ts';
import { compactPanel, drawVitals, Win } from './frame.ts';
import { isCaster } from './rest.ts';
import { Status } from './save.ts';
import { Colour } from '../ui/colours.ts';

/** The panel's width in letters. */
const W = 15;

/**
 * A spell's words, whole ("In Vas Por Ylem"): the game keeps its spells' names cut to ten letters ("In Vas P Y"), and
 * each of its twenty-six syllables begins with its own letter, so each cut word is the syllable its letter begins.
 */
export function spellWords(g: Game, spell: number): string {
  const syllables = g.data.table(0x1bfc, 26).map((w) => w.trim());
  const title = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  return (g.data.table(0x19e2, 0x31)[spell] ?? '')
    .trim()
    .split(/\s+/)
    .map((cut) => title(syllables.find((w) => w.charAt(0).toUpperCase() === cut.charAt(0).toUpperCase()) ?? cut))
    .join(' ');
}

/** A spell's reagents, by their number (0 Sulfurous Ash .. 7 Mandrake Root). */
export function recipe(g: Game, spell: number): number[] {
  const mask = g.data.bytes(0x1cc0, 0x30)[spell];
  return [...Array(8).keys()].filter((r) => (mask & (0x80 >> r)) !== 0);
}

/** How many of `spell` the party's reagents make, within the 99 a mixture holds. */
export function makeable(g: Game, spell: number): number {
  const s = g.s;
  const most = Math.min(...recipe(g, spell).map((r) => s.reagents[r]));
  return Math.max(0, Math.min(most, 99 - s.mixtures[spell]));
}

/**
 * The spell's card on the party panel: its words, the mixtures made and its cost, then its reagents - four in the
 * party's box, a fifth and sixth (Clone, Resurrect) over the food and the date below. `caster` is who would cast it
 * (the cost grey where they have not the mana), or -1 (mixing: no one).
 */
export function drawSpellCard(g: Game, spell: number, caster: number): void {
  const s = g.s;
  const t = g.text;
  const was = t.current;
  const fg = t.win.fg;
  drawVitals(g, false); // the food and date below, where the card leaves them
  t.select(Win.stats);
  const line = (row: number, text: string, colour: number): void => {
    t.moveTo(0, row);
    t.win.fg = colour;
    g.print(text.padEnd(W).slice(0, W));
  };
  const words = spellWords(g, spell);
  line(0, words.padStart((W + words.length) >> 1), Colour.brightWhite);
  const circle = Math.trunc(spell / 6) + 1;
  const mixed = s.mixtures[spell];
  const cost = `${circle} MP`;
  const names = g.data.table(0x19d2, 8);
  const parts = recipe(g, spell);
  // The Standard panel's own height has the food's row for a fifth reagent (Clone); the 1988 height, the food's and
  // the date's below its divider for a fifth and sixth (Resurrect - the spell list gives it the full height,
  // pickSpell). Under the words, the mixtures made and the cost, then the circle; where a recipe would not fit under
  // both (Resurrect's six), the mixtures give way - the list's label has their count ("Resurrect x2").
  const rows = compactPanel(g) ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 7, 8];
  const room = rows.length - 2;
  const head = parts.length > room ? ['circle'] : ['mixed', 'circle'];
  const at = rows.slice(head.length);
  for (const r of rows) line(r, '', Colour.brightWhite);
  // The Standard look leaves the food and gold off while a card is up: the panel is about the spell.
  if (g.options.tileSet === 'standard') line(compactPanel(g) ? 6 : 7, '', Colour.brightWhite);
  // Grey where the caster (or, mixing, no one of the party who casts) has not reached the circle, or the mana.
  const reached =
    caster >= 0
      ? s.members[caster].level >= circle
      : [...Array(s.partySize).keys()].some((m) => isCaster(g, m) && s.members[m].status !== Status.Dead && s.members[m].level >= circle);
  const head0 = rows[0];
  if (head[0] === 'mixed') {
    line(head0, `Mixed ${mixed}`, mixed ? Colour.brightWhite : Colour.darkGray);
    t.moveTo(W - cost.length, head0);
    t.win.fg = caster < 0 || s.members[caster].mp >= circle ? Colour.brightWhite : Colour.darkGray;
    g.print(cost);
    line(rows[1], `Circle ${circle}`, reached ? Colour.brightWhite : Colour.darkGray);
  } else {
    line(head0, `Circle ${circle}`, reached ? Colour.brightWhite : Colour.darkGray);
    t.moveTo(W - cost.length, head0);
    t.win.fg = caster < 0 || s.members[caster].mp >= circle ? Colour.brightWhite : Colour.darkGray;
    g.print(cost);
  }
  parts.forEach((r, i) => {
    if (at[i] !== undefined)
      line(at[i], names[r].trim().padEnd(W - 3) + String(s.reagents[r]).padStart(3), s.reagents[r] ? Colour.brightWhite : Colour.darkGray);
  });
  t.win.fg = fg;
  t.select(was);
}

/** The party panel in its mana view while `run` runs (the caster being chosen), then as it was. */
export async function withManaPanel<T>(g: Game, run: () => Promise<T>): Promise<T> {
  const was = g.panelMana;
  g.panelMana = true;
  drawVitals(g);
  try {
    return await run();
  } finally {
    g.panelMana = was;
    drawVitals(g);
  }
}
