/**
 * words.ts
 *
 * What the player has heard said, and may say back (the port's). Ultima V
 * asks the player to type: a keyword at a townsman, a mantra at a shrine,
 * a word of power at a dungeon's mouth. On a controller that means
 * picking the letters out one at a time, which is a poor way to hold a
 * conversation, so a player reading the keyboard as a pad is offered
 * instead a list of the words they have learnt.
 *
 * A word is learnt by being said or read where the party could hear or
 * see it: in a conversation, on a sign, in a book. Only words the game
 * answers to are kept - every townsman's keywords, the eight mantras and
 * the virtues, the eight words of power, the Lycaeum's lore, the three
 * Shadowlords' names, the Oppression's password - so the list
 * is of things worth saying rather than of every word in Britannia.
 *
 * The keywords in the game's own files are cut short, often to four
 * letters ("shad" for the Shadowlords), so the list keeps the word as it
 * was heard and matches it against that stub the way the original matches
 * what a player types (cmds.ts saysWord).
 */

import type { Game } from './game.ts';
import { saysWord } from './cmds.ts';

/**
 * What a well grants (look.ts): a horse, and the five jokes Origin left
 * beside it. Nobody in Britannia says those five, so they are never
 * learnt and never offered - the joke keeps itself.
 */
export const WISHES = [0x7242, 0x724c, 0x7254, 0x7260, 0x7266, 0x726e];

/** How a word is written in the record: upper case, letters and digits only. */
const key = (word: string): string =>
  word
    .toUpperCase()
    .replace(/[^A-Z0-9']/g, '')
    // An apostrophe within a word is part of it (Sin'Vraal); round it, it is a quotation mark ("He sayeth 'Cah'!").
    .replace(/^'+|'+$/g, '');

/**
 * The words of a line of speech. Two letters is enough, since two of the
 * mantras are that short (Mu, Ra, Om) - a word that short is only learnt
 * when it is one the game answers to exactly.
 */
const wordsIn = (text: string): string[] => text.split(/[^A-Za-z0-9']+/).filter((w) => w.length >= 2);

/**
 * Every word the game answers to, from the player's own files: each
 * townsman's keywords, the mantras and virtues, the words of power and
 * the Lycaeum's lore. Read once and kept, since nothing in it changes.
 */
function answerable(g: Game): Set<string> {
  if (!cached.has(g.data)) {
    const stubs = new Set<string>();
    for (const name of ['TOWNE.TLK', 'DWELLING.TLK', 'CASTLE.TLK', 'KEEP.TLK']) {
      const file = g.data.files.get(name);
      if (!file?.length) continue;
      const count = file[0] | (file[1] << 8);
      for (let i = 0; i < count; i++) {
        const at = 2 + i * 4;
        const script = file.subarray(file[at + 2] | (file[at + 3] << 8), i + 1 < count ? file[at + 6] | (file[at + 7] << 8) : file.length);
        for (const word of scriptKeywords(script)) stubs.add(key(word));
        // And what their questions listen for (the Resistance's password, a name), beyond yes and no.
        for (const word of scriptAnswers(script)) if (word.length > 2) stubs.add(key(word));
      }
    }
    for (const table of [
      g.data.table(0x1f4e, 8), // the virtues
      g.data.table(0x1f5e, 8), // their mantras
      g.data.table(0x4502, 8), // the words of power
      g.data.table(0x4c74, 0x1a), // the Lycaeum's lore
      WISHES.map((a) => g.t(a)), // what a well will grant
      g.data.table(0x444a, 3), // the Shadowlords' names, yelled at their flames
      [g.t(0x4a9a)], // the password the Oppression's guards ask of one who wears the badge
    ]) {
      for (const word of table) if (word) stubs.add(key(word));
    }
    stubs.delete('');
    cached.set(g.data, stubs);
  }
  return cached.get(g.data)!;
}
const cached = new WeakMap<Game['data'], Set<string>>();

/** Whether the game answers to the word (it, or a stub of it, is a keyword, an answer, a mantra, a word of power...). */
export function answersTo(g: Game, word: string): boolean {
  const answers = answerable(g);
  const k = key(word);
  for (let n = 2; n <= k.length; n++) if (answers.has(k.slice(0, n)) && (n >= 3 || n === k.length)) return true;
  return false;
}

/** How many of Britannia's townsfolk say each word (scriptSpeech, their questions too): what is rare is a topic. */
export function townsfolkSaying(g: Game): (word: string) => number {
  if (!saying.has(g.data)) {
    const count = new Map<string, number>();
    const compressed = g.data.table(0x24ea, 0x80);
    for (const name of ['TOWNE.TLK', 'DWELLING.TLK', 'CASTLE.TLK', 'KEEP.TLK']) {
      const file = g.data.files.get(name);
      if (!file?.length) continue;
      const n = file[0] | (file[1] << 8);
      const starts = Array.from({ length: n }, (_, i) => file[4 + i * 4] | (file[5 + i * 4] << 8)).sort((a, b) => a - b);
      for (const at of starts) {
        const end = starts.find((s) => s > at) ?? file.length;
        for (const w of new Set(scriptSpeech(file.subarray(at, end), compressed, true))) count.set(w, (count.get(w) ?? 0) + 1);
      }
    }
    saying.set(g.data, count);
  }
  const count = saying.get(g.data)!;
  return (word) => count.get(word.toLowerCase()) ?? 0;
}
const saying = new WeakMap<Game['data'], Map<string, number>>();

/** A word's root, for its forms (shadowlord, shadowlords, shadowlord's; seek, seeketh) against another word. */
export function wordRoot(word: string): string {
  // An ending elided as the bards sing it is the ending: "misbehav'd" is misbehaved.
  let w = word.toLowerCase().replace(/'s$/, '').replace(/'d$/, 'ed');
  for (const suffix of ['eth', 'ings', 'ing', 'ers', 'er', 'ies', 'es', 'ed', 'ly', 's'])
    if (w.length - suffix.length >= 3 && w.endsWith(suffix)) {
      w = w.slice(0, -suffix.length);
      break;
    }
  return w.replace(/e$/, '');
}

const sameRoot = (a: string, b: string): boolean => wordRoot(a) === wordRoot(b);

/**
 * A word heard (as the record keys it) that says a townsman's keyword: as typed, or without its apostrophes - a
 * name heard as "R'hien" is Lady Hayden's "rhie", as "RHIEN" typed was in 1988 (the word said is then sayable).
 */
const fitsStub = (stub: string, k: string): boolean => saysWord(stub, k) || (k.includes("'") && saysWord(stub, k.replace(/'/g, '')));

/** The word to say for a keyword: as heard, or without its apostrophes where only that says it (fitsStub). */
export function sayable(stub: string, word: string): string {
  return saysWord(stub, word.toUpperCase()) ? word : word.replace(/'/g, '');
}

/**
 * Whether a townsman talks backwards, as Goeth of Jhelom does: three or more of their own words of five letters or
 * more are, turned about, a word other townsfolk say, and are themselves said by hardly anyone ("rewop", "erehw").
 * Only to such a one is a word heard offered turned about (Vocabulary.forStub).
 */
export function talksBackwards(own: ReadonlySet<string>, said: (word: string) => number): boolean {
  let n = 0;
  for (const w of own) {
    const back = [...w].reverse().join('');
    if (w.length >= 5 && back !== w && said(w) <= 2 && said(back) > 0) n++;
  }
  return n >= 3;
}

/**
 * What a townsman says, as the player hears it - every line of their conversation (the name, the greeting, the job,
 * each keyword's answer, each question's replies, and with `asked` the questions themselves), not the keywords and
 * answers they listen for - lower case, a word at a time. `compressed` is DATA.OVL's table of words the scripts use
 * by number (talk.ts processChar). A question is left out of a townsman's own words for the Say list: what they ask
 * is not what they are asked about (Greyson's "Who dost thou think...?" against the "things" he has seen).
 */
export function scriptSpeech(script: ArrayLike<number>, compressed: readonly string[], asked = false): string[] {
  const strings: number[][] = [];
  const questions: number[] = [];
  let cur: number[] = [];
  for (let i = 0; i < script.length; i++) {
    const b = script[i];
    if (b === 0x90) {
      if (cur.length) strings.push(cur);
      cur = [];
      questions.push(strings.length);
      i++; // its label
    } else if (b === 0) {
      strings.push(cur);
      cur = [];
    } else cur.push(b);
  }
  if (cur.length) strings.push(cur);
  const text = (bytes: number[] | undefined): string => {
    let out = '';
    for (let i = 0; bytes && i < bytes.length; i++) {
      const b = bytes[i];
      if (b === 0xfe || b === 0x85 || b === 0x86 || b === 0x8c)
        i++; // a code with an argument after it
      else if (b > 0 && b < 0x81) out += ` ${compressed[b - 1] ?? ''} `;
      else if (b >= 0xa0) out += String.fromCharCode(b & 0x7f);
      else out += ' ';
    }
    return out;
  };
  // The name, description, greeting, job and farewell; then keyword and answer in turn until the first question;
  // each question its question, its reply to any other answer, then answer and reply in turn.
  const first = questions[0] ?? strings.length;
  const said = strings.slice(0, 5).map(text);
  for (let i = 6; i < first; i += 2) said.push(text(strings[i]));
  questions.forEach((q, n) => {
    if (asked) said.push(text(strings[q]));
    said.push(text(strings[q + 1]));
    for (let i = q + 3; i < (questions[n + 1] ?? strings.length); i += 2) said.push(text(strings[i]));
  });
  return said
    .join(' ')
    .split(/[^A-Za-z0-9']+/)
    .map((w) => w.replace(/^'+|'+$/g, '').toLowerCase())
    .filter((w) => w.length >= 2);
}

/**
 * The keywords of one script, by the original's own reckoning (talk.ts
 * toKeyword): the strings are the name, the description, the greeting,
 * the job and the farewell, and then keyword and answer in turn, until a
 * 0x90 byte begins the labelled questions and the keywords are done.
 * Letters carry bit 7, as everything spoken does.
 */
export function scriptKeywords(script: Uint8Array): string[] {
  const out: string[] = [];
  let at = 0;
  /** Past the end of the string here; false where the keywords have run out. */
  const skip = (): boolean => {
    for (;;) {
      if (at >= script.length) return false;
      const c = script[at++];
      if (c === 0) return true;
      if (c === 0x90) return false;
    }
  };
  for (let i = 0; i < 5; i++) if (!skip()) return out;
  for (let n = 0; n < 40; n++) {
    let word = '';
    for (;;) {
      if (at >= script.length || script[at] === 0x90) return out;
      const c = script[at++];
      if (c === 0) break;
      word += String.fromCharCode(c & 0x7f);
    }
    // The player types at most fifteen letters (talk.ts readWords), so anything longer is not a keyword
    // but a script this reading has lost its place in.
    if (!word || word.length > 15) return out;
    out.push(word);
    if (!skip()) return out; // the answer that follows it
  }
  return out;
}

/**
 * The answers a script's questions listen for: after the keywords, each
 * question is a 0x90 and its label, the question, the reply to any other
 * answer, and then answer and reply in turn.
 */
export function scriptAnswers(script: Uint8Array): string[] {
  const out: string[] = [];
  for (let p = 0; p < script.length; p++) {
    if (script[p] !== 0x90) continue;
    let q = p + 2;
    const str = (): string => {
      let s = '';
      while (q < script.length && script[q] !== 0 && script[q] !== 0x90) s += String.fromCharCode(script[q++] & 0x7f);
      q++;
      return s;
    };
    str();
    str();
    while (q < script.length && script[q - 1] !== 0x90) {
      const word = str();
      if (!word || word.charCodeAt(0) < 0x20 || word.length > 15) break;
      out.push(word);
      str();
    }
  }
  return out;
}

/**
 * What every Avatar knows before a word is said in Britannia: what the game's own opening has told them, and the Book
 * of Lore that came with it.
 *   - Lord British, whose realm it is. Four townsmen ask it (Greyson, who rules Britannia by right; Thorne, Landon and
 *     Wartow, whom the party serves - Thorne's Mantra of Valor hangs on it), and a list can only offer it once known.
 *   - The opening story's: the Avatar's summoning by Shamino, with Iolo, to a Britannia under Blackthorn and the
 *     Shadowlords, the Great Council, the Codex and its Abyss.
 *   - The eight virtues, which the gypsy's questions weigh against one another as the Avatar is made.
 * Each is a word the game answers to (tests/words.test.ts).
 */
export const KNOWN_FROM_THE_START = [
  'British',
  'Britannia',
  'Blackthorn',
  'Shadowlords',
  'Council',
  'Codex',
  'Abyss',
  'Iolo',
  'Shamino',
  'Honesty',
  'Compassion',
  'Valor',
  'Justice',
  'Sacrifice',
  'Honor',
  'Spirituality',
  'Humility',
];

/** The record as it is written into the saved game. */
export interface WordData {
  /** Every word learnt, as it was first heard. */
  known: string[];
  /** Which of an NPC's keywords have been answered: "map.npc.n". */
  heard: string[];
  /** The word each keyword has been offered as, by keyword (Vocabulary.forStub): [stub, word]. */
  labels?: [string, string][];
}

export class Vocabulary {
  /** The word as first heard, by its written form. */
  private readonly known = new Map<string, string>();
  /** Answers already heard, so a word can be shown as asked and answered. */
  private readonly heard = new Set<string>();
  /**
   * The word a keyword was first offered as, by the keyword: a word heard later that fits it too (Greyson's
   * "things", offered as Things, and then his question "Who dost thou think...") does not take its place, and a
   * list does not change its words under the player.
   */
  private readonly labels = new Map<string, string>();

  constructor() {
    for (const word of KNOWN_FROM_THE_START) this.add(word.toLowerCase()); // as a word heard is kept
  }

  /** Whether a word has been heard said, in any form that matches it. */
  knows(word: string): boolean {
    return this.known.has(key(word));
  }

  get size(): number {
    return this.known.size;
  }

  /** Every word learnt, as first heard. */
  all(): string[] {
    return [...this.known.values()];
  }

  /**
   * Learn from something said or read: every word in it the game answers
   * to is kept, as it was written there. Returns how many were new.
   */
  learn(g: Game, text: string): number {
    const answers = answerable(g);
    let added = 0;
    for (const word of wordsIn(text)) {
      const k = key(word);
      if (!k || this.known.has(k)) continue;
      // The word itself, or the stub of it the game answers to - as heard, or without its apostrophes (R'hien).
      let matched = false;
      for (const w of k.includes("'") ? [k, k.replace(/'/g, '')] : [k]) {
        matched ||= answers.has(w);
        for (let n = 3; !matched && n < w.length; n++) matched = answers.has(w.slice(0, n));
      }
      if (!matched) {
        // Goeth of Jhelom, quite mad, says everything backwards, and the word of power he remembers with it
        // ("AIPONI"): a word that is one of the game's own turned about is learnt as the word it is. The riddle is
        // Trian's to give away ("saying each word backwards oft is of some help"), and a list cannot be typed into.
        const back = [...k].reverse().join('');
        if (k.length >= 5 && answers.has(back) && !this.known.has(back)) {
          this.known.set(back, back);
          added++;
        }
        continue;
      }
      const bare = word.replace(/^'+|'+$/g, '');
      this.known.set(k, bare.toUpperCase() === bare ? bare : bare.toLowerCase());
      added++;
    }
    return added;
  }

  /** Learn a word outright, however it was come by (a mantra given, a word read from the game's own tables). */
  add(word: string): void {
    const k = key(word);
    if (k && !this.known.has(k)) this.known.set(k, word);
  }

  /**
   * The word heard that the player could say to this keyword, and the
   * list shows for it. A stub of four letters may have been heard as
   * several words, from several townsfolk ("thin": things, think, thine).
   * Where this keyword's label has been settled by hand (`reviewed`,
   * keywordLabels.ts), it is that, once a form of that word has been heard -
   * and till then the keyword is not offered.
   * Else where the townsman asked says some of them (`own`, the words of
   * their own conversation, scriptSpeech), the one they say is theirs to
   * be asked about - Annon's "blac" is Blackthorn, not black - or failing
   * that a form of it; of two of theirs, the one fewer townsfolk say
   * (`said`, townsfolkSaying); and none at all till one of theirs is heard. The label otherwise stays as first
   * offered, and is at first the shortest, likeliest the word itself
   * ("man" over "many"). Every word heard that fits the keyword still says
   * it, as typed in 1988: only the label is chosen.
   */
  forStub(
    stub: string,
    whole = false,
    {
      own,
      said = () => 0,
      reviewed,
      backwards = true,
    }: { own?: ReadonlySet<string> | undefined; said?: (word: string) => number; reviewed?: string; backwards?: boolean } = {},
  ): string | null {
    const s = key(stub);
    if (!s) return null;
    if (reviewed && !whole) {
      const fits = [...this.known.entries()].filter(([k]) => fitsStub(s, k)).sort(([a], [b]) => a.length - b.length);
      const it = fits.find(([k]) => k === key(reviewed)) ?? fits.find(([, w]) => sameRoot(reviewed, w));
      // Not offered at all till that word is heard: another that only begins the same way ("land", for Chamfort's
      // Landon) would ask of what the player has not yet learnt, and the answer make no sense.
      return it ? it[1] : null;
    }
    if (own && !whole) {
      // Of theirs, the rarest in Britannia first - a topic is the uncommon word (Zachariah's comets, not "come") -
      // then the shortest.
      const fits = [...this.known.entries()]
        .filter(([k]) => fitsStub(s, k))
        .sort(([a, x], [b, y]) => said(x) - said(y) || a.length - b.length);
      const theirs = fits.find(([, w]) => own.has(w.toLowerCase())) ?? fits.find(([, w]) => [...own].some((o) => sameRoot(o, w)));
      if (theirs) return theirs[1];
      // Where the townsman says a word that fits and it has not been heard, a stranger's word that only begins the
      // same way is not offered: it would ask after what the player has yet to learn - Judge Dryden's pleading asked
      // as "please", Mario's escape as "scale" - and the answer make no sense.
      if ([...own].some((w) => fitsStub(s, key(w)))) return null;
    }
    const kept = whole ? undefined : this.labels.get(s);
    if (kept !== undefined && this.known.has(key(kept))) return kept;
    let best: string | null = null;
    for (const [k, word] of this.known) {
      // A townsman's keyword is a stub, and stands for the words that begin with it ("shad" for the Shadowlords).
      // A word from one of the game's own lists of whole words is `whole` - Mu, Ra, Summ - and only itself will
      // do: "much" is not a mantra, nor "summon".
      if (whole ? k !== s : !fitsStub(s, k)) continue;
      if (best === null || k.length < key(best).length) best = word;
    }
    // Goeth of Jhelom listens only for words said backwards ("drow", "rewop", "dratsed"), which nobody ever says
    // to be heard: where nothing heard fits a townsman's keyword, a word heard that fits it turned about is
    // offered turned about. (Trian gives the riddle away: "saying each word backwards oft is of some help".) Only
    // to one who talks backwards (`backwards`, talksBackwards): Lord R'hien's "stev" is not Thorkin's rivets.
    if (best === null && !whole && backwards && s.length >= 4) {
      for (const k of this.known.keys()) {
        const back = [...k].reverse().join('');
        if (saysWord(s, back) && (best === null || back.length < best.length)) best = back.toLowerCase();
      }
    }
    if (best !== null && !whole) this.labels.set(s, best);
    return best;
  }

  /** Whether this NPC has already answered their keyword `n` (or a standard one, by name). */
  wasHeard(mapId: number, npc: number, n: number | string): boolean {
    return this.heard.has(`${mapId}.${npc}.${n}`);
  }

  markHeard(mapId: number, npc: number, n: number | string): void {
    this.heard.add(`${mapId}.${npc}.${n}`);
  }

  /** Everything another record knows, added to this one; what is learnt is never unlearnt. */
  merge(other: Vocabulary): void {
    for (const [k, word] of other.known) if (!this.known.has(k)) this.known.set(k, word);
    for (const h of other.heard) this.heard.add(h);
    for (const [s, word] of other.labels) if (!this.labels.has(s)) this.labels.set(s, word);
  }

  /** Back to what a new Avatar knows (KNOWN_FROM_THE_START). */
  clear(): void {
    this.known.clear();
    this.heard.clear();
    this.labels.clear();
    for (const word of KNOWN_FROM_THE_START) this.add(word.toLowerCase()); // as a word heard is kept
  }

  encode(): WordData {
    return { known: [...this.known.values()], heard: [...this.heard], labels: [...this.labels] };
  }

  static decode(d: Partial<WordData> | undefined): Vocabulary {
    const v = new Vocabulary();
    for (const word of d?.known ?? []) if (typeof word === 'string') v.add(word);
    for (const h of d?.heard ?? []) if (typeof h === 'string') v.heard.add(h);
    for (const l of d?.labels ?? []) if (Array.isArray(l) && typeof l[0] === 'string' && typeof l[1] === 'string') v.labels.set(l[0], l[1]);
    return v;
  }
}
