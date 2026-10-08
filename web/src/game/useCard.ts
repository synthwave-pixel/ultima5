/**
 * useCard.ts
 *
 * A thing's card on the party panel while the controller's Use list is open (the port's, the Standard look), as
 * Ready shows an armament's (readyCard.ts): its name, what it does, how many are held - and below the divider, where
 * its line is grey, why it would do nothing here and now (targets.ts whyNotHere). What each does is the port's word
 * for what the code does with it (magic.ts useCommand), never more than the game itself tells.
 */

import type { Game } from './game.ts';
import { drawVitals, Win } from './frame.ts';
import { Colour } from '../ui/colours.ts';
import { POTION_LONG, scrollEffect } from './magic.ts';
import { whyNotHere } from './targets.ts';
import { itemCounts } from './zstats.ts';

/** The panel's width in letters. */
const W = 15;

/** The rows of the panel at its full height the card is written on: above the divider, and the two below it. */
const TOP = [0, 1, 2, 3, 4, 5];
const FOOT = [7, 8];

/** What each scroll does, by its spell's effect (magic.ts scrollEffect). */
const SCROLLS: Record<string, string> = {
  'Great light': 'Lights the way for a long while.',
  'Wind change': 'Turns the wind the way thou wilt.',
  Protection: 'Wards the party in a fight.',
  'Negate magic': 'Stills all magic for a time.',
  View: 'A map of the land about.',
  'Summon daemon': 'Calls a daemon to fight for thee.',
  Resurrect: 'Raises one of the dead.',
  'Time stop': 'Foes stand still a while.',
};

/** Each potion's colour, by its number, and what it does (magic.ts usePotion). */
const COLOURS = ['Blue', 'Yellow', 'Red', 'Green', 'Orange', 'Purple', 'Black', 'White'];
const POTIONS = [
  'Wakes one asleep.',
  "Heals a member's wounds.",
  'Cures one of poison.',
  'Poisons whoever drinks it.',
  'Sends the drinker to sleep.',
  'Turns the drinker to a rat, in a fight.',
  'Hides the drinker from foes, in a fight.',
  'Shows the land all about.',
];

/** The rest, by the Use list's number. */
const THINGS: Record<number, [string, string]> = {
  0x10: ['Magic carpet', 'Flies over water, and serves as a lifeboat if the ship sinks.'],
  0x11: ['Skull keys', 'Opens a magically locked door. Each is spent.'],
  0x12: ['Amulet', "Lord British's. Use it to wear it."],
  0x13: ['Crown', "Lord British's. Use it to don it."],
  0x14: ['Sceptre', "Lord British's. Dispels strange walls and fields."],
  0x1d: ['Shard', 'Cast into the flame of its Shadowlord.'],
  0x1e: ['Shard', 'Cast into the flame of its Shadowlord.'],
  0x1f: ['Shard', 'Cast into the flame of its Shadowlord.'],
  0x20: ['Spyglass', 'Outdoors at night, shows the moons and the planets.'],
  0x21: ['HMS Cape plans', 'Aboard ship, rigs it for double speed.'],
  0x22: ['Sextant', 'Outdoors at night, tells where the party is.'],
  0x23: ['Pocket watch', 'Tells the time.'],
  0x24: ['Black Badge', "Worn, as Blackthorn's men wear it."],
  0x25: ['Sandalwood box', 'Precious to Lord British.'],
};

/** A text in lines of the panel's width, broken between words. */
function wrap(text: string, rows: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > W) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out.slice(0, rows);
}

/** The card's lines for a thing (the Use list's number): its name and what it does above, why not below. */
export function useCardLines(g: Game, item: number): { top: string[]; foot: string[] } {
  let name: string;
  let does: string;
  if (item < 8) {
    const effect = scrollEffect(g, item);
    name = effect.length <= W ? effect : 'Scroll';
    does = `Scroll. ${SCROLLS[effect] ?? ''}`;
  } else if (item < 0x10) {
    name = POTION_LONG[item - 8];
    does = `${COLOURS[item - 8]} potion. ${POTIONS[item - 8]}`;
  } else if (item > 0x14 && item < 0x1d) {
    name = `Moonstone ${item - 0x15}`;
    does = 'Buried in open ground, it raises its moongate.';
  } else [name, does] = THINGS[item] ?? [g.data.table(0x1916, 0x26)[item]?.trim() ?? '', ''];
  const count = itemCounts(g)[item] ?? 0;
  const held = count > 1 && count !== 0xff ? `Held: ${count}` : '';
  const lines = wrap(does, TOP.length - 2);
  const top = [name.padStart((W + name.length) >> 1), ...lines];
  if (held) top.push(...Array<string>(TOP.length - 1 - top.length).fill(''), held);
  const why = whyNotHere(g, item);
  const foot = why ? wrap(why, FOOT.length) : item >= 8 && item < 0x10 ? ['Not always as', 'it seems.'] : [];
  return { top, foot };
}

/** The card drawn over the party (the panel at its full height): the party's lines first, then the card over them. */
export function drawUseCard(g: Game, item: number): void {
  const t = g.text;
  const was = t.current;
  const fg = t.win.fg;
  drawVitals(g, false); // the border's title and the divider, where the card leaves them
  t.select(Win.stats);
  t.win.fg = Colour.brightWhite;
  const { top, foot } = useCardLines(g, item);
  const put = (rows: number[], lines: string[], colour: number): void =>
    rows.forEach((r, i) => {
      t.win.fg = colour;
      t.moveTo(0, r);
      g.print((lines[i] ?? '').padEnd(W).slice(0, W));
    });
  put(TOP, top, Colour.brightWhite);
  // Why not here, in grey, as the line is; a potion's warning in grey too.
  put(FOOT, foot, Colour.lightGray);
  t.win.fg = fg;
  t.select(was);
}
