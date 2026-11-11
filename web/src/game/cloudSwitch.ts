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
 *
 * On a machine set up since it became the default, Cloud saves comes on by itself at the title of an account's first
 * Steam launch (cloudByDefault): this computer's saves are copied in without asking, and where a character was played
 * on both sides apart, the title offers to turn it on, keeping the newer save of each as the last and the other as an
 * earlier save (nothing is lost), or to leave it off, which is kept so it is not offered again.
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

/** Which version of a clash to keep: 'from' or 'to', or null to copy nothing (keepWhich asks the player). */
type Pick = (clash: Clash) => Promise<'from' | 'to' | null>;

/** Turns Steam Cloud saves on or off with its copy, and says how it went. `pick` settles each clash (the player, by default). */
export async function switchCloud(
  g: Game,
  cloud: CloudSaves,
  on: boolean,
  pick: Pick = (clash) => keepWhich(g, clash, on),
): Promise<string> {
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
    const keep = await pick(clash);
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

/** The games that have had Cloud saves offered by default this launch: it is asked once a launch, whatever came of it. */
const offered = new WeakSet<Game>();

/** `names` as a list: "A", "A and B", "A, B and C". */
const listOf = (names: string[]): string => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** A box of text with OK. */
async function say(g: Game, text: string): Promise<void> {
  const lines = wrap(text).map((label): Item => ({ label, enabled: false }));
  await choose(g, 'Steam Cloud', [...lines, { label: '', enabled: false }, { label: 'OK' }], lines.length + 1, true);
}

/**
 * Cloud saves turned on by default, at the title of a Steam launch whose account has not chosen yet on a machine set
 * up since it became the default (SteamChoices.cloudOffered): this computer's saves copied into Steam's folder, and
 * the player told. Where a character was played on both sides apart, the title offers it first: Turn on keeps the
 * newer save of each as the last save and the other as an earlier one; Leave off copies nothing and is kept, so it is
 * not offered again. Where Steam's folder can't be read nothing is done, to be tried at the next launch. Asked once a
 * launch. Whether a box was shown (the title to be drawn again).
 */
export async function cloudByDefault(g: Game): Promise<boolean> {
  const steam = g.hooks.steam;
  if (!steam || offered.has(g) || !steam.launched() || !steam.options().cloudOffered) return false;
  const theirs = steam.cloud.steam();
  if (theirs === null) return false;
  offered.add(g);
  g.p.flushKeys();
  const clashes = planCopy(steam.cloud.own(), theirs).clashes;
  let said: string;
  if (clashes.length > 0) {
    const names = [...new Set(clashes.map((c) => avatarName(c.from) || 'The nameless'))];
    const lines = wrap(
      `${listOf(names)} ${names.length > 1 ? 'were' : 'was'} played here and in Steam apart. Turn Steam Cloud saves on? ` +
        'The newer save of each is kept, and the other as an earlier save.',
    ).map((label): Item => ({ label, enabled: false }));
    const on = lines.length + 1;
    const i = await choose(
      g,
      'Steam Cloud',
      [...lines, { label: '', enabled: false }, { label: 'Turn on' }, { label: 'Leave off' }],
      on,
      true,
    );
    if (i !== on) {
      await steam.cloud.record(false);
      await say(g, 'Steam Cloud saves stays off. It can be turned on in Steam (beta).');
      return true;
    }
    said = await switchCloud(g, steam.cloud, true, (c) => Promise.resolve(c.from.written >= c.to.written ? 'from' : 'to'));
  } else said = await switchCloud(g, steam.cloud, true);
  await say(g, steam.options().cloud ? `Steam Cloud saves is on. ${said.replace(/^Done\. /, '')}` : said);
  return true;
}
