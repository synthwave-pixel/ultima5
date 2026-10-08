/**
 * placeNames.ts
 *
 * The places whose names the party has learnt, for the map (mapMarks.ts labelOf): a place is learnt when the party
 * goes in (Enter, outdoors), or when someone names it in the party's hearing. Till then the map calls it only what
 * the cloth map shows of it - "Towne?" - as the box's map drew a towne there without saying which.
 *
 * Heard means said in so many words: a towne, keep or lighthouse by its name ("Yew", "Bordermarch"); a dungeon only
 * where the word dungeon goes with it, since "shame" and "wrong" are said for themselves too; a hut by its keeper
 * and the word hut; a shrine by its virtue and the word shrine; the two great houses by their lords and the word
 * castle or palace.
 */

import { readLocations, SETTLEMENTS } from '../data/maps.ts';
import type { Game } from './game.ts';

/** A place as it is listened for: its key in Fog.named, and the words that name it - one of each group, all groups. */
interface Listening {
  key: string;
  need: string[][];
}

/** Text as it is listened to: lower case, no apostrophes, every run of anything not a letter one space, padded. */
const plain = (text: string): string =>
  ` ${text
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z]+/g, ' ')
    .trim()} `;

/** What else a place is called, beside its own name. */
const ALSO: Record<string, string[]> = {
  'new magincia': ['magincia'],
  'empath abbey': ['empath'],
};

const listening = new WeakMap<object, Listening[]>();

function placesListenedFor(g: Game): Listening[] {
  let list = listening.get(g.data);
  if (list) return list;
  list = [];
  for (const loc of readLocations(g.data.ovl)) {
    const name = plain(loc.name).trim().replace(/^the /, '');
    const key = `place:${loc.id}`;
    if (loc.id > SETTLEMENTS) list.push({ key, need: [[name], ['dungeon', 'dungeons']] });
    else if (name.endsWith(' hut')) {
      // "Iolo's hut" is iolos hut here: its keeper, Iolo, said with the word hut; Sin Vraal said as one word too.
      const keeper = name.slice(0, -4).replace(/s$/, '');
      const one = keeper.replace(/ /g, '');
      list.push({ key, need: [[keeper, `${keeper}s`, one, `${one}s`], ['hut']] });
    } else if (name.includes('lord british')) list.push({ key, need: [['british'], ['castle']] });
    else if (name.includes('blackthorn')) list.push({ key, need: [['blackthorn'], ['palace', 'castle']] });
    else list.push({ key, need: [[name, ...(ALSO[name] ?? [])]] });
  }
  g.data.table(0x1f4e, 8).forEach((virtue, i) => {
    list.push({ key: `shrine:${i}`, need: [[plain(virtue).trim()], ['shrine', 'shrines']] });
  });
  listening.set(g.data, list);
  return list;
}

/** Every place named in something the party heard (a conversation), learnt: how many were new. */
export function heardPlaces(g: Game, text: string): number {
  const said = plain(text);
  let added = 0;
  for (const { key, need } of placesListenedFor(g)) {
    if (g.fog.named.has(key)) continue;
    if (!need.every((words) => words.some((w) => said.includes(` ${w} `)))) continue;
    g.fog.named.add(key);
    added++;
  }
  return added;
}

/**
 * Whether the party knows a place's name (`key`, as Fog.named keeps it). Fog.knowsName, and for a game saved before
 * names were kept, a shrine whose quest the altar has ordained, or that is done: the party has knelt there.
 */
export function knowsPlace(g: Game, key: string): boolean {
  if (g.fog.knowsName(key)) return true;
  const shrine = /^shrine:(\d)$/.exec(key)?.[1];
  return shrine !== undefined && ((g.s.questActive | g.s.questDone) & (1 << Number(shrine))) !== 0;
}

/** The place at (x, y) entered, its name learnt: a town, keep, hut or dungeon, or a shrine. */
export function enteredPlace(g: Game, x: number, y: number): void {
  const loc = readLocations(g.data.ovl).find((l) => l.x === x && l.y === y);
  if (loc) g.fog.named.add(`place:${loc.id}`);
  const xs = g.data.bytes(0x1f6e, 8);
  const ys = g.data.bytes(0x1f76, 8);
  // Spirituality's shrine stands on no square of Britannia (its table says 0, 0): it is reached by a moongate.
  for (let i = 0; i < 8; i++) if (xs[i] === x && ys[i] === y && (x | y) !== 0) g.fog.named.add(`shrine:${i}`);
}
