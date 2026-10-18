import { describe, expect, it } from 'vitest';
import type { Game } from '../src/game/game.ts';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { SPEECH, waitsForKey } from '../src/game/speech.ts';
import { talkToNpc } from '../src/game/talk.ts';
import { analyse } from '../tools/talk/analysis.ts';
import { newGame } from './helpers.ts';

type Rect = [number, number, number, number];

/**
 * Watch the Dialog setting's box through a conversation: everything the townsman says (written in SPEECH) shown in a
 * box, each box there while a key was read - none drawn and replaced unseen - and each wait for a key with a box up.
 */
function watch(g: Game): {
  spoken: () => string;
  shown: () => string;
  stray: () => string[];
  faults: string[];
  waits: () => number;
  read: () => void;
} {
  const t = g.text;
  let spoken = '';
  let shown = '';
  let logged = '';
  let quoted = '';
  let fresh = false;
  let box: Rect | null = null;
  let waits = 0;
  const faults: string[] = [];
  const printChar = t.printChar.bind(t);
  t.printChar = (ch: number) => {
    if (t.current === SPEECH && ch >= 0x20 && ch < 0x7f) spoken += String.fromCharCode(ch);
    // The log while the townsman's words are written off the screen: the prompts and the party's words, no more.
    if (t.current === 2 && t.stageWindow === SPEECH && (ch === 0x0a || (ch >= 0x20 && ch < 0x7f))) logged += String.fromCharCode(ch);
    // And at any time in the conversation (its words recorded), nothing quoted in the log: a townsman's words.
    if (t.current === 2 && g.recording !== null && (ch === 0x22 || ch === 0xa2)) quoted += spoken.slice(-30) + '|';
    printChar(ch);
  };
  const showStaged = t.showStaged.bind(t);
  t.showStaged = (from, count, column, row, width) => {
    shown += t
      .stagedLines()
      .slice(from, from + count)
      .join('');
    showStaged(from, count, column, row, width);
  };
  g.draw.chromeSpeech = (rect) => {
    if (fresh) faults.push(`a box replaced unread: ${spoken.slice(-60)}`);
    box = rect;
    fresh = rect !== null;
    if (rect && (rect[0] < 8 || rect[1] < 8 || rect[2] > 0xb7 || rect[3] > 0xb7)) faults.push(`a box off the view: ${rect.join(',')}`);
    // Never over the party's own square (the view's middle).
    if (rect && rect[0] <= 103 && rect[2] >= 88 && rect[1] <= 103 && rect[3] >= 88) faults.push(`a box over the party: ${rect.join(',')}`);
  };
  return {
    spoken: () => spoken.replace(/\s+/g, ''),
    shown: () => shown.replace(/\s+/g, ''),
    stray: () =>
      logged
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => !/^(|Your interest\?|You respond-|You|respond-|:.*|BYE)$/.test(l))
        .concat(quoted ? [`a quote in the log after: ${quoted.slice(0, 80)}`] : []),
    faults,
    waits: () => waits,
    read: () => {
      if (waitsForKey(g)) {
        waits++;
        if (!box) faults.push('a wait with no box');
      }
      fresh = false;
    },
  };
}

/**
 * The Dialog setting's Play, every conversation of the game through: no crash, every word the townsman says shown,
 * no box gone before it could be read, A, B or Escape at its arrow alike.
 */
describe('every conversation, in the play area', () => {
  const words = [...analyse(newGame().g).learnable.keys()];
  const NPC = ['TOWNE.NPC', 'DWELLING.NPC', 'CASTLE.NPC', 'KEEP.NPC'];

  for (const [name, onward, met] of [
    ['A', Pad.A, false],
    ['B', Pad.B, false],
    ['Escape', K.Escape, false],
    ['A, every townsman knowing the party', Pad.A, true],
  ] as const)
    it(`shows all that is said, and loses none of it, read on with ${name}`, async () => {
      const base = newGame();
      const failed: string[] = [];
      let talked = 0;
      let waited = 0;
      for (let map = 1; map <= 32; map++) {
        const npcs = base.g.data.files.get(NPC[(map - 1) >> 3]);
        const m = (map - 1) & 7;
        for (let i = 0; i < 32; i++) {
          const talk = npcs[m * 0x240 + 0x220 + i];
          if (talk === 0 || talk >= 0x80) continue;
          const { g, p } = newGame(map * 100 + i);
          journeyOnward(g);
          for (const w of words) g.words.add(w);
          Object.assign(g.options, { input: 'controller', dialog: 'play' });
          Object.assign(g.s, { mapId: map, gold: 9999, townAir: 0xff });
          g.s.npcs[i].fa = talk;
          if (met) g.s.npcMet[(map - 1) * 4 + (i >> 3)] |= 1 << (i & 7);
          const w = watch(g);
          const tried = new Set<string>();
          const answers = new Map<string, number>();
          let presses = 0;
          p.next = () => {
            if (++presses > 4000) throw new Error('never ends');
            const at = waitsForKey(g);
            w.read();
            if (at) return onward;
            const menu = g.menuShown;
            if (!menu) return Pad.A;
            let target = 0;
            if (menu.title === 'Say') {
              target = menu.labels.findIndex((l) => !tried.has(l) && l !== 'Take leave');
              if (target < 0) target = menu.labels.indexOf('Take leave');
              else tried.add(menu.labels[target]);
            } else if (menu.title === 'Answer') {
              const key = menu.labels.join('|');
              const n = answers.get(key) ?? 0;
              answers.set(key, n + 1);
              target = Math.min(n, menu.labels.length - 1);
            }
            return menu.at === target ? Pad.A : menu.at < target ? K.Down : K.Up;
          };
          const who = `map ${map}, talk ${talk}`;
          try {
            await talkToNpc(g, i);
            talked++;
            waited += w.waits();
            for (const f of w.faults) failed.push(`${who}: ${f}`);
            if (w.shown() !== w.spoken())
              failed.push(
                `${who}: said ${w.spoken().length}, shown ${w.shown().length}: ${w.spoken().slice(w.shown().length - 20, w.shown().length + 40)}`,
              );
            const stray = w.stray();
            if (stray.length) failed.push(`${who}: in the log: ${stray.join(' / ').slice(0, 120)}`);
            if (g.text.stageWindow !== -1 || g.text.current === SPEECH) failed.push(`${who}: the speech window left chosen`);
          } catch (e) {
            failed.push(`${who}: ${(e as Error).message}`);
          }
        }
      }
      expect(failed).toEqual([]);
      expect(talked).toBeGreaterThan(130);
      expect(waited).toBeGreaterThan(100);
    }, 120000);
});
