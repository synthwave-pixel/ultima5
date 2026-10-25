/**
 * Every townsman's conversation with the Dialog setting's Play (speech.ts, talk.ts), against the same with Log, every
 * word known that the game teaches and each Say line asked, met and not: with Play the log has the description, the
 * prompts, the party's words and the game's own notes, and none of the townsman's words - those are the box's, all of
 * them, as Log printed them, and the box shows all it is given.
 */
import { expect, it } from 'vitest';
import type { Game } from '../src/game/game.ts';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { talkToNpc } from '../src/game/talk.ts';
import { waitsForKey } from '../src/game/speech.ts';
import { newGame } from './helpers.ts';
import { analyse } from '../tools/talk/analysis.ts';
import { townsfolk, type Townsman } from '../tools/talk/reach.ts';

const NPC = ['TOWNE.NPC', 'DWELLING.NPC', 'CASTLE.NPC', 'KEEP.NPC'];
type Seat = { map: number; npc: number; talk: number; t: Townsman };
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

const talk = async (seat: Seat, dialog: 'play' | 'log', words: string[], met: boolean) => {
  const { g, p } = newGame(seat.map * 100 + seat.npc);
  journeyOnward(g);
  for (const w of words) g.words.learn(g, w);
  Object.assign(g.options, { input: 'controller', dialog, rules: 'classic' });
  Object.assign(g.s, { mapId: seat.map, gold: 9999, townAir: 0xff, karma: 99 });
  g.s.npcs[seat.npc].fa = seat.talk;
  if (met) g.s.npcMet[(seat.map - 1) * 4 + (seat.npc >> 3)] |= 1 << (seat.npc & 7);
  const roll = g.random.bind(g);
  g.random = (low: number, high: number) => (/shiftWind/.test(new Error().stack ?? '') ? high : roll(low, high));
  let log = '';
  let box = '';
  let shown = '';
  const gg = g as unknown as { remember: (t: string) => void };
  const remember = gg.remember.bind(g);
  gg.remember = (t: string) => {
    if (g.p.text.current === 2) log += t;
    if (g.p.text.current === 4) box += t;
    remember(t);
  };
  const tx = g.text;
  const show = tx.showStaged.bind(tx);
  tx.showStaged = (from, count, c, r, w) => {
    shown +=
      tx
        .stagedLines()
        .slice(from, from + count)
        .join(' ') + ' ';
    show(from, count, c, r, w);
  };
  const asked = new Set<string>();
  let presses = 0;
  let answers = 0;
  p.next = () => {
    if (++presses > 3000) throw new Error('never ends');
    if (waitsForKey(g)) return Pad.A;
    const m = g.menuShown;
    if (!m) return Pad.A;
    let target: number;
    if (m.title === 'Say') {
      const open = m.labels.map((l, i) => ({ l, i })).filter(({ l }) => l !== 'Take leave' && !asked.has(l));
      target = open.length ? open[0].i : m.labels.indexOf('Take leave');
      if (open.length && m.at === target) asked.add(open[0].l);
    } else {
      const choices = m.labels.map((_, i) => i).filter((i) => m.labels[i] !== 'Take leave');
      target = choices.length ? choices[answers % choices.length] : 0;
      if (m.at === target) answers++;
    }
    return m.at === target ? Pad.A : m.at < target ? K.Down : K.Up;
  };
  try {
    await talkToNpc(g, seat.npc);
  } catch (e) {
    log += `\n[ended: ${String(e).slice(0, 60)}]`;
  }
  return { log, box, shown };
};

const words = (t: string): string => t.replace(/[\s"\d]/g, '');

it("gives every townsman's words to the box, and the log the party's", async () => {
  const { g } = newGame();
  journeyOnward(g);
  const folk = townsfolk(g);
  const all = seats(g, folk);
  const learnable = [...analyse(g).learnable.keys()];
  const out: string[] = [];
  let n = 0;
  for (const seat of all)
    for (const met of [false, true]) {
      n++;
      const play = await talk(seat, 'play', learnable, met);
      const log = await talk(seat, 'log', learnable, met);
      const issues: string[] = [];
      // The log with Play: the description, the prompts and the party's echoes, and the game's own notes, and nothing else.
      const stray = play.log
        .replace(/You see [\s\S]*?(\n\s*\n|(?=Your interest\?|You respond-))/, '')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !/^(Your interest\?|You respond-|:.*|Journal updated|BYE)$/.test(l));
      if (stray.length) issues.push(`in the Play log: ${JSON.stringify(stray)}`);
      // Nothing lost nor added: the box's and the log's words with Play those of Log, prompts and echoes apart.
      const bag = (t: string): string =>
        t
          .split('\n')
          .filter((l) => !/^\s*(Your interest\?|You respond-|:.*|BYE)\s*$/.test(l))
          .join(' ')
          .replace(/[\s"\d]/g, '')
          .split('')
          .sort()
          .join('');
      if (bag(play.box + play.log) !== bag(log.log)) issues.push('words differ from Log');
      if (words(play.shown) !== words(play.box)) issues.push('shown differs from box');
      if (issues.length) out.push(`${seat.t.name} (map ${seat.map} npc ${seat.npc}${met ? ', met' : ''}): ${issues.join('; ')}`);
      // (Geoffrey's description, ending on a stray quotation mark of 1988's, is the log's to its end.)
      if (seat.t.name === 'Geoffrey') expect(play.log).toMatch(/fighter\.\s*\n\s*\nYou respond-/);
    }
  expect(n).toBeGreaterThan(250);
  expect(out).toEqual([]);
}, 900000);
