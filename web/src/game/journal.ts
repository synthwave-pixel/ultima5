/**
 * journal.ts
 *
 * The journal, which the 1988 game left to the player's own notebook: how
 * the quest stands, read from the saved game, a line for each part with a
 * hint written for this port behind it; and the clues heard in conversation (what
 * was said of mantras, words of power, shards, the Shadowlords, Lord
 * British's regalia and the like), kept as the townsfolk said them, with
 * the place and the day.
 */

import { Game, type Note } from './game.ts';
import { Save } from './save.ts';
import { DUNGEON_HINTS, EQUIPMENT, SHADOWLORD_HINTS, SHARD_HINT, SHRINE_HINTS } from './journalHints.ts';

/** What makes a thing said worth noting. */
const CLUES = [
  'MANTRA',
  'WORD OF POWER',
  'WORDS OF POWER',
  'SHARD',
  'SHADOWLORD',
  'CODEX',
  'CROWN',
  'SCEPTRE',
  'AMULET',
  'SANDALWOOD',
  'DOOM',
  'UNDERWORLD',
  'LORD BRITISH',
  'RESISTANCE',
  'PASSWORD',
  'MOONSTONE',
  'FLAME',
  'GLASS SWORD',
  'GRAPPLE',
  'SHRINE',
  // The harpsichord: the tune's phrase, given as notes, as the composer teaches it.
  'HARPSICHORD',
  'PHRASE',
];

const MAX_NOTES = 200;

/** The day as the stats show it. */
const today = (g: Game): string => `${g.s.month}-${g.s.day}-${g.s.year}`;

/** Place `mapId` (1-40) as its files name it ("YEW" as "Yew"); nothing for the open country. */
export function placeTitle(g: Game, mapId: number): string {
  const name = g.data.locations[mapId - 1]?.name ?? '';
  return name.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
}

/** The place the party is in, as its files name it; nothing, out in the open. */
const placeName = (g: Game): string => placeTitle(g, g.s.mapId);

/**
 * Keep what a conversation said that bears on the quest: each answer - all that was said to one question, over the
 * paragraphs it runs to - kept whole where any of it is a clue, so the way to a thing is kept with the thing (the
 * twins' vision of the Shard of Falsehood: the turns of the road between "below Deceit" and "a small isle"). Who
 * said it is their name, once they have said it (`name`, their script's), else what the party saw of them.
 */
export function noteConversation(g: Game, transcript: string, name = ''): void {
  const where = placeName(g);
  // The answers: what was said between one prompt and the next (the prompt and its echo themselves go).
  const answers = transcript.split(/\s*(?:Your interest\?|You respond-)\s*:\s*[\w']*/).map((a) =>
    a
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter((p) => p.length > 0),
  );
  let who = where;
  let noted = false;
  const paras = answers.flat();
  const seen = paras.find((p) => p.startsWith('You see '));
  if (seen) who = seen.slice(8).replace(/[.!]$/, '');
  if (name && new RegExp(`\\b${name.replace(/[^\w' ]/g, '')}\\b`).test(transcript)) who = name;
  for (const answer of answers) {
    const told = answer.filter((p) => !p.startsWith('You see '));
    if (!told.some((p) => CLUES.some((c) => p.toUpperCase().includes(c)))) continue;
    for (const p of told) {
      if (g.notes.some((n) => n.text === p)) continue;
      g.notes.push({ who, where, text: p, date: today(g) });
      noted = true;
    }
  }
  // The player is told when something real has been taken down, so they know to go and look.
  if (noted) g.print('\nJournal updated\n');
  if (g.notes.length > MAX_NOTES) g.notes.splice(0, g.notes.length - MAX_NOTES);
}

/**
 * Someone found asleep: when they are up, worked out from their own day
 * in the player's files, so a visit can be timed. Most of Britannia keeps
 * ordinary hours, but a few are about only by night, or for an hour or
 * two before dusk, and a sleeper gives no sign of which. `up` is the
 * hours of the day (0 to 23) they are out of bed.
 */
export function noteSleeper(g: Game, who: string, up: number[]): void {
  if (up.length === 0 || up.length === 24) return;
  // The hours as spans: from the first hour out of bed after one in it, to the next in it.
  const awake = (h: number): boolean => up.includes((h + 24) % 24);
  const spans: string[] = [];
  for (let h = 0; h < 24; h++) {
    if (!awake(h) || awake(h - 1)) continue;
    let end = h;
    while (awake(end)) end++;
    spans.push(`${h}:00 to ${end % 24}:00`);
  }
  const where = placeName(g);
  const text = `Asleep. Up and about from ${spans.join(', and from ')}.`;
  if (g.notes.some((n) => n.where === where && n.who === who && n.text === text)) return;
  g.notes.push({ who, where, text, date: today(g) });
  g.print('\nJournal updated\n');
  if (g.notes.length > MAX_NOTES) g.notes.splice(0, g.notes.length - MAX_NOTES);
}

/** A line of the journal: what it says, the hint Y gives for it, and the lines A opens under it, if any. */
export interface JournalLine {
  label: string;
  hint: string;
  /** What A prints on it, where that is not its hint (a piece of equipment's use). */
  about?: string;
  /** The lines under it (a shrine's each, a dungeon's each, the clues' topics). */
  open?: { title: string; lines: JournalLine[] };
  /** What A opens to read, a page of its own (a topic's clues): each line's text, and whether it is greyed. */
  read?: { text: string; dim: boolean }[];
  /** Nothing to open or hint (a list with nothing in it yet). */
  enabled?: boolean;
}

/** The menu's width, in letters: a count or a state is set against its right edge. */
const WIDTH = 21;
const row = (name: string, right: string): string => `${name}${right.padStart(WIDTH - name.length)}`;

/** A name from the files, as a name ("DECEIT" as "Deceit"). */
const named = (name: string): string => name.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());

/** How a shrine's quest stands: not begun, ordained, answered by the Codex, or done. */
function questState(g: Game, v: number): '' | 'ordained' | 'answered' | 'done' {
  const bit = 1 << v;
  const active = (g.s.questActive & bit) !== 0;
  const done = (g.s.questDone & bit) !== 0;
  return active ? (done ? 'answered' : 'ordained') : done ? 'done' : '';
}

/** What A says of a shrine or dungeon nothing is known of. */
export const MYSTERY = 'A mystery...';

/**
 * What the party knows of a shrine (A on its line): found - its square seen on the map, or its quest begun - its
 * mantra, once heard, and how its quest stands. Nothing the party has not learnt.
 */
function shrineStatus(g: Game, v: number): string {
  const state = questState(g, v);
  const found = state !== '' || g.fog.seen(false, g.data.bytes(0x1f6e, 8)[v], g.data.bytes(0x1f76, 8)[v]);
  const mantra = g.data.table(0x1f5e, 8)[v].trim();
  const out: string[] = [];
  if (found) out.push('Found.');
  if (g.words.knows(mantra)) out.push(`Mantra: ${mantra.toUpperCase()}.`);
  if (state === 'ordained') out.push('Quest ordained: seek the Codex.');
  else if (state === 'answered') out.push('The Codex has answered: return to the shrine.');
  else if (state === 'done') out.push('Quest complete.');
  return out.length ? out.join(' ') : MYSTERY;
}

/**
 * What the party knows of a dungeon (A on its line): found - its entrance seen on the map (Doom's, the Underworld's) -
 * its Word of Power, once heard, and whether it has been unsealed.
 */
function dungeonStatus(g: Game, d: number): string {
  const at = g.data.locations[0x20 + d];
  const unsealed = g.s.d58d0[d] !== 0;
  const found = unsealed || (!!at && g.fog.seen(d === 7, at.x, at.y));
  const word = g.data.table(0x4502, 8)[d].trim();
  const out: string[] = [];
  if (found) out.push('Found.');
  if (g.words.knows(word)) out.push(`Word of Power: ${word.toUpperCase()}.`);
  if (unsealed) out.push('Unsealed.');
  return out.length ? out.join(' ') : MYSTERY;
}

/** A name's first three letters, as the game matches a townsman to the roster on joining (talk.ts join). */
const stem = (letters: number[]): string => String.fromCharCode(...letters.slice(0, 3).map((b) => b & 0x7f)).toUpperCase();

/**
 * Where each companion waits to be asked, found in the player's files: of every settlement's townsfolk (its .NPC
 * file's talk numbers), those whose conversation (the TLK file's) holds the join (0x84), by the first three letters
 * of their name - the script's first string - with the settlement's map id. Read once and kept.
 */
function companionPlaces(g: Game): Map<string, number> {
  let found = places.get(g.data);
  if (found) return found;
  found = new Map();
  const npcFiles = ['TOWNE.NPC', 'DWELLING.NPC', 'CASTLE.NPC', 'KEEP.NPC'];
  const talkFiles = ['TOWNE.TLK', 'DWELLING.TLK', 'CASTLE.TLK', 'KEEP.TLK'];
  for (let id = 0; id < 32; id++) {
    const npc = g.data.files.get(npcFiles[id >> 3]);
    const tlk = g.data.files.get(talkFiles[id >> 3]);
    if (!npc?.length || !tlk?.length) continue;
    const count = tlk[0] | (tlk[1] << 8);
    for (let i = 0; i < 32; i++) {
      const talk = npc[(id & 7) * 0x240 + 0x220 + i];
      if (talk === 0) continue;
      for (let e = 0; e < count; e++) {
        const at = 2 + e * 4;
        if ((tlk[at] | (tlk[at + 1] << 8)) !== talk) continue;
        const from = tlk[at + 2] | (tlk[at + 3] << 8);
        const to = e + 1 < count ? tlk[at + 6] | (tlk[at + 7] << 8) : tlk.length;
        const script = tlk.subarray(from, to);
        if (script.includes(0x84) && !found.has(stem([...script]))) found.set(stem([...script]), id + 1);
        break;
      }
    }
  }
  places.set(g.data, found);
  return found;
}
const places = new WeakMap<Game['data'], Map<string, number>>();

/**
 * The things the journal keeps a mystery until the party has heard of them or held them (EQUIPMENT's `gate`), by the
 * words that name them in conversation. Heard, each is kept in Fog.named as "item:<gate>".
 */
const GATED: Record<string, RegExp> = {
  crown: /\bcrown\b/i,
  sceptre: /\bscept(re|er)\b/i,
  amulet: /\bamulet\b/i,
  carpet: /\bcarpets?\b/i,
  skullkeys: /\bskull ?keys?\b/i,
  badge: /\bbadge\b/i,
};

/** Whether the party holds a gated thing (EQUIPMENT's `gate`). */
function holds(g: Game, gate: string): boolean {
  const s = g.s;
  const held: Record<string, number> = {
    crown: s.crown,
    sceptre: s.sceptre,
    amulet: s.amulet,
    carpet: s.carpets,
    skullkeys: s.skullKeys,
    badge: s.blackBadge,
  };
  return (held[gate] ?? 0) !== 0;
}

/**
 * Whether the party knows of a gated thing: heard of in conversation, held, or - for a game saved before these were
 * kept - named in a clue the journal keeps.
 */
function knowsOf(g: Game, gate: string): boolean {
  if (g.fog.named.has(`item:${gate}`) || holds(g, gate)) return true;
  const words = GATED[gate];
  return !!words && g.notes.some((n) => words.test(n.text));
}

/** The companions the roster holds, but for the Avatar and those the party sets out with (INIT.GAM's party). */
function companionMembers(g: Game): { i: number; name: string }[] {
  const s = g.s;
  const start = g.data.files.get('INIT.GAM');
  const init = start?.length ? new Save(start) : null;
  const setOut = new Set(init ? init.members.slice(0, init.partySize).map((m) => m.name) : [s.members[0].name]);
  const out: { i: number; name: string }[] = [];
  for (let i = 1; i < s.members.length; i++) {
    const name = s.members[i].name;
    if (name && !setOut.has(name)) out.push({ i, name });
  }
  return out;
}

const wordOf = (name: string): RegExp => new RegExp(`\\b${name.replace(/[^A-Za-z' ]/g, '')}\\b`, 'i');

/**
 * Keep what a conversation told of the journal's mysteries (the port's): the gated things named in it (GATED), and the
 * companions - named in it, or the one talked to (`who`, the name their script gives).
 */
export function heardOfThings(g: Game, text: string, who: string): void {
  for (const [gate, words] of Object.entries(GATED)) if (words.test(text)) g.fog.named.add(`item:${gate}`);
  const spoke = who.split(' ')[0].toUpperCase();
  for (const { name } of companionMembers(g)) {
    if (wordOf(name).test(text) || (spoke !== '' && spoke === name.toUpperCase())) {
      g.fog.named.add(`companion:${name.toUpperCase()}`);
    }
  }
}

/**
 * The equipment worth knowing of, held or not (no counts): A says what it is for - of the quest's own things, only
 * that there are rumours of them - and Y where it is to be had (journalHints.ts). A gated thing not yet heard of or
 * held is a mystery, but for Y.
 */
function equipment(g: Game): JournalLine[] {
  return EQUIPMENT.map((e) =>
    e.gate && !knowsOf(g, e.gate)
      ? { label: 'Mystery...?', about: MYSTERY, hint: e.where }
      : { label: e.name, about: e.use ?? `Rumors of the ${e.rumored ?? e.name.toLowerCase()} abound.`, hint: e.where },
  );
}

/** A member's calling, by the class letter the roster keeps. */
const CALLINGS: Record<string, string> = { F: 'Fighter', B: 'Bard', M: 'Mage' };

/**
 * The companions who may join the party: the roster's, but for the Avatar and those the party sets out with (the new
 * game's own party, INIT.GAM). Each is in the party, waiting where they left it, or where they are to be found; the
 * hint says their calling and where. One the party has not met - talked to, or heard named - goes by their calling.
 */
function companions(g: Game): JournalLine[] {
  const s = g.s;
  const at = companionPlaces(g);
  const place = (mapId: number): string => named(g.data.locations[mapId - 1]?.name ?? '').replace(/^The /, 'the ');
  return companionMembers(g).map(({ i, name }) => {
    const m = s.members[i];
    const joined = i < s.partySize;
    const calling = CALLINGS[String.fromCharCode(m.cls)] ?? 'Companion';
    const waits = m.mapId >= 1 && m.mapId <= 32 ? m.mapId : 0;
    const home = at.get(stem([...name].map((c) => c.charCodeAt(0)))) ?? 0;
    const where = joined ? 'in the party' : waits ? `waiting in ${place(waits)}` : home ? `found in ${place(home)}` : 'whereabouts unknown';
    const met =
      joined ||
      waits !== 0 ||
      g.fog.named.has(`companion:${name.toUpperCase()}`) ||
      g.notes.some((n) => n.who.toUpperCase() === name.toUpperCase() || wordOf(name).test(n.text));
    const hint = `${calling}, ${where}.`;
    return met
      ? { label: row(name, joined ? 'in party' : ''), about: hint, hint }
      : { label: `${calling}...?`, about: `${calling}, not yet met.`, hint };
  });
}

/**
 * The journal's lines (the port's, the 1988 game leaving it to the player's notebook): how the quest stands, each
 * part a line with its count, the parts that are many - the shrines, the dungeons, the Shadowlords - opening onto a
 * line for each; the equipment, Lord British's regalia among it; the companions; and the clues heard. Each line has its hint, for Y.
 */
export function journalTop(g: Game): JournalLine[] {
  const s = g.s;
  const virtues = g.data.table(0x1f4e, 8).map((v) => named(v.trim()));
  const shrine = (v: number): JournalLine => ({
    label: row(virtues[v], questState(g, v)),
    about: shrineStatus(g, v),
    hint: SHRINE_HINTS[v],
  });
  const begun = [0, 1, 2, 3, 4, 5, 6, 7].filter((v) => questState(g, v) === 'ordained' || questState(g, v) === 'answered');
  const done = [0, 1, 2, 3, 4, 5, 6, 7].filter((v) => questState(g, v) === 'done');
  const dungeons = [0, 1, 2, 3, 4, 5, 6, 7].map((d) => ({
    label: row(named(g.data.locations[0x20 + d]?.name ?? ''), s.d58d0[d] !== 0 ? 'unsealed' : ''),
    about: dungeonStatus(g, d),
    hint: DUNGEON_HINTS[d],
  }));
  // The Shadowlords by what each is - Falsehood, Hatred, Cowardice, as the game names their shards (items.ts) - and not
  // by their names, which are for the player to find: to be called up at a flame they must be known.
  const aspects = [0x8d18, 0x8d24, 0x8d2e].map((a) => g.t(a).replace(/[!\s]+$/, ''));
  const shadowlords = [0, 1, 2].map((i) => ({
    label: row(aspects[i], s.shadowlords[i] === 0xff ? 'slain' : ''),
    about: s.shadowlords[i] === 0xff ? 'Slain.' : s.shards[i] !== 0 ? 'At large. Its shard is held.' : 'At large.',
    hint: SHADOWLORD_HINTS[i],
  }));
  const shards = [0, 1, 2].filter((i) => s.shards[i] !== 0).length;
  const none = (what: string): JournalLine[] => [{ label: what, hint: '', enabled: false }];
  return [
    {
      label: row('Shrines', `${done.length}/8`),
      about: 'The Avatar is drawn to the shrines...',
      hint: 'Kneel at a shrine, name its virtue and chant its mantra three times: a quest is ordained. The Codex answers it; return to the shrine to finish it.',
      open: { title: 'Shrines', lines: [0, 1, 2, 3, 4, 5, 6, 7].map(shrine) },
    },
    {
      label: row('Ordained', `${begun.length}/8`),
      hint: 'The Codex answers an ordained quest. It lies on the Isle of the Avatar, in the far southeast: a ship is needed, and its stone guardians let pass only one on a quest. Then return to the shrine to finish it.',
      open: { title: 'Ordained', lines: begun.length ? begun.map(shrine) : none('None yet') },
    },
    {
      label: row('Dungeons unsealed', `${dungeons.filter((_, d) => s.d58d0[d] !== 0).length}/8`),
      hint: 'A sealed dungeon opens to its Word of Power, yelled at its entrance.',
      open: { title: 'Dungeons', lines: dungeons },
    },
    {
      label: row('Shards held', `${shards}`),
      hint: SHARD_HINT,
    },
    {
      label: row('Shadowlords slain', `${shadowlords.filter((_, i) => s.shadowlords[i] === 0xff).length}/3`),
      hint: 'Each Shadowlord is undone by its own shard at the Flame of the principle it opposes: stand at the flame, Yell its name, Pass until it steps in, then Use the shard.',
      open: { title: 'Shadowlords', lines: shadowlords },
    },
    {
      label: 'Equipment',
      hint: 'Guilds sell keys, gems and torches; the rest is found, or given.',
      open: { title: 'Equipment', lines: equipment(g) },
    },
    {
      label: 'Companions',
      hint: 'Those who may join the party: find them, and ask them to join. A party holds six.',
      open: { title: 'Companions', lines: companions(g) },
    },
    // No hint: talking to everyone is the Tips' (tips.ts).
    { label: row('Clues heard', `${g.notes.length}`), hint: '', open: { title: 'Clues heard', lines: clueLines(g) } },
  ];
}

/**
 * The clues' topics, in the journal's order, by the words that put a clue under one (CLUES, each in at least one). A
 * clue goes under every topic it names; the townsfolk's sleeping hours (noteSleeper) have a topic of their own.
 */
const TOPICS: { name: string; words: string[] }[] = [
  { name: 'Mantras', words: ['MANTRA', 'SHRINE'] },
  { name: 'Words of Power', words: ['WORD OF POWER', 'WORDS OF POWER'] },
  { name: 'Shadowlords', words: ['SHADOWLORD', 'FLAME'] },
  { name: 'Shards', words: ['SHARD'] },
  { name: 'Lord British', words: ['LORD BRITISH', 'CROWN', 'SCEPTRE', 'AMULET', 'SANDALWOOD'] },
  { name: 'The Codex', words: ['CODEX'] },
  { name: 'Resistance', words: ['RESISTANCE', 'PASSWORD'] },
  { name: 'Underworld, Doom', words: ['UNDERWORLD', 'DOOM'] },
  { name: 'Other', words: ['MOONSTONE', 'GLASS SWORD', 'GRAPPLE', 'HARPSICHORD', 'PHRASE'] },
];
const SLEEPERS = 'When folk are up';
const asleep = (n: Note): boolean => n.text.startsWith('Asleep. Up and about');

/**
 * The topics of each clue (by TOPICS, or the sleepers'). A paragraph of an answer that names none - kept whole with
 * the paragraph that did (noteConversation) - takes the topics of its neighbour from the same answer.
 */
function topicsOf(notes: Note[]): string[][] {
  const own = notes.map((n) => {
    if (asleep(n)) return [SLEEPERS];
    const u = n.text.toUpperCase();
    return TOPICS.filter((t) => t.words.some((w) => u.includes(w))).map((t) => t.name);
  });
  const same = (a: Note, b: Note | undefined): boolean => !!b && a.who === b.who && a.where === b.where && a.date === b.date;
  return own.map((topics, i) => {
    if (topics.length) return topics;
    for (let k = 1; k < notes.length; k++) {
      for (const j of [i - k, i + k]) if (same(notes[i], notes[j]) && own[j]?.length && !asleep(notes[j])) return own[j];
      if (!same(notes[i], notes[i - k]) && !same(notes[i], notes[i + k])) break;
    }
    return ['Other'];
  });
}

/**
 * Whether a clue is about things all done, and so greyed: it names something the quest has finished with - a virtue or
 * its mantra, its shrine's quest complete; a dungeon (spoken of with its Word) or its Word, unsealed; a Shadowlord or
 * its shard's principle, the Shadowlord slain; a shard, held; the Crown, Sceptre or Amulet, held - and nothing that is
 * not. A clue that names none of these (the Shadowlords at large, a password) is never greyed.
 */
function clueDone(g: Game, text: string): boolean {
  const s = g.s;
  const word = (w: string, caseSensitive = false): boolean =>
    new RegExp(`\\b${w.trim().replace(/[^\w' ]/g, '')}\\b`, caseSensitive ? '' : 'i').test(text);
  const targets: boolean[] = [];
  const virtues = g.data.table(0x1f4e, 8);
  const mantras = g.data.table(0x1f5e, 8);
  for (let v = 0; v < 8; v++) if (word(virtues[v]) || word(mantras[v].toUpperCase(), true)) targets.push(questState(g, v) === 'done');
  const dungeonTalk = /dungeon|word/i.test(text);
  const words = g.data.table(0x4502, 8);
  for (let d = 0; d < 8; d++) {
    const name = named(g.data.locations[0x20 + d]?.name ?? '');
    if (word(words[d].toUpperCase(), true) || (dungeonTalk && name && word(name, true))) targets.push(s.d58d0[d] !== 0);
  }
  const lords = g.data.table(0x444a, 3);
  const principles = ['Falsehood', 'Hatred', 'Cowardice'];
  for (let i = 0; i < 3; i++) {
    if (word(lords[i])) targets.push(s.shadowlords[i] === 0xff);
    if (word(`Shard of ${principles[i]}`)) targets.push(s.shards[i] !== 0 || s.shadowlords[i] === 0xff);
  }
  const regalia: [string, number][] = [
    ['Crown', s.crown],
    ['Sceptre', s.sceptre],
    ['Amulet', s.amulet],
  ];
  for (const [name, held] of regalia) if (word(name)) targets.push(held !== 0);
  return targets.length > 0 && targets.every(Boolean);
}

/**
 * The clues heard by topic (A on Clues heard): each topic with its count, A on it a page of its clues - those still to
 * be acted on first, newest first, then those about things done, greyed. Topics with nothing heard are left out.
 */
function clueLines(g: Game): JournalLine[] {
  const notes = g.notes;
  if (notes.length === 0) return [{ label: 'Nothing yet.', hint: '', enabled: false, about: 'Talk to everyone.' }];
  const topics = topicsOf(notes);
  const out: JournalLine[] = [];
  for (const name of [...TOPICS.map((t) => t.name), SLEEPERS]) {
    const mine = notes
      .map((n, i) => ({ n, i, done: !asleep(n) && clueDone(g, n.text) }))
      .filter(({ i }) => topics[i].includes(name))
      .reverse();
    if (!mine.length) continue;
    const read: { text: string; dim: boolean }[] = [];
    for (const { n, done } of [...mine.filter((m) => !m.done), ...mine.filter((m) => m.done)]) {
      read.push({ text: `${[n.who, n.where !== n.who ? n.where : ''].filter(Boolean).join(', ')}, ${n.date}:`, dim: done });
      read.push({ text: n.text, dim: done });
      read.push({ text: '', dim: done });
    }
    const live = mine.filter((m) => !m.done).length;
    out.push({ label: row(name, live === mine.length ? `${mine.length}` : `${live}/${mine.length}`), hint: '', read });
  }
  return out;
}

/** The clues heard, newest first, each with who said it, where and when. */
export function journalLines(g: Game): string[] {
  const out: string[] = [];
  if (g.notes.length === 0) out.push('Nothing yet. Talk to everyone.');
  for (const n of [...g.notes].reverse()) {
    out.push(`${[n.who, n.where !== n.who ? n.where : ''].filter(Boolean).join(', ')}, ${n.date}:`);
    out.push(n.text);
    out.push('');
  }
  return out;
}
