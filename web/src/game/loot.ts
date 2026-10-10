/**
 * loot.ts
 *
 * Loot and Leave (the port's): a fight won, on a field that may be left, everything worth taking is taken at one
 * command - each chest searched, made safe and opened by whoever does it best, and everything lying about picked up
 * - and the party leaves, as Leave combat does. A chest that cannot be opened without risking a life is left, and
 * the party stays, for the player to decide. No turn is spent: the fight is over.
 *
 * Who does what, as bump to act chooses (bumpAct.ts): a chest is searched by the cleverest (Search reads traps by
 * intelligence, and wrongly on a poor roll; a chest searched or disarmed before keeps what was found). One read as
 * trapped is unlocked with An Sanct by whoever can cast it (no roll, no key), else jimmied once by the most dexterous
 * (a key broken is not tried again). It is opened by one a trap cannot kill - more than 30 hit points, a trap in a
 * fight being acid (at most 30) or poison - one already poisoned first, who loses nothing to the poison; a chest made
 * safe for certain (An Sanct, or a key that worked) by anyone. Bodies are left: most hold nothing, and plague.
 */

import type { Game } from './game.ts';
import { thingKey } from './game.ts';
import { getObject, jimmyChestBy, openChest, searchChest } from './items.ts';
import { unlockAnyCaster, unlockChest } from './magic.ts';
import { Status } from './save.ts';
import type { Offer } from './targets.ts';
import { updateFrame } from './frame.ts';

const CHEST = 1;

/** A thing lying on the field to be picked up, as Get takes it (items.ts getCommand): not a chest, which is opened. */
const takeable = (tile: number): boolean => (tile >= 2 && tile <= 0xf) || tile === 0x19 || tile === 0x1b || (tile & 0xfc) === 0xb4;

/** The actors on the field that are chests, and those that are things to pick up. */
function lying(g: Game): { chests: number[]; things: number[] } {
  const chests: number[] = [];
  const things: number[] = [];
  g.s.actors.forEach((a, i) => {
    if (i === 0) return;
    if (a.tile === CHEST) chests.push(i);
    else if (takeable(a.tile)) things.push(i);
  });
  return { chests, things };
}

/** The members able to act (not asleep, not dead). */
function able(g: Game): number[] {
  const out: number[] = [];
  for (let m = 0; m < g.s.partySize; m++) {
    const st = g.s.members[m].status;
    if (st === Status.Good || st === Status.Poisoned) out.push(m);
  }
  return out;
}

/** The member (of `among`) with the most of `score`; -1 for none. */
function best(among: number[], score: (m: number) => number): number {
  let who = -1;
  for (const m of among) if (who < 0 || score(m) > score(who)) who = m;
  return who;
}

/** The most a trap in a fight can take from its opener (acid, items.ts springTrap: roll30). */
const TRAP_MOST = 30;

/** Who opens a chest a trap may still be on: one it cannot kill, the poisoned first (poison costs them nothing); -1 for none. */
function safeOpener(g: Game): number {
  const hardy = able(g).filter((m) => g.s.members[m].hp > TRAP_MOST);
  const sick = hardy.filter((m) => g.s.members[m].status === Status.Poisoned);
  return best(sick.length ? sick : hardy, (m) => g.s.members[m].hp);
}

/** Loot and Leave on the combat menu: where a fight is won, the field may be left, and something lies there to take. */
export function lootOffer(g: Game): Offer {
  const s = g.s;
  if (g.commandPrompt !== 'combat' || s.battleWon === 0 || s.combatFlags & 0x80) return 'hide';
  const { chests, things } = lying(g);
  if (chests.length === 0 && things.length === 0) return 'hide';
  return able(g).length ? 'show' : 'grey';
}

/** Names said together: "Iolo", "Iolo and Shamino", "Iolo, Shamino and Dupre". */
function together(names: string[]): string {
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** So many of a thing: "1 chest", "3 chests". */
const many = (n: number, thing: string): string => `${n} ${thing}${n === 1 ? '' : 's'}`;

/**
 * What was taken, said once (the port's): each thing as Get says it - "12 gold!", "A potion: Heal!", "Leather armour!"
 * - counted together, a number added to its kind's ("40 gold"), a thing found more than once counted ("2 potions:
 * Heal", "Leather armour x2"), in the order first found.
 */
export function sayTaken(lines: string[]): string {
  const sums = new Map<string, number>();
  const plural: Record<string, string> = { torches: 'torch', gems: 'gem', keys: 'key', 'odd keys': 'odd key' };
  for (const line of lines) {
    const said = line.replace(/\s+/g, ' ').trim().replace(/!$/, '');
    if (!said) continue;
    const counted = /^(\d+) (.+)$/.exec(said);
    const key = counted ? `#${plural[counted[2]] ?? counted[2]}` : said;
    sums.set(key, (sums.get(key) ?? 0) + (counted ? Number(counted[1]) : 1));
  }
  return [...sums]
    .map(([key, n]) => {
      if (key.startsWith('#')) {
        const kind = key.slice(1);
        if (n === 1 || kind === 'gold' || kind === 'food') return `${n} ${kind}`;
        return `${n} ${kind}${kind.endsWith('ch') ? 'es' : 's'}`;
      }
      if (n === 1) return key;
      const one = /^An? (\w+): (.+)$/.exec(key); // "A potion: Heal", "A scroll: View"
      return one ? `${n} ${one[1]}s: ${one[2]}` : `${key} x${n}`;
    })
    .join(', ');
}

/** What a trap's burst runs on past the wait the game gives an effect, before the party leaves (lootField). */
const TRAP_TAIL_MS = 250;

/**
 * Take everything the field holds that can be taken safely; whether all of it was (the party then leaves). What each
 * chest's search, unlocking and opening says is held back and said once, together (the port's): who searched, who
 * opened, a trap that went off, and all that was taken - not a run of lines for every chest scrolling past. Its only
 * sound is a trap's burst, where one went off, after the summary.
 */
export async function lootField(g: Game): Promise<boolean> {
  const s = g.s;
  const name = (m: number): string => s.members[m].name;
  /** Who did each thing, and how often: by name, in the order they first did it. */
  const did = {
    searched: new Map<string, number>(),
    cast: new Map<string, number>(),
    jimmied: new Map<string, number>(),
    opened: new Map<string, number>(),
  };
  const tally = (what: Map<string, number>, m: number): void => void what.set(name(m), (what.get(name(m)) ?? 0) + 1);
  // Each thing done with its words held back for the summary, and without its sound: a run of chests made at once
  // sounded every search's, cast's, broken key's and opening's together (the port's). A trap that went off sounds
  // once, after the summary says so.
  const quiet = (work: () => unknown): Promise<string> => g.hush(() => g.quietly(work));
  let broke = 0;
  const traps: string[] = [];
  let left = 0;
  for (const i of lying(g).chests) {
    const a = s.actors[i];
    if (a.tile !== CHEST) continue;
    const key = thingKey(g, a.x, a.y);
    // What a search of it said, if the player had one made; else the cleverest searches it now.
    let read = g.bumped.get(key);
    if (read !== 'clean' && read !== 'trap' && read !== 'disarmed') {
      const who = best(able(g), (m) => s.members[m].int);
      if (who < 0) {
        left++;
        continue;
      }
      await quiet(() => searchChest(g, i, who));
      tally(did.searched, who);
      read = g.bumped.get(key);
    }
    let safe = read === 'disarmed';
    if (read === 'trap') {
      const caster = unlockAnyCaster(g);
      if (caster >= 0) {
        await quiet(() => unlockChest(g, i, caster));
        tally(did.cast, caster);
        safe = true;
      } else if (s.keys > 0) {
        const who = best(able(g), (m) => s.members[m].dex);
        if (who >= 0) {
          await quiet(async () => (safe = await jimmyChestBy(g, i, who)));
          tally(did.jimmied, who);
          if (!safe) broke++;
        }
      }
    }
    // Made safe for certain, anyone opens it; else only one its trap cannot kill, should the reading be wrong.
    const opener = safe ? best(able(g), (m) => s.members[m].hp) : safeOpener(g);
    if (opener < 0) {
      left++;
      continue;
    }
    const m = s.members[opener];
    const [hp, status] = [m.hp, m.status];
    const trapped = a.b5 > 0x7f;
    await quiet(() => openChest(g, a.x, a.y, a.z, { actor: i, who: opener }));
    tally(did.opened, opener);
    if (trapped) {
      const hurt = m.status === Status.Dead ? ', and falls' : m.status !== status ? ', poisoned' : hp > m.hp ? ` (-${hp - m.hp})` : '';
      traps.push(`${name(opener)} sprang a trap${hurt}!`);
    }
    g.bumped.delete(key);
  }
  // Everything lying about, what the chests gave up with it.
  const taken: string[] = [];
  for (const i of lying(g).things) {
    const a = s.actors[i];
    taken.push(await quiet(() => getObject(g, a.tile, a.b5, i)));
  }
  g.viewDirty |= 2;
  updateFrame(g);
  const say = (line: string): void => {
    if (g.text.win.x > 0) g.printChar('\n');
    g.print(`${line}\n`);
  };
  const who = (what: Map<string, number>): string => together([...what.keys()]);
  const count = (what: Map<string, number>): number => [...what.values()].reduce((n, k) => n + k, 0);
  if (did.searched.size) say(`${who(did.searched)} searched ${many(count(did.searched), 'chest')}.`);
  if (did.cast.size) say(`${who(did.cast)} cast An Sanct${count(did.cast) > 1 ? ` on ${count(did.cast)} chests` : ''}.`);
  if (did.jimmied.size)
    say(`${who(did.jimmied)} jimmied ${many(count(did.jimmied), 'chest')}${broke ? `: ${many(broke, 'key')} broke` : ''}.`);
  if (did.opened.size) say(`${who(did.opened)} opened ${many(count(did.opened), 'chest')}.`);
  for (const trap of traps) say(trap);
  if (taken.length) say(`Taken: ${sayTaken(taken)}.`);
  if (left) say(`${left === 1 ? 'A chest is' : `${left} chests are`} left: no one could open ${left === 1 ? 'it' : 'them'} safely.`);
  // The one sound the loot makes: a trap's burst (items.ts springTrap), heard out before the party leaves - the
  // effect is waited for only its first tenth of a second (ui/sound.ts PACE), and the burst runs on past it.
  if (traps.length && !g.soundOff) {
    await g.sound.noise(0x28, 3000, 500);
    await g.p.sleep(TRAP_TAIL_MS);
  }
  return left === 0;
}
