/**
 * analysis.ts
 *
 * Every conversation in the game read as the player hears it, and every keyword the controller's Say list can offer
 * (menu.ts sayMenu) sorted by the words heard that fit it - the analysis tools/talk/keywords.ts prints, and
 * tests/keywordlabels.test.ts holds the reviewed labels (keywordLabels.ts) to.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { saysWord } from '../../src/game/cmds.ts';
import type { Game } from '../../src/game/game.ts';
import { scriptSpeech, talksBackwards, townsfolkSaying, Vocabulary, wordRoot } from '../../src/game/words.ts';

const TLK = ['TOWNE.TLK', 'DWELLING.TLK', 'CASTLE.TLK', 'KEEP.TLK'];
const NPC = ['TOWNE.NPC', 'DWELLING.NPC', 'CASTLE.NPC', 'KEEP.NPC'];

export interface Person {
  /** The conversation: which of the four files (TOWNE, DWELLING, CASTLE, KEEP), and its number there. */
  file: number;
  talk: number;
  name: string;
  where: string;
  /** Everything they say, in every reply and question. */
  said: string;
  /** Their keywords, and what their questions listen for beyond yes and no. */
  stubs: string[];
  /** Their own words, as the Say list reckons them (words.ts scriptSpeech: not the questions they put). */
  own: Set<string>;
  /** Each keyword's answer, as said. */
  answers: Map<string, string>;
}

export type Verdict = 'none' | 'one' | 'clash' | 'backward';
export interface Row {
  who: Person;
  stub: string;
  verdict: Verdict;
  groups: { words: string[]; by: string[]; own: boolean }[];
}

/** The game's conversations and keywords, sorted (see the top of this file). */
export function analyse(g: Game) {
  const COMPRESSED = g.data.table(0x24ea, 0x80);
  /** The words the game answers itself, before any townsman's own (talk.ts tryStandard), and the list leaves out. */
  const STANDARD = g.data.table(0x4aa8, 0x22);
  /** A conversation's text as heard: letters with bit 7, the compressed words (TALK_04e2's table), codes as gaps. */
  function speech(bytes: number[]): string {
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b === 0xfe || b === 0x85 || b === 0x86 || b === 0x8c)
        i++; // a code with an argument after it
      else if (b > 0 && b < 0x81) out += ` ${COMPRESSED[b - 1] ?? ''} `;
      else if (b === 0x8d) out += '\n';
      else if (b >= 0xa0) out += String.fromCharCode(b & 0x7f);
      else out += ' ';
    }
    return out;
  }

  /** A keyword or answer as written: its letters, bit 7 or not. */
  const stubOf = (bytes: number[]): string => String.fromCharCode(...bytes.map((b) => b & 0x7f)).trim();

  /** Who speaks each conversation, and where: the settlements' NPC tables (npc.ts loadNpcs) name the talk numbers. */
  function whereTalks(file: number): Map<number, string[]> {
    const npcs = g.data.files.get(NPC[file]);
    const out = new Map<number, string[]>();
    for (let m = 0; m < 8; m++) {
      const place = g.data.locations[file * 8 + m]?.name ?? `map ${file * 8 + m + 1}`;
      for (let i = 0; i < 32; i++) {
        const talk = npcs[m * 0x240 + 0x220 + i];
        if (talk === 0 || talk >= 0x80) continue;
        out.set(talk, [...(out.get(talk) ?? []), place]);
      }
    }
    return out;
  }

  /** Every conversation in the four files, read as talk.ts walks them (toKeyword, answersOf). */
  function people(): Person[] {
    const out: Person[] = [];
    TLK.forEach((name, f) => {
      const file = g.data.files.get(name);
      const count = file[0] | (file[1] << 8);
      const entries = Array.from({ length: count }, (_, i) => ({
        talk: file[2 + i * 4] | (file[3 + i * 4] << 8),
        at: file[4 + i * 4] | (file[5 + i * 4] << 8),
      }));
      const starts = entries.map((e) => e.at).sort((a, b) => a - b);
      const places = whereTalks(f);
      for (const { talk, at } of entries) {
        const end = starts.find((s) => s > at) ?? file.length;
        const script = [...file.subarray(at, end)];
        // Its strings, split at 0x00; a 0x90 begins the questions, each its label, question, reply to any other
        // answer, and answer and reply in turn.
        const strings: number[][] = [];
        const marks: number[] = []; // the index of the string each question begins at
        let cur: number[] = [];
        for (let i = 0; i < script.length; i++) {
          const b = script[i];
          if (b === 0x90) {
            if (cur.length) strings.push(cur);
            cur = [];
            marks.push(strings.length);
            i++; // its label
          } else if (b === 0) {
            strings.push(cur);
            cur = [];
          } else cur.push(b);
        }
        if (cur.length) strings.push(cur);
        const firstQuestion = marks[0] ?? strings.length;
        const said: string[] = strings.slice(0, 5).map(speech);
        const stubs: string[] = [];
        const answers = new Map<string, string>();
        for (let i = 5; i < firstQuestion; i += 2) {
          stubs.push(stubOf(strings[i]));
          // An answer that is only 0x87 says the next one's (talk.ts keywordsOf).
          let j = i;
          while (j + 3 < firstQuestion && strings[j + 1]?.length === 1 && strings[j + 1][0] === 0x87) j += 2;
          // A keyword twice in one script is answered by its first (talk.ts findKeyword).
          if (!answers.has(stubOf(strings[i]).toUpperCase()))
            answers.set(
              stubOf(strings[i]).toUpperCase(),
              speech(strings[j + 1] ?? [])
                .replace(/\s+/g, ' ')
                .trim(),
            );
          if (strings[i + 1]) said.push(speech(strings[i + 1]));
        }
        marks.forEach((m, q) => {
          const until = marks[q + 1] ?? strings.length;
          said.push(speech(strings[m] ?? []), speech(strings[m + 1] ?? []));
          for (let i = m + 2; i < until; i += 2) {
            const answer = stubOf(strings[i]);
            if (!/^(y|ye|yes|n|no)$/i.test(answer)) stubs.push(answer);
            if (strings[i + 1]) said.push(speech(strings[i + 1]));
          }
        });
        out.push({
          file: f,
          talk,
          name:
            speech(strings[0] ?? [])
              .trim()
              .replace(/[^A-Za-z' ][\s\S]*$/, '') || `#${talk}`,
          where: (places.get(talk) ?? [name]).join(', '),
          said: said.join(' '),
          stubs: stubs.filter((s) => /^[A-Za-z]/.test(s) && s.length <= 15),
          own: new Set(scriptSpeech(script, COMPRESSED)),
          answers,
        });
      }
    });
    return out;
  }

  /** The words of a text as words.ts takes them (wordsIn), lower case. */
  const wordsOf = (text: string): string[] =>
    text
      .split(/[^A-Za-z0-9']+/)
      .map((w) => w.replace(/^'+|'+$/g, '').toLowerCase())
      .filter((w) => w.length >= 2);

  const root = wordRoot;
  const all = people();
  // Words written with a capital wherever they are said (Blackthorn, Shenstone): names, places, the quest's things.
  const lower = new Set<string>();
  const upper = new Set<string>();
  for (const p of all)
    for (const raw of p.said.split(/[^A-Za-z0-9']+/)) {
      const w = raw.replace(/^'+|'+$/g, '');
      if (w.length < 2) continue;
      (/^[A-Z][a-z]/.test(w) ? upper : /^[a-z]/.test(w) ? lower : upper).add(w.toLowerCase());
    }
  const proper = (w: string): boolean => upper.has(w) && !lower.has(w);
  // What can be learnt: each word anyone says, or the game prints to be read, that the vocabulary would keep
  // (words.ts learn - a word said backwards learnt the right way round, Goeth's), with who says it or where it is
  // written. Whatever reaches the scroll of messages is learnt from (game.ts learnRead): signs and the Codex in their
  // rune letters as printed, what Look sees, the shopkeepers, the shrines, and DATA.OVL's books and messages.
  const learnable = new Map<string, Set<string>>();
  const keeps = new Map<string, string[]>();
  const hear = (text: string, from: string): void => {
    for (const w of wordsOf(text)) {
      if (!keeps.has(w)) {
        const v = new Vocabulary();
        v.learn(g, w);
        keeps.set(
          w,
          v.all().map((x) => x.toLowerCase()),
        );
      }
      for (const kept of keeps.get(w)!) {
        if (!learnable.has(kept)) learnable.set(kept, new Set());
        learnable.get(kept)!.add(from);
      }
    }
  };
  for (const p of all) hear(p.said, `${p.name} (${p.where})`);
  // DATA.OVL: the strings the game prints - every address the code says (say, t) or reads a table of - and not
  // the tables it only matches typing against: the words it answers itself, swearing among them (0x4aa8), and the
  // Lycaeum's lore, asked for and never said (0x4c74), the shrines' virtues as the mantra is checked against them
  // (0x4b3e), and the Oppression's password, asked for at the gate (0x4a9a).
  const MATCHED_ONLY = new Set([0x4aa8, 0x4c74, 0x4b3e, 0x4a9a]);
  const dir = fileURLToPath(new URL('../../src/game/', import.meta.url));
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const code = readFileSync(join(dir, name), 'utf8');
    for (const m of code.matchAll(/(?:say|\.t|sayOvl\(v,) ?\(?(0x[0-9a-f]{3,4})\)/g)) {
      if (!MATCHED_ONLY.has(Number(m[1]))) hear(g.t(Number(m[1])), 'written: DATA.OVL');
    }
    for (const m of code.matchAll(/table\((0x[0-9a-f]{3,4}), ?(0x[0-9a-f]+|[0-9]+)\)/g))
      if (!MATCHED_ONLY.has(Number(m[1]))) for (const t of g.data.table(Number(m[1]), Number(m[2]))) if (t) hear(t, 'written: DATA.OVL');
  }
  for (const file of ['SIGNS.DAT', 'LOOK2.DAT', 'SHOPPE.DAT', 'MISCMSG.DAT']) {
    const bytes = g.data.files.get(file);
    // The printable runs, each a message (or a sign's line, in its rune letters as printed).
    let run = '';
    const flush = (): void => {
      if ((run.match(/[A-Za-z]/g)?.length ?? 0) >= 3) hear(run, `written: ${file}`);
      run = '';
    };
    for (const b of bytes) {
      if (b >= 0x20 && b < 0x7f) run += String.fromCharCode(b);
      else flush();
    }
    flush();
  }

  const said = townsfolkSaying(g);
  const rows: Row[] = [];
  for (const p of all) {
    const own = p.own;
    for (const stub of new Set(p.stubs.map((s) => s.toUpperCase()))) {
      // As the list does: a stub of a letter or two is not offered, nor what the game answers itself.
      if (stub.length < 3 || STANDARD.some((w) => saysWord(w, stub))) continue;
      // As the list matches (words.ts fitsStub): the word as heard, or without its apostrophes (R'hien).
      const fits = [...learnable.keys()].filter(
        (w) => saysWord(stub, w.toUpperCase()) || saysWord(stub, w.replace(/'/g, '').toUpperCase()),
      );
      const byRoot = new Map<string, string[]>();
      for (const w of fits) byRoot.set(root(w), [...(byRoot.get(root(w)) ?? []), w]);
      const groups = [...byRoot.values()].map((words) => ({
        words: words.sort((a, b) => a.length - b.length),
        by: [...new Set(words.flatMap((w) => [...learnable.get(w)!]))],
        own: words.some((w) => own.has(w)),
      }));
      if (groups.length === 0 && stub.length >= 4 && talksBackwards(own, said)) {
        // As the list does where nothing heard fits: a word heard that fits turned about (words.ts forStub - Goeth's).
        const back = [...learnable.keys()].map((w) => [...w].reverse().join('')).filter((w) => saysWord(stub, w.toUpperCase()));
        if (back.length) {
          const by = [...new Set(back.flatMap((w) => [...learnable.get([...w].reverse().join(''))!]))];
          rows.push({ who: p, stub, verdict: 'backward', groups: [{ words: back.sort((a, b) => a.length - b.length), by, own: false }] });
          continue;
        }
      }
      rows.push({ who: p, stub, verdict: groups.length === 0 ? 'none' : groups.length === 1 ? 'one' : 'clash', groups });
    }
  }

  const hidden = rows.filter((r) => {
    if (!r.groups.some((x) => x.own)) return false;
    const others = r.groups.filter((x) => !x.own);
    return others.some((x) => x.by.length >= 10 && !x.words.some(proper));
  });
  // The label rule as the game has it (words.ts forStub with the townsman's own words): certain where their own words
  // that fit are one word's forms; a choice to check where they say two different words that fit (the shortest of
  // theirs is shown); the shortest heard anywhere where they say none.
  const ownRoots = (r: (typeof rows)[number]): number => r.groups.filter((x) => x.own).length;
  const ambiguous = rows.filter((r) => ownRoots(r) > 1);
  const borrowed = rows.filter((r) => r.verdict !== 'none' && r.verdict !== 'backward' && ownRoots(r) === 0 && r.groups.length > 1);
  return { all, rows, learnable, proper, ownRoots, ambiguous, borrowed, hidden };
}
