/**
 * audit.ts
 *
 * Every conversation in the game played as a controller's player has it, through the game's own Say and Answer
 * lists (menu.ts sayMenu, answerMenu) and its own conversation (talk.ts): beginning with what a new Avatar knows and
 * what is written to be read (analysis.ts), each townsman in turn is talked to - every Say line asked, each
 * question's answers taken in turn - and what they say learnt (words.ts), round after round until nothing more is.
 * Where reach.ts reads the scripts, this plays them: a line is reached only by the keyword the game itself matches
 * for it (the first that fits), a question only as the game goes to it (TALK_0f32), with the karma at its highest
 * and each townsman knowing the Avatar once told their name.
 *
 * What it tells, against every script read whole (reach.ts townsfolk):
 *
 * - the replies (a keyword and those that say the same) never heard, the questions never asked, and the words a
 *   question listens for never given;
 * - every Say line whose reply was another keyword's (the word offered is answered first by another), and every one
 *   answered "I cannot help thee with that";
 * - the Say list's labels said twice, or not the townsman's own words;
 * - the questions offered only Yes and No that are not asked as yes or no;
 * - a reply that stays white when there is nothing more of it to hear (menu.ts, talk.ts moreToHear).
 *
 * Run, with a copy of the game in ../gamedata/ultima5 (gamedata/README.md):
 *
 *   node --import ./tools/node-ts.mjs tools/talk/audit.ts [out.json]
 */

import { writeFileSync } from 'node:fs';
import type { Game } from '../../src/game/game.ts';
import { K, Pad } from '../../src/game/io.ts';
import { journeyOnward } from '../../src/game/run.ts';
import { talkToNpc } from '../../src/game/talk.ts';
import { Vocabulary } from '../../src/game/words.ts';
import { newGame } from '../../tests/helpers.ts';
import { analyse } from './analysis.ts';
import { townsfolk, type Townsman } from './reach.ts';

const NPC = ['TOWNE.NPC', 'DWELLING.NPC', 'CASTLE.NPC', 'KEEP.NPC'];
const ROUNDS = 12;
/** Conversations with each townsman a round: enough for each question's answers in turn. */
const VISITS = 6;

/** A townsman where they stand: the place (map), their slot, their script. */
interface Seat {
  map: number;
  npc: number;
  talk: number;
  t: Townsman;
}

/** What a Say line led to: the line's keyword, and the one the game answered (talk.ts findKeyword). */
interface Asked {
  chosen: number;
  answered: number;
}

/** Everything heard of one townsman, over every visit. */
interface Record {
  /** The keywords the game answered. */
  answered: Set<number>;
  /** A Say line whose reply was another's: "line -> answered". */
  crossed: Set<string>;
  /** Say lines answered "I cannot help thee with that". */
  cannot: Set<string>;
  /** The Say list as last offered, each line and whether grey. */
  say: { label: string; dim: boolean }[];
  /** Every Answer list offered: what was asked (the last of what was said), and its lines. */
  answers: Map<string, { asked: string; labels: string[] }>;
  /** Each answer given: the list's key and the line. */
  given: Set<string>;
  met: boolean;
  /** The words the conversation said (the log), the last visit's. */
  log: string;
}

function seats(g: Game, folk: Townsman[]): Seat[] {
  const out: Seat[] = [];
  for (let map = 1; map <= 32; map++) {
    const f = (map - 1) >> 3;
    const npcs = g.data.files.get(NPC[f]);
    const m = (map - 1) & 7;
    for (let npc = 0; npc < 32; npc++) {
      const talk = npcs[m * 0x240 + 0x220 + npc];
      if (talk === 0 || talk >= 0x80) continue;
      const t = folk.find((x) => x.key === `${f}:${talk}`);
      if (t) out.push({ map, npc, talk, t });
    }
  }
  return out;
}

/**
 * One conversation with `seat`, the vocabulary `known` brought to it and what it taught kept in it: `anon`, the
 * Avatar's name kept back whenever asked (so a townsman's questions for a stranger are asked); `leave`, Take leave
 * at once (for what is said at a farewell, before a Join ends the talk another way).
 */
async function visit(
  seat: Seat,
  known: Vocabulary,
  rec: Record,
  asks: Map<string, number>,
  tries: Map<string, number>,
  n: number,
  anon: boolean,
  leave: boolean,
): Promise<void> {
  const { g, p } = newGame(seat.map * 100 + seat.npc + n * 7919);
  journeyOnward(g);
  g.words.merge(known);
  Object.assign(g.options, { input: 'controller', dialog: 'log', rules: 'classic' });
  Object.assign(g.s, { mapId: seat.map, gold: 9999, townAir: 0xff, karma: 99 });
  g.s.npcs[seat.npc].fa = seat.talk;
  if (rec.met && !anon) g.s.npcMet[(seat.map - 1) * 4 + (seat.npc >> 3)] |= 1 << (seat.npc & 7);
  // The keyword the game answers, as it marks it heard (talk.ts interest: the keyword first, then the line chosen).
  const mark = g.words.markHeard.bind(g.words);
  const pairs: Asked[] = [];
  g.words.markHeard = (mapId, npc, k) => {
    const t = g.talk;
    if (typeof k === 'number' && k === t.keyword && mapId === seat.map && npc === seat.npc) {
      rec.answered.add(k);
      if (typeof t.chosen === 'number') pairs.push({ chosen: t.chosen, answered: k });
    }
    mark(mapId, npc, k);
  };
  const asked = new Set<string>();
  let presses = 0;
  g.said = '';
  p.next = () => {
    if (++presses > 4000) throw new Error('never ends');
    const m = g.menuShown;
    if (!m) return Pad.A;
    let target: number;
    if (m.title === 'Say') {
      rec.say = m.labels.map((label, i) => ({ label, dim: m.dim[i] }));
      // The line asked least so far, of those not yet asked this time; then leave.
      const open = leave ? [] : m.labels.map((l, i) => ({ l, i })).filter(({ l }) => l !== 'Take leave' && !asked.has(l));
      open.sort((a, b) => (asks.get(a.l) ?? 0) - (asks.get(b.l) ?? 0) || a.i - b.i);
      if (open.length) {
        target = open[0].i;
        if (m.at === target) {
          asked.add(open[0].l);
          asks.set(open[0].l, (asks.get(open[0].l) ?? 0) + 1);
        }
      } else target = m.labels.indexOf('Take leave');
    } else {
      const q = g.said.replace(/\s+/g, ' ').trim();
      const key = `${m.title}|${m.labels.join('|')}|${q.slice(-50)}`;
      rec.answers.set(key, { asked: q.slice(-120), labels: m.labels });
      const nothing = m.labels.indexOf('Say nothing');
      if (nothing >= 0)
        target = anon ? nothing : 0; // the Avatar's name given, or kept back
      else {
        // Each question's answers in turn, visit by visit (a riddle's Take leave last).
        const tried = tries.get(key) ?? 0;
        const choices = m.labels.map((_, i) => i).filter((i) => m.labels[i] !== 'Take leave');
        target = choices.length ? choices[tried % choices.length] : 0;
        if (m.at === target) {
          tries.set(key, tried + 1);
          rec.given.add(`${key}|${m.labels[target]}`);
        }
      }
    }
    return m.at === target ? Pad.A : m.at < target ? K.Down : K.Up;
  };
  try {
    await talkToNpc(g, seat.npc);
  } catch {
    /* a conversation the game ends its own way (the guards called) is a conversation all the same */
  }
  for (const { chosen, answered } of pairs)
    if (seat.t.keywords[chosen]?.text !== seat.t.keywords[answered]?.text)
      rec.crossed.add(`${seat.t.keywords[chosen]?.stub} -> ${seat.t.keywords[answered]?.stub}`);
  for (const mt of g.said.matchAll(/:([^\n]+)\n+"?I cannot help thee with that/g)) rec.cannot.add(mt[1].trim());
  rec.log = g.said;
  if (!anon && g.s.npcMet[(seat.map - 1) * 4 + (seat.npc >> 3)] & (1 << (seat.npc & 7))) rec.met = true;
  known.merge(g.words);
}

const yesNo = (stub: string): boolean => /^(y|ye|yes|n|no)$/i.test(stub);

export async function audit(): Promise<unknown> {
  const { g } = newGame();
  journeyOnward(g);
  const folk = townsfolk(g);
  const all = seats(g, folk);
  const known = new Vocabulary();
  known.merge(g.words);
  // What is written to be read: signs, books, Look, the shops (analysis.ts).
  for (const [w, from] of analyse(g).learnable) if ([...from].some((s) => s.startsWith('written:'))) known.learn(g, w);
  const recs = new Map<Seat, Record>();
  const asks = new Map<Seat, Map<string, number>>();
  const tries = new Map<Seat, Map<string, number>>();
  for (const s of all) {
    recs.set(s, {
      answered: new Set(),
      crossed: new Set(),
      cannot: new Set(),
      say: [],
      answers: new Map(),
      given: new Set(),
      met: false,
      log: '',
    });
    asks.set(s, new Map());
    tries.set(s, new Map());
  }
  let rounds = 0;
  for (let n = 0; n < ROUNDS; n++) {
    rounds++;
    const state = (): string =>
      `${known.size}:${[...recs.values()].reduce((a, r) => a + r.answered.size + r.given.size + r.answers.size, 0)}`;
    const before = state();
    // A visit taking leave at once, then by turns one keeping the Avatar's name back and one giving it.
    for (const s of all)
      for (let v = 0; v < VISITS; v++)
        await visit(s, known, recs.get(s)!, asks.get(s)!, tries.get(s)!, n * VISITS + v, v % 2 === 1, v === 0);
    const after = state();
    if (after === before) break;
  }

  const STANDARD = g.data.table(0x4aa8, 0x22);
  const people = all.map((s) => {
    const r = recs.get(s)!;
    const t = s.t;
    const heard = (k: string): boolean => known.wasHeard(s.map, s.npc, k);
    // Replies: the keywords that say the same thing, one reply.
    const replies = new Map<string, { stubs: string[]; reached: boolean; short: boolean }>();
    t.keywords.forEach((k, i) => {
      const standard = STANDARD.some((w) => w && k.stub.startsWith(w.slice(0, 4).toUpperCase()) && k.stub.length >= 3);
      const reply = replies.get(k.text) ?? { stubs: [], reached: false, short: true };
      reply.stubs.push(k.stub);
      reply.reached ||= r.answered.has(i);
      reply.short &&= k.stub.length < 3 || standard;
      replies.set(k.text, reply);
    });
    const questions = [...t.blocks.values()].filter((b) => b.text !== '@');
    return {
      who: `${t.name} (${t.where})`,
      key: t.key,
      map: s.map,
      npc: s.npc,
      replies: [...replies].map(([text, x]) => ({ text, ...x })),
      unheard: [...replies].filter(([, x]) => !x.reached && !x.short).map(([text, x]) => ({ stubs: x.stubs, text })),
      questions: questions.length,
      unasked: questions.filter((b) => !heard(`q${b.label}`)).map((b) => ({ label: b.label.toString(16), text: b.text })),
      ungiven: questions
        .filter((b) => heard(`q${b.label}`))
        .flatMap((b) =>
          b.replies
            .filter((x) => !yesNo(x.stub) && x.stub.length >= 2 && !heard(`a${b.label}:${x.stub.toLowerCase()}`))
            .map((x) => ({ label: b.label.toString(16), question: b.text, stub: x.stub, reply: x.text })),
        ),
      crossed: [...r.crossed],
      cannot: [...r.cannot],
      say: r.say,
      doubled: r.say.map((l) => l.label).filter((l, i, a) => a.indexOf(l) !== i),
      white: r.say.filter((l) => !l.dim && !['Name', 'Job', 'Take leave'].includes(l.label)).map((l) => l.label),
      answers: [...r.answers.values()],
      untried: [...r.answers]
        .filter(([, x]) => !x.labels.includes('Say nothing'))
        .flatMap(([key, x]) =>
          x.labels
            .filter((label) => label !== 'Take leave' && !r.given.has(`${key}|${label}`))
            .map((label) => `${label} <- ${x.asked.slice(-60)}`),
        ),
      own: [...t.own],
    };
  });
  return { rounds, vocabulary: known.size, people };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = await audit();
  const path = process.argv[2] ?? 'audit.json';
  writeFileSync(path, JSON.stringify(out, null, 1));
  console.log(`written ${path}`);
}
