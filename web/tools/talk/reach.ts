/**
 * reach.ts
 *
 * A player's way through every conversation in the game, by the controller's lists alone (menu.ts sayMenu and
 * answerMenu, words.ts forStub): what can be asked, and what each keyword is offered as. The player begins knowing
 * what is written to be read (signs, books, Look, the shops, DATA.OVL's messages: analysis.ts) and what each
 * townsman says unasked - their name, how they look, their greeting, their trade, their farewell. Then, round and
 * round until nothing more is learnt: every keyword the Say list would offer is asked, its answer heard, and the
 * questions it leads to asked and answered - Yes, No, any other answer, and each word listened for that the Answer
 * list would offer - each reply heard in its turn.
 *
 * What is left over is what no player with a controller can reach without Add word: a keyword never offered, a
 * question never asked, a word a question listens for never offered. And along the way, a keyword or answer offered
 * by a word that is not the townsman's own - another's that only begins the same way, which would ask after what the
 * player has yet to learn (Chamfort's Landon offered as "land").
 */

import { saysWord } from '../../src/game/cmds.ts';
import type { Game } from '../../src/game/game.ts';
import { KEYWORD_LABELS } from '../../src/game/keywordLabels.ts';
import { scriptSpeech, talksBackwards, townsfolkSaying, Vocabulary, wordRoot } from '../../src/game/words.ts';
import { analyse } from './analysis.ts';

const TLK = ['TOWNE.TLK', 'DWELLING.TLK', 'CASTLE.TLK', 'KEEP.TLK'];

/** A part of a script and the labelled blocks it goes on to (0x91 to 0x9f, after 0x8c, 0x8f and the like). */
interface Said {
  text: string;
  labels: number[];
}
interface Reply extends Said {
  stub: string;
}
/** A labelled block: a question, with the reply to any other answer and the answers it listens for. */
interface Block extends Said {
  label: number;
  other: Said;
  replies: Reply[];
}
interface Townsman {
  /** "file:talk", as keywordLabels.ts keys its labels. */
  key: string;
  name: string;
  where: string;
  opening: Said;
  keywords: Reply[];
  blocks: Map<number, Block>;
  own: Set<string>;
}

export interface Reach {
  /** Keywords never offered: "Name (where) STUB". */
  unasked: string[];
  /** Questions never asked: "Name (where) #label: question". */
  unaskedQuestions: string[];
  /** Words a question listens for, never offered: "Name (where) #label STUB". */
  unoffered: string[];
  /** Keywords and answers offered by a word not the townsman's own, where they say one that fits. */
  strangers: string[];
  counts: { keywords: number; questions: number; answers: number; vocabulary: number };
}

/** Every conversation's script, read into its parts. */
function townsfolk(g: Game): Townsman[] {
  const compressed = g.data.table(0x24ea, 0x80);
  const speech = (bytes: number[]): string => {
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b === 0xfe || b === 0x85 || b === 0x86 || b === 0x8c) i++;
      else if (b > 0 && b < 0x81) out += ` ${compressed[b - 1] ?? ''} `;
      else if (b === 0x8d) out += '\n';
      else if (b >= 0xa0) out += String.fromCharCode(b & 0x7f);
      else out += ' ';
    }
    return out.replace(/\s+/g, ' ').trim();
  };
  const said = (bytes: number[] = []): Said => ({ text: speech(bytes), labels: bytes.filter((b) => b >= 0x91 && b <= 0x9f) });
  const stubOf = (bytes: number[] = []): string => String.fromCharCode(...bytes.map((b) => b & 0x7f)).trim();
  /** An answer that is only 0x87 says the next one's (talk.ts keywordsOf), in a list of keywords or of replies. */
  const forwarded = (strings: number[][], i: number, until: number): number => {
    let j = i;
    while (j + 3 < until && strings[j + 1]?.length === 1 && strings[j + 1][0] === 0x87) j += 2;
    return j;
  };
  const where = new Map(analyse(g).all.map((p) => [`${p.file}:${p.talk}`, p.where]));
  const out: Townsman[] = [];
  TLK.forEach((name, f) => {
    const file = g.data.files.get(name);
    const count = file[0] | (file[1] << 8);
    const entries = Array.from({ length: count }, (_, i) => ({
      talk: file[2 + i * 4] | (file[3 + i * 4] << 8),
      at: file[4 + i * 4] | (file[5 + i * 4] << 8),
    }));
    const starts = entries.map((e) => e.at).sort((a, b) => a - b);
    for (const { talk, at } of entries) {
      const script = file.subarray(at, starts.find((s) => s > at) ?? file.length);
      const strings: number[][] = [];
      const marks: { at: number; label: number }[] = [];
      let cur: number[] = [];
      for (let i = 0; i < script.length; i++) {
        const b = script[i];
        if (b === 0x90) {
          if (cur.length) strings.push(cur);
          cur = [];
          marks.push({ at: strings.length, label: script[++i] });
        } else if (b === 0) {
          strings.push(cur);
          cur = [];
        } else cur.push(b);
      }
      if (cur.length) strings.push(cur);
      const first = marks[0]?.at ?? strings.length;
      const keywords: Reply[] = [];
      for (let i = 5; i < first; i += 2)
        keywords.push({ stub: stubOf(strings[i]).toUpperCase(), ...said(strings[forwarded(strings, i, first) + 1]) });
      const blocks = new Map<number, Block>();
      marks.forEach((m, q) => {
        const until = marks[q + 1]?.at ?? strings.length;
        const replies: Reply[] = [];
        for (let i = m.at + 2; i < until; i += 2)
          replies.push({ stub: stubOf(strings[i]), ...said(strings[forwarded(strings, i, until) + 1]) });
        blocks.set(m.label, { label: m.label, ...said(strings[m.at]), other: said(strings[m.at + 1]), replies });
      });
      const opening = strings.slice(0, 5).map((s) => said(s));
      out.push({
        key: `${f}:${talk}`,
        name: speech(strings[0] ?? []).replace(/[^A-Za-z' ][\s\S]*$/, ''),
        where: where.get(`${f}:${talk}`) ?? '?',
        opening: { text: opening.map((s) => s.text).join(' '), labels: opening.flatMap((s) => s.labels) },
        keywords,
        blocks,
        own: new Set(scriptSpeech(script, compressed)),
      });
    }
  });
  return out;
}

const yesNo = (stub: string): boolean => /^(y|ye|yes|n|no)$/i.test(stub);

/** The way through every conversation (see the top of this file). */
export function reach(g: Game): Reach {
  const folk = townsfolk(g);
  const said = townsfolkSaying(g);
  const STANDARD = g.data.table(0x4aa8, 0x22);
  const v = new Vocabulary();
  for (const [w, from] of analyse(g).learnable) if ([...from].some((s) => s.startsWith('written:'))) v.learn(g, w);
  for (const t of folk) v.learn(g, t.opening.text);

  const asked = new Set<string>();
  const blocksHeard = new Set<string>();
  const answered = new Set<string>();
  const strangers: string[] = [];
  /** A label offered for `stub`, checked against the townsman's own words that fit it. */
  const offered = (t: Townsman, stub: string, word: string, what: string): void => {
    const theirs = [...t.own].filter((w) => saysWord(stub.toUpperCase(), w.toUpperCase()));
    if (theirs.length && !KEYWORD_LABELS[`${t.key}:${stub.toUpperCase()}`] && !theirs.some((w) => wordRoot(w) === wordRoot(word)))
      strangers.push(`${t.name} (${t.where}) ${what} ${stub}: offered "${word}", theirs ${theirs.join('/')}`);
  };
  const hear = (t: Townsman, s: Said): void => {
    v.learn(g, s.text);
    for (const l of s.labels) {
      const b = t.blocks.get(l);
      if (!b || blocksHeard.has(`${t.key}#${l}`)) continue;
      blocksHeard.add(`${t.key}#${l}`);
      hear(t, b);
    }
  };
  for (const t of folk) hear(t, t.opening);
  for (let changed = true; changed; ) {
    changed = false;
    for (const t of folk) {
      const backwards = !t.own.size || talksBackwards(t.own, said);
      const label = (stub: string): string | null =>
        v.forStub(stub, false, { own: t.own, said, backwards, reviewed: KEYWORD_LABELS[`${t.key}:${stub.toUpperCase()}`] });
      for (const k of t.keywords) {
        if (k.stub.length < 3 || STANDARD.some((w) => saysWord(w, k.stub)) || asked.has(`${t.key}:${k.stub}`)) continue;
        const word = label(k.stub);
        if (!word || STANDARD.some((w) => saysWord(w, word.toUpperCase()))) continue;
        asked.add(`${t.key}:${k.stub}`);
        offered(t, k.stub, word, 'keyword');
        hear(t, k);
        changed = true;
      }
      for (const [l, b] of t.blocks) {
        if (!blocksHeard.has(`${t.key}#${l}`)) continue;
        if (!answered.has(`${t.key}#${l}:*`)) {
          answered.add(`${t.key}#${l}:*`);
          hear(t, b.other);
          changed = true;
        }
        for (const r of b.replies) {
          if (answered.has(`${t.key}#${l}:${r.stub}`)) continue;
          // As the Answer list offers: Yes and No; a letter alone is a way of saying yes, not offered.
          const word = yesNo(r.stub) ? 'yes' : r.stub.length < 2 ? null : label(r.stub);
          if (!word) continue;
          answered.add(`${t.key}#${l}:${r.stub}`);
          if (!yesNo(r.stub)) offered(t, r.stub, word, `#${l.toString(16)} answer`);
          hear(t, r);
          changed = true;
        }
      }
    }
  }
  const who = (t: Townsman): string => `${t.name} (${t.where})`;
  // A script's last block (0x9f) is its end, "@": no question.
  const real = (b: Block): boolean => b.text !== '@';
  return {
    unasked: folk.flatMap((t) =>
      t.keywords
        .filter((k) => k.stub.length >= 3 && !STANDARD.some((w) => saysWord(w, k.stub)) && !asked.has(`${t.key}:${k.stub}`))
        .map((k) => `${who(t)} ${k.stub}`),
    ),
    unaskedQuestions: folk.flatMap((t) =>
      [...t.blocks.values()]
        .filter((b) => real(b) && !blocksHeard.has(`${t.key}#${b.label}`))
        .map((b) => `${who(t)} #${b.label.toString(16)}: ${b.text.slice(0, 60)}`),
    ),
    unoffered: folk.flatMap((t) =>
      [...t.blocks.values()]
        .filter((b) => real(b) && blocksHeard.has(`${t.key}#${b.label}`))
        .flatMap((b) =>
          b.replies
            .filter((r) => !yesNo(r.stub) && r.stub.length >= 2 && !answered.has(`${t.key}#${b.label}:${r.stub}`))
            .map((r) => `${who(t)} #${b.label.toString(16)} ${r.stub}`),
        ),
    ),
    strangers,
    counts: { keywords: asked.size, questions: blocksHeard.size, answers: answered.size, vocabulary: v.size },
  };
}
