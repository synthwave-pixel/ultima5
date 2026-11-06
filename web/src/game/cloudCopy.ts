/**
 * cloudCopy.ts
 *
 * The copy made when Steam Cloud saves is turned on (the app's own saves into Steam's folder) or off (Steam's back
 * into the app's own). Both sides are the keys as kept (keyStore.ts): Steam's folder holds the same keys and values,
 * a file each. Every character is carried across with their settings block. The side copied from is never touched;
 * on the receiving side the only saves let go are the earlier ones its index no longer names once the copy is made,
 * as storage.ts lets go of those past its own limit, so that none is left behind where nothing would find it.
 * Where one side has only played on from the other, the newer is copied over the older without asking; only a
 * character played on both sides apart (on two machines, say) is a clash, for the player to choose which to keep.
 * Pure: what to write on the receiving side is worked out here, and written by whoever asked.
 */

import { CHARACTERS_KEY, charKey, listedIn, listText } from './characters.ts';
import { isSteamKey } from './keyStore.ts';
import { EARLIER, parsed, parseIndex, saveKeys, type SaveData } from './storage.ts';

type Keys = Record<string, string>;

/** A character played on both sides apart: their last save on the side copied from, and on the receiving side. */
export interface Clash {
  id: string;
  from: SaveData;
  to: SaveData;
}

/** One side's own of a character: every key of theirs Steam keeps, and their saves that read, newest first. */
interface Held {
  keys: Keys;
  saves: { key: string; data: SaveData }[];
}

/** What a copy does to the receiving side: the keys written, and the earlier saves it put out of the index. */
export interface Copy {
  writes: Keys;
  removes: string[];
}

/** What a copy does to the receiving side settled without asking, and what it must ask about first. */
export interface CopyPlan extends Copy {
  /** The characters to choose between (applyChoice), in the order of the side copied from. */
  clashes: Clash[];
  /** Each clash's two sides as they were, for applyChoice to work from. */
  sides: Record<string, { from: Held; to: Held }>;
}

/** Where every key of character `id`'s begins. */
const ownPrefix = (id: string): string => charKey(id, '');

/** The keys Steam keeps, and none of the machine's own. */
function steamOnly(side: Keys): Keys {
  return Object.fromEntries(Object.entries(side).filter(([k]) => isSteamKey(k)));
}

/**
 * Every character on a side: the list's, in its order, then any with keys kept but not on it - a list damaged, or
 * one that could not be written as they were made (characters.ts characterIds) - so that no one is passed over.
 */
function idsOn(side: Keys): string[] {
  const ids = listedIn(side[CHARACTERS_KEY] ?? null);
  for (const key of Object.keys(side)) {
    const m = /^ultima5\.char\.([^.]+)\./.exec(key);
    if (m && !ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

/** Character `id`'s own on a side: their keys, and their saves as the game reads them (storage.ts keptOf). */
function held(side: Keys, id: string): Held {
  const { last, index } = saveKeys(id)!;
  const keys = Object.fromEntries(Object.entries(side).filter(([k]) => k.startsWith(ownPrefix(id))));
  const saves: Held['saves'] = [];
  for (const key of [last, ...parseIndex(keys[index] ?? null, last).keys]) {
    const data = parsed(keys[key] ?? null);
    if (data) saves.push({ key, data });
  }
  return { keys, saves };
}

/**
 * The same save: written at the same moment, of the same game. Not the text as kept, which differs for one save kept
 * packed on one side and as plain text on the other.
 */
const same = (a: SaveData, b: SaveData): boolean => a.written === b.written && a.save === b.save;

/** Whether `d` is among a side's saves. */
const among = (d: SaveData, saves: Held['saves']): boolean => saves.some((s) => same(s.data, d));

/** Whether `key` is one of character `id`'s saves or their index, not their settings or anything else of theirs. */
function isSave(id: string, key: string): boolean {
  const { last, index } = saveKeys(id)!;
  return key === last || key === index || key.startsWith(`${last}.`);
}

/** What goes with a character's saves wherever their version is the one kept: the settings block, and any other. */
function besides(h: Held, id: string): Keys {
  return Object.fromEntries(Object.entries(h.keys).filter(([k]) => !isSave(id, k)));
}

/** A character whole, as the game reads them: their last save, their index and the earlier saves it names, and the rest. */
function whole(h: Held, id: string): Keys {
  const { last, index } = saveKeys(id)!;
  const out = besides(h, id);
  for (const key of [last, index, ...parseIndex(h.keys[index] ?? null, last).keys]) if (key in h.keys) out[key] = h.keys[key];
  return out;
}

/**
 * The receiving side's earlier saves (`b`) its index named but the one now written (naming `named`) does not: to be
 * let go, as storage.ts lets go of those it trims, or they would be kept - in Steam's folder, synced - for nothing.
 */
function displaced(b: Held, id: string, named: string[]): string[] {
  const { last, index } = saveKeys(id)!;
  return parseIndex(b.keys[index] ?? null, last).keys.filter((k) => k in b.keys && !named.includes(k));
}

/** Only what `to` does not already hold as it is: a copy of the same changes nothing, and writes nothing. */
function changes(writes: Keys, to: Keys): Keys {
  return Object.fromEntries(Object.entries(writes).filter(([k, v]) => to[k] !== v));
}

/**
 * The copy from one side's keys to the other's (`from` the side copied from, never written). For each character on
 * the side copied from: passed over where the receiving side has their last save among its own (the same, or played
 * on since); copied whole, settings block and all, where the receiving side has none of their saves, or has its last
 * among theirs (only this side played on); a clash otherwise. The list of characters is added to, never written
 * over, so a character only on the receiving side stays in reach; the saves from before characters (only read now,
 * to make characters of them: storage.ts migrate) are copied only where the receiving side has none of its own.
 */
export function planCopy(from: Keys, to: Keys): CopyPlan {
  const source = steamOnly(from);
  const target = steamOnly(to);
  const writes: Keys = {};
  const removes: string[] = [];
  const clashes: Clash[] = [];
  const sides: CopyPlan['sides'] = {};
  const theirIds = idsOn(source);
  const ourIds = idsOn(target);
  for (const id of theirIds) {
    const a = held(source, id);
    const b = held(target, id);
    if (a.saves.length === 0 || among(a.saves[0].data, b.saves)) continue;
    if (b.saves.length === 0 || among(b.saves[0].data, a.saves)) {
      const copied = whole(a, id);
      Object.assign(writes, copied);
      // Their index written over (where there is one to write), the earlier saves only the old one named go with it.
      const { last, index } = saveKeys(id)!;
      if (index in copied) removes.push(...displaced(b, id, parseIndex(copied[index], last).keys));
    } else {
      clashes.push({ id, from: a.saves[0].data, to: b.saves[0].data });
      sides[id] = { from: a, to: b };
    }
  }
  const added = theirIds.filter((id) => !ourIds.includes(id));
  if (added.length > 0) writes[CHARACTERS_KEY] = listText([...ourIds, ...added]);
  for (const [k, v] of Object.entries(source)) if (k !== CHARACTERS_KEY && !k.startsWith('ultima5.char.') && !(k in target)) writes[k] = v;
  return { writes: changes(writes, target), removes, clashes, sides };
}

/**
 * The writes for clash `id` once the player has chosen which version to keep: on the receiving side, the version kept
 * is the last save and the other its newest earlier save, in a slot of its own, with the rest of that side's earlier
 * saves after it as they were (the oldest past EARLIER let go). The settings block is the kept version's. Nothing for
 * an id not among the plan's clashes.
 */
export function applyChoice(plan: CopyPlan, id: string, keep: 'from' | 'to'): Copy {
  const pair = plan.sides[id];
  if (pair === undefined) return { writes: {}, removes: [] };
  const { from: a, to: b } = pair;
  const { last, index } = saveKeys(id)!;
  const ours = b.saves[0];
  const theirs = a.saves[0];
  const [kept, other] = keep === 'from' ? [a.keys[theirs.key], b.keys[ours.key]] : [b.keys[ours.key], a.keys[theirs.key]];
  const ix = parseIndex(b.keys[index] ?? null, last);
  // A slot no key of this side's is in or the index names, so that no save of theirs is written over.
  let n = ix.next;
  while (`${last}.${n}` in b.keys || ix.keys.includes(`${last}.${n}`)) n++;
  const slot = `${last}.${n}`;
  // The receiving side's last save may have been one of its earlier ones (its own slot would not read): now the last
  // save or the other version, it is no longer one of them, and its old slot goes.
  const keys = [slot, ...ix.keys.filter((k) => k !== ours.key)].slice(0, EARLIER);
  const writes: Keys = {
    ...(keep === 'from' ? besides(a, id) : {}),
    [last]: kept,
    [slot]: other,
    [index]: JSON.stringify({ next: n + 1, keys }),
  };
  return { writes: changes(writes, b.keys), removes: displaced(b, id, keys) };
}
