/**
 * cloudSwitch.ts
 *
 * Steam Cloud saves turned on or off from the Steam (beta) menu (steamMenu.ts): this computer's saves copied into
 * Steam's folder (on), or Steam's back into this computer's (off), as cloudCopy.ts works it out. A character played on
 * both sides apart is a clash, shown with both versions for the player to keep one; Cancel leaves everything as it
 * was. Both sides are read again before anything is written, and if either has changed since the player chose,
 * nothing is. Only the receiving side is written. The option is switched only once every write has gone through,
 * and then the game keeps its saves where the option now says; a write that fails leaves it as it was, and the
 * failure is kept for the tester report.
 */

import { applyChoice, planCopy, type Clash } from './cloudCopy.ts';
import { cardOf } from './characterMenu.ts';
import type { CloudSaves, Game } from './game.ts';
import { isSteamKey } from './keyStore.ts';
import { choose, wrap, type Item } from './menu.ts';
import { avatarName, SAVES_KEY } from './storage.ts';
import { CHARACTERS_KEY } from './characters.ts';

type Keys = Record<string, string>;

/** Whether two readings of a side hold the same saves (the machine's own keys aside), whatever their order. */
function sameSaves(a: Keys, b: Keys): boolean {
  const saves = (k: Keys): string =>
    JSON.stringify(
      Object.entries(k)
        .filter(([key]) => isSteamKey(key))
        .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)),
    );
  return saves(a) === saves(b);
}

/** Whether `key` is an index of earlier saves: a character's, or the one from before characters. */
const isIndex = (key: string): boolean => key === SAVES_KEY || /^ultima5\.char\.[^.]+\.saves$/.test(key);

/**
 * The writes in an order a failure part way can lose nothing by: first the keys the receiving side (`to`) has not yet
 * (a clash's new earlier slot, where its own version goes), then the indexes, which name only keys there by then, then
 * the keys it has, written over (a last save among them), and the list of characters last, so that it names no one not
 * yet written. Stopped at any write, the receiving side still holds every save it had (bar those the finished copy
 * lets go), in a place its index names: a last save written over before its index would leave the old one in a slot
 * nothing reads, and a copy tried again would pass the character over, its last save now the same on both sides.
 */
function inSafeOrder(writes: Keys, to: Keys): [string, string][] {
  const rank = ([key]: [string, string]): number => (key === CHARACTERS_KEY ? 3 : isIndex(key) ? 1 : key in to ? 2 : 0);
  return Object.entries(writes).sort((a, b) => rank(a) - rank(b));
}

/**
 * Which version of a clash to keep: 'from' (the side copied from) or 'to', or null for Cancel (or B). Each side's
 * last save as its card, under where it was played.
 */
async function keepWhich(g: Game, clash: Clash, on: boolean): Promise<'from' | 'to' | null> {
  const here = 'On this computer:';
  const steam = 'In Steam:';
  const said = wrap(`${avatarName(clash.from) || 'The nameless'} was played here and in Steam apart. Keep which?`);
  const grey = (label: string): Item => ({ label, enabled: false });
  const fromAt = said.length + 2;
  const toAt = fromAt + 5;
  const items: Item[] = [
    ...said.map(grey),
    grey(''),
    grey(on ? here : steam),
    ...cardOf(g, clash.from),
    grey(''),
    grey(on ? steam : here),
    ...cardOf(g, clash.to),
    grey(''),
    { label: 'Cancel' },
  ];
  const i = await choose(g, 'Keep which?', items, fromAt);
  return i === fromAt ? 'from' : i === toAt ? 'to' : null;
}

/** Turns Steam Cloud saves on or off with its copy, and says how it went. */
export async function switchCloud(g: Game, cloud: CloudSaves, on: boolean): Promise<string> {
  const stays = `Steam Cloud saves stays ${on ? 'off' : 'on'}.`;
  const read = (): { from: Keys; to: Keys } | null => {
    const steam = cloud.steam();
    if (steam === null) return null;
    const own = cloud.own();
    return on ? { from: own, to: steam } : { from: steam, to: own };
  };
  const first = read();
  if (first === null) {
    await cloud.record(on, 'unreadable');
    return `Steam's saves can't be reached, so nothing was copied. ${stays}`;
  }
  const kept = new Map<string, 'from' | 'to'>();
  for (const clash of planCopy(first.from, first.to).clashes) {
    const keep = await keepWhich(g, clash, on);
    if (keep === null) return `Nothing was copied. ${stays}`;
    kept.set(clash.id, keep);
  }
  // Read again: what the player chose between must still be what is there.
  const now = read();
  if (now === null || !sameSaves(first.from, now.from) || !sameSaves(first.to, now.to))
    return `The saves changed while you chose, so nothing was copied. ${stays}`;
  const plan = planCopy(now.from, now.to);
  const writes: Keys = { ...plan.writes };
  const removes = [...plan.removes];
  for (const [id, keep] of kept) {
    const chosen = applyChoice(plan, id, keep);
    Object.assign(writes, chosen.writes);
    removes.push(...chosen.removes);
  }
  const side = on ? 'steam' : 'own';
  let failed: string | null = null;
  for (const [key, value] of inSafeOrder(writes, now.to)) {
    const written = cloud.write(side, key, value);
    if (written !== true) {
      failed = written;
      break;
    }
  }
  // Saves let go only once everything is written.
  for (const key of failed === null ? removes : []) {
    if (!cloud.remove(side, key)) {
      failed = 'not removed';
      break;
    }
  }
  if (failed !== null) {
    await cloud.record(on, failed);
    return `Some saves could not be copied (${failed}). ${stays}`;
  }
  const recorded = await cloud.record(on);
  // Not kept by the app (refused, or its settings not written): the game's saves stay where they were.
  if (recorded?.on !== on) return `${recorded?.message || "Steam Cloud saves can't be changed in this launch."} ${stays}`;
  cloud.use(on);
  return on
    ? 'Done. Your saves are copied into Steam, and saves made while playing from Steam stay with Steam.'
    : "Done. Steam's saves are copied back to this computer, and saves stay here from now on.";
}
