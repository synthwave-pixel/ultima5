/**
 * placeClues.ts
 *
 * The clues each settlement holds, for the journal's Places (the port's, after the ultima3 port's Towns): every line
 * its townsfolk can say that bears on the quest - by the words the journal notes a clue by (CLUES) - read from the
 * player's own TLK files, and which of them the party has heard. A clue is heard when its line is spoken
 * (talk.ts speak), kept in Fog.named as "clue:<its id>", which goes with the save; a game saved before these were
 * kept counts a clue heard where the journal kept its words.
 */

import type { Game, Note } from './game.ts';

/** What makes a thing said worth noting: the journal's clues (journal.ts noteConversation), and a place's. */
export const CLUES = [
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

/**
 * The Shadowlords' names, from the player's files, upper case: a clue too, and under the Shadowlords' topic, where they
 * are said without the word Shadowlord ("I once served the mighty Astaroth").
 */
export const lordNames = (g: Game): string[] =>
  g.data
    .table(0x444a, 3)
    .map((n) => n.trim().toUpperCase())
    .filter(Boolean);

const NPC_FILES = ['TOWNE.NPC', 'DWELLING.NPC', 'CASTLE.NPC', 'KEEP.NPC'];
const TALK_FILES = ['TOWNE.TLK', 'DWELLING.TLK', 'CASTLE.TLK', 'KEEP.TLK'];

/** A clue a place holds: its id ("<file>:<talk>@<where its line starts in the script>"), who says it, and its words. */
export interface PlaceClue {
  id: string;
  who: string;
  text: string;
  /** Where its line lies in the script: from its start to its end. */
  start: number;
  end: number;
}

/** A script's strings: where each starts and ends, and whether the player hears it said. */
function scriptStrings(script: Uint8Array): { start: number; end: number; spoken: boolean }[] {
  const out: { start: number; end: number; question: boolean }[] = [];
  let start = 0;
  let question = false;
  for (let i = 0; i < script.length; i++) {
    const b = script[i];
    if (b === 0x90) {
      // A labelled question begins: what came before it ends here, and the question's own string after its label.
      if (i > start) out.push({ start, end: i, question });
      i++;
      start = i + 1;
      question = true;
    } else if (b === 0) {
      out.push({ start, end: i, question });
      start = i + 1;
      question = false;
    }
  }
  if (start < script.length) out.push({ start, end: script.length, question });
  // As words.ts scriptSpeech reckons them: the name and description unspoken as lines; the greeting, job and farewell
  // said; then keyword and answer in turn (the answers said) to the first question; each question its question, its
  // reply to any other answer, then answer and reply in turn. Of a question only the replies to its answers count: the
  // question itself asks, and the reply to any other answer is "I know not that Mantra!".
  const first = out.findIndex((s) => s.question);
  const firstQ = first < 0 ? out.length : first;
  const spoken = out.map((_, i) => (i >= 2 && i <= 4) || (i > 4 && i < firstQ && (i - 5) % 2 === 1));
  let q = -1;
  for (let i = firstQ; i < out.length; i++) {
    if (out[i].question) q = i;
    const k = i - q;
    spoken[i] = k >= 3 && k % 2 === 1;
  }
  return out.map((s, i) => ({ start: s.start, end: s.end, spoken: spoken[i] }));
}

/** A string of a script as the player reads it: dictionary words and letters, the codes' places a space. */
function stringText(bytes: Uint8Array, compressed: readonly string[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0xfe || b === 0x85 || b === 0x86 || b === 0x8c) i++;
    else if (b > 0 && b < 0x81) out += ` ${compressed[b - 1] ?? ''} `;
    else if (b >= 0xa0) out += String.fromCharCode(b & 0x7f);
    else out += ' ';
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** The script of talk number `talk` in a TLK file, to where the next begins. */
function scriptOf(tlk: Uint8Array, talk: number): Uint8Array | null {
  const count = tlk[0] | (tlk[1] << 8);
  for (let e = 0; e < count; e++) {
    const at = 2 + e * 4;
    if ((tlk[at] | (tlk[at + 1] << 8)) !== talk) continue;
    const from = tlk[at + 2] | (tlk[at + 3] << 8);
    let to = tlk.length;
    for (let i = 0; i < count; i++) {
      const o = tlk[4 + i * 4] | (tlk[5 + i * 4] << 8);
      if (o > from && o < to) to = o;
    }
    return tlk.subarray(from, Math.min(to, from + 0x400));
  }
  return null;
}

/** Whether words said are a clue (CLUES, or a Shadowlord's name) - not the realm's money, "gold crowns", for a crown. */
export function isClue(g: Game, text: string): boolean {
  const u = text.toUpperCase().replace(/\bGOLD CROWNS?\b/g, '');
  return [...CLUES, ...lordNames(g)].some((c) => u.includes(c));
}

/** Every settlement's clues, by its map id (1-32). Read once and kept. */
export function placeClues(g: Game): Map<number, PlaceClue[]> {
  let found = cache.get(g.data);
  if (found) return found;
  found = new Map();
  const compressed = g.data.table(0x24ea, 0x80);
  for (let id = 1; id <= 32; id++) {
    const file = (id - 1) >> 3;
    const npc = g.data.files.get(NPC_FILES[file]);
    const tlk = g.data.files.get(TALK_FILES[file]);
    const clues: PlaceClue[] = [];
    found.set(id, clues);
    if (!npc?.length || !tlk?.length) continue;
    const base = ((id - 1) & 7) * 0x240;
    const talks = new Set<number>();
    for (let i = 0; i < 32; i++) {
      const talk = npc[base + 0x220 + i];
      if (talk === 0 || talks.has(talk)) continue;
      talks.add(talk);
      const script = scriptOf(tlk, talk);
      if (!script) continue;
      const strings = scriptStrings(script);
      // Their name as talk.ts scriptName reads it: its letters, to the first thing that is not one.
      const named = stringText(script.subarray(strings[0]?.start ?? 0, strings[0]?.end ?? 0), compressed);
      const who = /^[A-Za-z][A-Za-z' ]*[A-Za-z]/.exec(named)?.[0] ?? named;
      for (const s of strings) {
        if (!s.spoken) continue;
        const text = stringText(script.subarray(s.start, s.end), compressed);
        if (text && isClue(g, text)) clues.push({ id: `${file}:${talk}@${s.start}`, who, text, start: s.start, end: s.end });
      }
    }
  }
  cache.set(g.data, found);
  return found;
}
const cache = new WeakMap<Game['data'], Map<number, PlaceClue[]>>();

/**
 * The clues of a conversation's lines spoken (talk.ts): `labels` its file and talk number ("0:20:"), `spokeAt` where in
 * its script each line spoken began. Each clue among them kept heard (Fog.named).
 */
export function heardLines(g: Game, labels: string, spokeAt: Iterable<number>): void {
  const [file, talk] = labels.split(':').map(Number);
  const mine = (placeClues(g).get(g.s.mapId) ?? []).filter((c) => c.id.startsWith(`${file}:${talk}@`));
  // A line spoken from anywhere within its string (an alternative's second half is spoken from its middle).
  for (const at of spokeAt) for (const c of mine) if (at >= c.start && at <= c.end) g.fog.named.add(`clue:${c.id}`);
}

/** Letters only, upper case: words compared whatever the spacing and the codes between them. */
const letters = (text: string): string => text.toUpperCase().replace(/[^A-Z]/g, '');

/**
 * Whether a place's clue has been heard: kept as heard, or - a game from before they were kept - its words in a clue
 * the journal noted there (its longest run of words between the script's codes).
 */
export function clueHeard(g: Game, clue: PlaceClue, notes: Note[]): boolean {
  if (g.fog.named.has(`clue:${clue.id}`)) return true;
  const run = letters(clue.text);
  if (run.length < 12) return false;
  const probe = run.slice(0, 24);
  return notes.some((n) => letters(n.text).includes(probe));
}
