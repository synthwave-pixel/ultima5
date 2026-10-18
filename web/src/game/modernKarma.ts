/**
 * modernKarma.ts
 *
 * The Modern karma (the port's; docs/superpowers/specs/2026-10-17-modern-karma-design.md): kept beside 1988's own,
 * the saved game's karma byte, which goes on by 1988's code under every rules. Both are kept always; which one the
 * game reads - the gates (Gruman's mantra at 50, Annon's Word at 75, a resurrection without lost experience at 98),
 * Lord British's and the old man's words, The Path, Ctrl-K - is the rules': the Modern rules read this one, the
 * Story and Classic rules 1988's (karmaInUse).
 *
 * Four pools, each 0-99: Words (choices in conversation, each counted once), Deeds (acts in the world, again and
 * again), Battle (fights won and fled) and Quest (the quest's milestones). Combined - Words 30%, Deeds 30%, Quest 25%,
 * Battle 15% - and capped by the weakest (any below 25: Seeker at best; below 10: Misguided). Every deed carries a
 * virtue, which the log names and The Path remembers.
 */

import type { Game } from './game.ts';
import { Colour } from '../ui/colours.ts';

export type Pool = 'words' | 'deeds' | 'battle' | 'quest';
export const POOLS: Pool[] = ['words', 'deeds', 'battle', 'quest'];

/** The eight virtues, in the game's order (the shrines', the mantras'). */
export const VIRTUES = ['Honesty', 'Compassion', 'Valor', 'Justice', 'Sacrifice', 'Honor', 'Spirituality', 'Humility'] as const;
export type Virtue = (typeof VIRTUES)[number];

/** Where the conduct pools start (Words, Deeds, Battle): 1988's own start, a new game's karma. The Quest starts at 0. */
export const FRESH = 75;

/** The conduct pools, which make the whole and hold it back; the Quest, the journey, only adds to it. */
export const CONDUCT: Pool[] = ['words', 'deeds', 'battle'];

/** How much each conduct pool weighs in the whole. */
const WEIGHTS: Record<'words' | 'deeds' | 'battle', number> = { words: 0.425, deeds: 0.425, battle: 0.15 };

/** What the Modern karma keeps, with the save. */
export interface PathData {
  pools: Record<Pool, number>;
  /** Virtue shown, by pool: what each pool's rises were for. */
  tally: Record<Pool, Partial<Record<Virtue, number>>>;
  /** What has been counted once: choices, milestones, the beneficiaries of good deeds. */
  done: string[];
  /** Each family's total so far (its cap, TALK's). */
  families: Record<string, number>;
  /** Each beggar, by "mapId:npc", and the game day they were last given alms. */
  alms: Record<string, number>;
}

export class PathState {
  pools: Record<Pool, number> = { words: FRESH, deeds: FRESH, battle: FRESH, quest: 0 };
  tally: Record<Pool, Partial<Record<Virtue, number>>> = { words: {}, deeds: {}, battle: {}, quest: {} };
  done = new Set<string>();
  families: Record<string, number> = {};
  alms: Record<string, number> = {};

  encode(): PathData {
    return {
      pools: { ...this.pools },
      tally: structuredClone(this.tally),
      done: [...this.done],
      families: { ...this.families },
      alms: { ...this.alms },
    };
  }

  /** A save's, or a fresh one where it has none (a game from before the Modern karma: begun afresh, not from 1988's). */
  static decode(d: PathData | undefined): PathState {
    const p = new PathState();
    if (!d || typeof d !== 'object') return p;
    for (const pool of POOLS) {
      const v = d.pools?.[pool];
      if (typeof v === 'number' && Number.isFinite(v)) p.pools[pool] = clamp(v);
      const t = d.tally?.[pool];
      if (t && typeof t === 'object') for (const v of VIRTUES) if (typeof t[v] === 'number') p.tally[pool][v] = t[v];
    }
    if (Array.isArray(d.done)) for (const k of d.done) if (typeof k === 'string') p.done.add(k);
    if (d.families && typeof d.families === 'object')
      for (const [k, v] of Object.entries(d.families)) if (typeof v === 'number') p.families[k] = v;
    if (d.alms && typeof d.alms === 'object') for (const [k, v] of Object.entries(d.alms)) if (typeof v === 'number') p.alms[k] = v;
    return p;
  }
}

const clamp = (v: number): number => Math.max(0, Math.min(99, Math.round(v)));

/**
 * The Modern karma: the conduct pools combined (Words and Deeds 42.5% each, Battle 15%), the Quest adding a point for
 * every ten of its own (+10 at the journey's end), capped by the weakest conduct pool.
 */
export function modernKarma(p: PathState): number {
  const base = WEIGHTS.words * p.pools.words + WEIGHTS.deeds * p.pools.deeds + WEIGHTS.battle * p.pools.battle;
  let karma = clamp(base + p.pools.quest / 10);
  const weakest = Math.min(...CONDUCT.map((pool) => p.pools[pool]));
  if (weakest < 10) karma = Math.min(karma, 49);
  else if (weakest < 25) karma = Math.min(karma, 74);
  return karma;
}

/** The karma the game reads: the Modern one under the Modern and the Story rules, 1988's under the Classic. */
export function karmaInUse(g: Game): number {
  return g.options.rules === 'classic' ? g.s.karma : modernKarma(g.path);
}

/**
 * The Path's tiers, each ending where something in the game changes: Gruman of Trinsic tells Honor's mantra from 50
 * (talk.ts, the script's 0xFE), Annon of Britain Despise's Word from 75, a healer's resurrection keeps all of a
 * member's experience from 98 (shops.ts); the words are 1988's own, from the messages Lord British and the camp's old
 * man give by it (KARMA.DAT).
 */
export const PATH_TIERS: { from: number; word: string; about: string }[] = [
  { from: 98, word: 'Enlightened', about: 'An Avatar in all but name.' },
  { from: 75, word: 'Wise', about: "Thou walkest the Path. Death's embrace yet costs thee something." },
  { from: 50, word: 'Seeker', about: 'Some still deem thee unworthy of their deepest secrets.' },
  { from: 20, word: 'Misguided', about: 'The wise keep their counsel from thee.' },
  { from: 0, word: 'Strayed', about: 'Thou hast strayed far from the Path. Few will trust thee.' },
];

/** The Path's tier for a karma (PATH_TIERS). */
export const pathTier = (karma: number): { word: string; about: string } => PATH_TIERS.find((t) => karma >= t.from) ?? PATH_TIERS[4];

/** The Quest's tiers: the hero's journey, from nothing at a new game to the end (each word short, for its line). */
export const QUEST_TIERS: { from: number; word: string; about: string }[] = [
  { from: 90, word: 'Legend', about: 'Thy deeds shall be sung for an age.' },
  { from: 65, word: 'Champion', about: 'Few have walked so far.' },
  { from: 40, word: 'Proven', about: 'Britannia begins to speak thy name.' },
  { from: 15, word: 'Wayfarer', about: 'The road is long, and thou art upon it.' },
  { from: 0, word: 'Untried', about: 'Thy journey hath only begun.' },
];

/** A pool's tier: the Quest's by the journey (QUEST_TIERS), the others by the Path (PATH_TIERS). */
export const poolTier = (pool: Pool, value: number): { word: string; about: string } =>
  pool === 'quest' ? (QUEST_TIERS.find((t) => value >= t.from) ?? QUEST_TIERS[4]) : pathTier(value);

/** The virtue a pool has shown most (its tally), or none yet. */
export function strongest(p: PathState, pool: Pool): Virtue | null {
  let best: Virtue | null = null;
  for (const v of VIRTUES) if ((p.tally[pool][v] ?? 0) > (best ? (p.tally[pool][best] ?? 0) : 0)) best = v;
  return best;
}

/**
 * A deed: `delta` to `pool`, for `virtue`. `once`, a key counted once a game (a choice, a milestone, a beneficiary):
 * counted already, nothing. Kept always, whatever the rules. Nothing is said of it: where the number moved, the words
 * of the deed are tinted instead (tint) - at once for an act, at the end of the reply for a conversation's (talk.ts) -
 * and never for `quiet` (a cheat's cost). Returns how far the pool moved (0: not at all, already at its end).
 */
export function deed(g: Game, pool: Pool, delta: number, virtue: Virtue, once?: string, quiet = false): number {
  const p = g.path;
  if (once !== undefined) {
    if (p.done.has(once)) return 0;
    p.done.add(once);
  }
  const was = p.pools[pool];
  p.pools[pool] = clamp(was + delta);
  const moved = p.pools[pool] - was;
  if (moved > 0) p.tally[pool][virtue] = (p.tally[pool][virtue] ?? 0) + moved;
  if (moved === 0 || quiet) return moved;
  if (moved > 0) g.karmaMoves.up++;
  else g.karmaMoves.down++;
  // In conversation the reply to come is the deed's words (talk.ts question tints them); else the line just written.
  if (g.recording === null) tint(g, moved, lastLine(g));
  return moved;
}

/** The message window (frame.ts Win.messages: not imported, as game.ts imports this). */
const MESSAGES = 2;

/** The message window's row count (TextWindow.started) at the line last written: the one the cursor is on, or above. */
export function lastLine(g: Game): number {
  const w = g.text.windows[MESSAGES];
  return w.started - (w.x === 0 ? 1 : 0);
}

/** The message window's row count now: what is written after this is "since" it (tint). */
export const lineMark = (g: Game): number => g.text.windows[MESSAGES].started;

/**
 * The words of a deed that moved the karma the game reads, tinted - from row `since` (TextWindow.started) on - a
 * white just blue for a rise, just red for a fall: in the Standard look alone (the PC look's EGA page draws the tint's
 * own white), and under the rules that read the Modern karma (all but the Classic).
 */
export function tint(g: Game, direction: number, since: number): void {
  if (direction === 0 || g.options.rules === 'classic' || g.options.tileSet !== 'standard') return;
  g.text.recolourSince(MESSAGES, since, Colour.brightWhite, direction > 0 ? Colour.virtueUp : Colour.virtueDown);
}

/** The karma's moves so far (Game.karmaMoves), to tell which way a stretch of play moved it: a fall outweighs a rise. */
export function movedSince(g: Game, before: { up: number; down: number }): number {
  const m = g.karmaMoves;
  return m.down > before.down ? -1 : m.up > before.up ? 1 : 0;
}

/** "Journal updated", for a clue taken down (journal.ts): said once a turn, however many are. */
export function journalUpdated(g: Game): void {
  const said = journalSaid.get(g);
  if (said === g.turnsTaken) return;
  journalSaid.set(g, g.turnsTaken);
  if (g.text.win.x !== 0) g.printChar('\n');
  g.print('Journal updated\n');
}
const journalSaid = new WeakMap<Game, number>();

// --- Words: the choices in conversation ----------------------------------------------------------------------

/**
 * A choice: what each answer is worth. Keyed by the conversation ("file:talk", talk.ts loadScript's labels) and the
 * question's label; each answer by the word the question listens for that it matched, or "y" / "n" where a yes or a
 * no was given that it does not listen for, or "*" for any other answer. `group`: choices that are one (a question
 * and the one it leads to); only the first answer in a group counts. `family`: one of a kind across the land, its
 * total capped (FAMILIES).
 */
interface Choice {
  answers: Record<string, [number, Virtue]>;
  group?: string;
  family?: string;
}

/** The families: one kind of answer heard across Britannia, each member counted once and the whole capped. */
export const FAMILIES: Record<string, number> = { dissent: 3, faith: 2, loyalty: 2, right: 3 };

const c = (answers: Record<string, [number, Virtue]>, more: Omit<Choice, 'answers'> = {}): Choice => ({ answers, ...more });

/** Every choice that counts, by "file:talk:label" (label in hex, as the scripts number them from 0x91). */
export const CHOICES: Record<string, Choice> = {
  // Dilemmas: each answer grows a different virtue.
  '3:26:91': c({ y: [2, 'Honesty'], n: [2, 'Valor'] }), // Sir Sean: afraid to journey into Evil's abode?
  '3:14:91': c({ y: [2, 'Honesty'], n: [2, 'Valor'] }), // Lady Hayden: art thou afraid?
  '0:48:94': c({ y: [2, 'Honesty'], '*': [3, 'Humility'] }), // Wartow: art thou proud of this fact?
  '0:48:92': c({ n: [3, 'Humility'], y: [2, 'Justice'] }), // Wartow: dost thou hate the tyrant Blackthorn?
  '0:48:95': c({ '*': [2, 'Humility'] }), // Wartow: dost thou know all there is to know about him? (reserve judgement)
  '0:1:91': c({ y: [1, 'Honesty'], '*': [1, 'Humility'] }), // Zachariah: art thou the Avatar of legend?
  '0:34:92': c({ y: [2, 'Honor'], '*': [2, 'Honesty'] }), // Gruman: for a just and honorable cause?
  '1:5:93': c({ y: [2, 'Compassion'] }, { group: 'anthony' }), // Anthony: study the laws and become an Avatar? (comfort)
  '1:5:94': c({ y: [2, 'Honesty'] }, { group: 'anthony' }), // Anthony: are his laws in error? (the truth)
  '0:36:94': c({ '*': [2, 'Humility'] }), // Greymarch: let me repay thee? (declined)
  '3:21:92': c({ y: [2, 'Compassion'], '*': [2, 'Justice'] }), // Toede: wilt thou help me escape?
  '2:6:93': c({ y: [2, 'Compassion'], '*': [2, 'Justice'] }), // Drudgeworth: ye will let me out?
  '3:1:92': c({ y: [3, 'Compassion'], '*': [1, 'Justice'] }), // Captain Johne: might I join thee?
  '0:9:93': c({ n: [2, 'Compassion'] }), // Terrance: dost thou intend to turn me in?
  '0:7:93': c({ y: [2, 'Justice'] }), // Justin: pay 3 gold for the mutton?
  '2:4:94': c({ y: [2, 'Justice'] }), // Margaret: pay 5 crowns to 'elp offset the cost?
  '0:9:92': c({ '*': [1, 'Sacrifice'] }), // Terrance: dost thou have enough to eat? (not taking a poor man's food)
  '0:26:92': c({ '*': [1, 'Sacrifice'] }), // Fiona: art thou in dire need of food? (not taking from the poor house)
  '2:16:93': c({ '*': [2, 'Valor'] }), // Foulwell: the child in the vat - like it? (no, and the guards come)
  // Single choices.
  '2:24:93': c({ n: [3, 'Honesty'] }), // Vigil: canst thou prove it?
  '0:20:91': c({ y: [3, 'Compassion'] }), // Jeremy: 30 gold for his brother's bail
  '2:31:93': c({ y: [2, 'Spirituality'] }, { group: 'ava' }), // Ava: the offering (first visit)
  '2:31:94': c({ y: [2, 'Spirituality'] }, { group: 'ava' }), // Ava: the offering (1988's +5, again and again)
  '0:19:93': c({
    jero: [2, 'Compassion'],
    fele: [2, 'Compassion'],
    grey: [2, 'Compassion'],
    mari: [2, 'Compassion'],
    aley: [2, 'Compassion'],
  }), // Judge Dryden: whom dost thou wish me to pity?
  '3:12:91': c({ y: [2, 'Honor'] }), // Lord Shalineth: swear not to use the name foolishly
  '0:42:91': c({ y: [2, 'Humility'] }), // Shirita: dost thou strive to walk a humble path?
  '0:2:91': c({ y: [1, 'Sacrifice'] }), // Malifora: 15 gold for her aid
  '0:30:91': c({ y: [1, 'Sacrifice'] }, { group: 'delwyn' }), // Delwyn: a few gold crowns for a friend in need
  '0:30:93': c({ y: [1, 'Sacrifice'] }, { group: 'delwyn' }),
  '0:30:94': c({ y: [1, 'Sacrifice'] }, { group: 'delwyn' }),
  '0:37:95': c({ y: [1, 'Honor'] }), // Froed: wouldst thou take him a message?
  // Betrayal, the only Words that fall (and refusing it, a rise).
  '0:38:94': c({ sind: [-15, 'Justice'], '*': [2, 'Honor'] }), // Flain: name a member of the Great Council
  '3:8:93': c({ dawn: [-10, 'Honor'], '*': [3, 'Honor'] }), // Thrud: the Resistance's password for the arms
  '0:20:93': c({ y: [2, 'Justice'], '*': [-5, 'Justice'] }), // Jeremy: 50 gold for the keys he gave
  // Families.
  '0:29:91': c({ '*': [1, 'Justice'] }, { family: 'dissent' }), // Lady Sahra: Blackthorn has done a good job?
  '0:44:91': c({ n: [1, 'Justice'] }, { family: 'dissent' }), // Tetsuo: art thou a servant of Blackthorn?
  '1:6:91': c({ '*': [1, 'Justice'] }, { family: 'dissent' }), // Charlotte: his teachings meaningful and true?
  '1:15:91': c({ n: [1, 'Justice'] }, { family: 'dissent' }), // Sir Arbuthnot: dost thou favor the current regime?
  '3:3:91': c({ n: [1, 'Justice'] }, { family: 'dissent' }), // Lady Tessa: dost thou support Blackthorn's rule?
  '3:21:91': c({ '*': [1, 'Justice'] }, { family: 'dissent' }), // Toede: (dost thou share my beliefs?)
  '0:21:91': c({ y: [1, 'Spirituality'] }, { family: 'faith' }), // Jerone: Lord British lives
  '0:26:91': c({ y: [1, 'Spirituality'] }, { family: 'faith' }), // Fiona: dost thou believe he may still live?
  '0:41:91': c({ y: [1, 'Spirituality'] }, { family: 'faith' }), // Tomoka: dost thou believe he may one day return?
  '0:6:91': c({ brit: [1, 'Honor'] }, { family: 'loyalty' }), // Greyson: the rightful ruler
  '0:16:92': c({ brit: [1, 'Honor'] }, { family: 'loyalty' }), // Thorne: who dost thou serve?
  '0:48:91': c({ brit: [1, 'Honor'] }, { family: 'loyalty' }), // Wartow: who dost thou serve?
  '2:18:94': c({ y: [1, 'Honor'] }, { family: 'loyalty' }), // Camile: Lord British the rightful ruler?
  '0:18:92': c({ brit: [1, 'Honor'] }, { family: 'loyalty' }), // Landon: with whom dost thy loyalty lie?
  '0:35:91': c({ y: [1, 'Valor'] }, { family: 'right' }), // Jaana: returned to set things right?
  '3:27:91': c({ y: [1, 'Valor'] }, { family: 'right' }), // Mariah
  '3:30:92': c({ y: [1, 'Valor'] }, { family: 'right' }), // Dupre
  '3:1:91': c({ y: [1, 'Valor'] }, { family: 'right' }), // Captain Johne: wilt thou save Britannia?
  '3:19:91': c({ y: [1, 'Valor'] }, { family: 'right' }), // Barbra: recover what the kingdom lost
  '0:40:91': c({ y: [1, 'Valor'] }, { family: 'right' }), // Saul: help us vanquish these daemons
  '0:39:91': c({ y: [1, 'Valor'] }, { family: 'right' }), // Kindor: use the mantra against the Shadowlords
  '0:17:92': c({ y: [1, 'Valor'] }, { family: 'right' }), // Chamfort: aid the Resistance
  '0:18:95': c({ y: [1, 'Valor'] }, { family: 'right' }), // Landon: help us with the cause
  '2:21:97': c({ y: [1, 'Valor'] }, { family: 'right' }), // Thentis: dost thou support it?
  '2:22:93': c({ y: [1, 'Valor'] }, { family: 'right' }), // Joshua: dost thou serve the Resistance?
};

/** Questions that count by being reached, not answered (Fenelon's kindness: 1988's +5 at it, again and again). */
const REACHED: Record<string, [number, Virtue]> = {
  '0:28:92': [2, 'Compassion'],
};

/** Greymarch of Yew (0:36), whose son Froed (0:37) the party may have met in Skara Brae. */
const GREYMARCH = '0:36:';
const FROED = '0:37:';

/** A question asked in conversation (talk.ts question): kept as met, and a question that counts by being reached. */
export function asked(g: Game, labels: string, label: number): void {
  g.path.done.add(`met:${labels}`);
  const r = REACHED[`${labels}${label.toString(16)}`];
  if (r) deed(g, 'words', r[0], r[1], `w:${labels}${label.toString(16)}`);
}

/**
 * A question answered (talk.ts question): `matched` the word it listens for that the answer matched, or null;
 * `typed` what was said. Its worth, once (a group's first answer, a family's member, to its cap).
 */
export function answered(g: Game, labels: string, label: number, matched: string | null, typed: string): void {
  const key = `${labels}${label.toString(16)}`;
  // Greymarch's son (the truth told, or a kindness) and the message carried from him: as the party knows of Froed.
  if (labels === GREYMARCH) return greymarch(g, label, matched);
  const choice = CHOICES[key];
  if (!choice) return;
  const said = matched?.toLowerCase() ?? (/^y/i.test(typed) ? 'y' : /^n/i.test(typed) ? 'n' : '*');
  const worth = choice.answers[said] ?? (matched === null ? choice.answers['*'] : undefined);
  const once = `w:${choice.group ?? key}`;
  if (g.path.done.has(once)) return; // the first answer counted; asked again, nothing
  if (!worth) {
    // Answered, for nothing: the choice is made all the same (a group's other question no longer counts).
    g.path.done.add(once);
    return;
  }
  const virtue = worth[1];
  let delta = worth[0];
  if (choice.family && delta > 0) {
    const cap = FAMILIES[choice.family] ?? 0;
    const sum = g.path.families[choice.family] ?? 0;
    delta = Math.min(delta, cap - sum);
    if (delta <= 0) return void g.path.done.add(once);
    g.path.families[choice.family] = sum + delta;
  }
  deed(g, 'words', delta, virtue, once);
}

/** Greymarch: "And, he is well?" (L92) told truly or kindly; Froed's message delivered (L93). */
function greymarch(g: Game, label: number, matched: string | null): void {
  const metFroed = g.path.done.has(`met:${FROED}`);
  if (label === 0x92) {
    const yes = matched?.toLowerCase() === 'y';
    if (yes === metFroed) deed(g, 'words', 2, 'Honesty', `w:${GREYMARCH}92`);
    else if (yes) deed(g, 'words', 1, 'Compassion', `w:${GREYMARCH}92`);
    else g.path.done.add(`w:${GREYMARCH}92`);
  } else if (label === 0x93 && matched?.toLowerCase() === 'skar' && g.path.done.has(`w:${FROED}95`)) {
    deed(g, 'words', 2, 'Honor', `w:${GREYMARCH}93`); // a promise kept
  } else if (label === 0x94) {
    const worth = matched === null ? CHOICES[`${GREYMARCH}94`].answers['*'] : undefined;
    if (worth) deed(g, 'words', worth[0], worth[1], `w:${GREYMARCH}94`);
    else g.path.done.add(`w:${GREYMARCH}94`);
  }
}

// --- Deeds, Battle and Quest: acts in the world ---------------------------------------------------------------------

/** Alms given to a beggar (talk.ts payGold): each beggar once a game day. */
export function alms(g: Game, npc: number): void {
  const who = `${g.s.mapId}:${npc}`;
  const s = g.s;
  const today = s.year * 13 * 28 + (s.month - 1) * 28 + (s.day - 1); // time.ts gameDay (not imported: game.ts imports this)
  if (g.path.alms[who] === today) return;
  g.path.alms[who] = today;
  deed(g, 'deeds', 3, 'Compassion');
}

/** A fight's end (combat.ts specialMap): won (the foes outnumbering the party, the more), or left with foes standing. */
export function battleOutcome(g: Game, outcome: 'won' | 'fled' | 'fell', foes: number, party: number): void {
  // Won by a cheat (Slay every foe, Auto kill), or against the place's own people: no honour in it.
  if (g.cheatedFight || g.autoKill || g.fightingTownsfolk) return;
  if (outcome === 'won') deed(g, 'battle', foes > party ? 2 : 1, foes > party ? 'Valor' : 'Honor');
  else if (outcome === 'fled') deed(g, 'battle', -3, 'Honor');
}
