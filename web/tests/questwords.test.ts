import { describe, expect, it } from 'vitest';
import { readTownLevel } from '../src/data/maps.ts';
import { CHEATS, DEV_CHEATS } from '../src/game/cheats.ts';
import type { Game } from '../src/game/game.ts';
import { K, Pad } from '../src/game/io.ts';
import { scheduleSlot } from '../src/game/npc.ts';
import { stashWorldActors } from '../src/game/outdoors.ts';
import { journeyOnward, runGame } from '../src/game/run.ts';
import { enterTown, loadLevel } from '../src/game/town.ts';
import { newGame } from './helpers.ts';

class Stop extends Error {}

/** Everything anyone in Britannia says, as text: what a player who has talked to everyone has heard. */
function everything(g: Game): string {
  const dict = g.data.table(0x24ea, 0x80);
  let out = '';
  for (const name of ['TOWNE.TLK', 'DWELLING.TLK', 'CASTLE.TLK', 'KEEP.TLK']) {
    const file = g.data.files.get(name);
    for (let p = file[4] | (file[5] << 8); p < file.length; p++) {
      const b = file[p];
      if (b >= 0xa0) out += String.fromCharCode(b & 0x7f);
      else if (b >= 1 && b <= 0x80) out += ` ${dict[b - 1]} `;
      else out += ' ';
    }
  }
  return out;
}

/**
 * The words the quest turns on - the mantras, the words of power, the Shadowlords' names, the two passwords - each
 * asked of the townsman who holds it, with a controller, by a player who has heard everything else: the word must
 * come to be known, or there is a point in the game a controller cannot pass.
 */
describe('the words of the quest, by controller', () => {
  const probe = newGame().g;
  const mantras = probe.data.table(0x1f5e, 8);
  const powers = probe.data.table(0x4502, 8);
  const lords = probe.data.table(0x444a, 3);
  // The town, the townsman (by the talk he gives), and the word he holds.
  const cases: [number, number, string][] = [
    ...[2, 6, 16, 17, 27, 34, 39, 48].map((talk, i): [number, number, string] => [i + 1, talk, mantras[i]]),
    ...[2, 12, 15, 22, 26, 32].map((talk, i): [number, number, string] => [i + 1, talk, powers[i]]),
    [18, 17, powers[6]],
    [30, 12, lords[0]],
    [15, 11, lords[1]],
    [32, 22, lords[2]],
    [4, 17, 'DAWN'],
    [7, 38, probe.t(0x4a9a)],
  ];
  const all = everything(probe);

  it.each(cases)('in town %i, from the one who gives talk %i: %s', async (town, talk, word) => {
    const { g, p } = newGame(3);
    const known = (): boolean => g.words.knows(word) || (word === probe.t(0x4a9a) && !!g.words.forStub(word));
    let stage = 0;
    let spent = 0;
    let npc = -1;
    let rounds = 0;
    let steering = false;
    let want = 0;
    // Once a conversation has nothing fresh to ask, a word already asked is asked again - once - as a player would
    // to meet a question a second time: words that lead to the same question are offered once (menu.ts sayMenu).
    let reasked = false;
    const tries = new Map<string, number>();
    g.options.input = 'controller';
    p.next = () => {
      const s = g.s;
      const m = g.menuShown;
      if (known()) throw new Stop('learnt');
      if (++spent > 6000) throw new Stop('gave up');
      if (m) {
        const go = (i: number): number => (m.at === i ? Pad.A : m.at < i ? K.Down : K.Up);
        if (m.title === 'Commands') return go(m.labels.indexOf('Talk'));
        if (m.title === 'Say') {
          const fresh = m.labels.findIndex((l, i) => !m.dim[i] && l !== 'Take leave');
          if (fresh >= 0) return go(fresh);
          const again = m.labels.map((_, i) => i).filter((i) => !/^(Name|Job|Take leave)$/.test(m.labels[i]));
          if (!reasked && again.length) {
            const pick = again[rounds % again.length];
            if (m.at === pick) reasked = true;
            return go(pick);
          }
          return go(m.labels.length - 1);
        }
        if (m.title === 'Answer') {
          // A question met again is answered another way: the answers it names first, then yes, then no.
          if (!steering) {
            const q = m.labels.join('|') + g.said.slice(-60);
            const n = tries.get(q) ?? 0;
            tries.set(q, n + 1);
            const special = m.labels.map((_, i) => i).filter((i) => !/^(Yes|No|Take leave)$/.test(m.labels[i]));
            const order = [...special, m.labels.indexOf('Yes'), m.labels.indexOf('No')].filter((i) => i >= 0);
            want = order[n % order.length];
            steering = true;
          }
          if (m.at === want) steering = false;
          return go(want);
        }
        return Pad.B;
      }
      if (g.commandPrompt === 'town') {
        if (rounds++ > 12) throw new Stop('left without it');
        const a = s.actors[s.npcs[npc].actor];
        if (!a || a.tile === 0) throw new Stop('not about');
        Object.assign(s, { x: a.x, y: a.y + 1 }); // set before them: finding them is not what is tried here
        stage = 1;
        reasked = false;
        return Pad.A;
      }
      if (g.commandPrompt === 'combat') throw new Stop('a fight broke out');
      if (stage === 1) {
        stage = 2;
        return K.Up;
      }
      return Pad.A;
    };

    journeyOnward(g);
    for (const c of [...CHEATS, ...DEV_CHEATS]) if (!/Go to|Exit|Lord British|Add word/.test(c.label)) await c.apply(g);
    stashWorldActors(g);
    Object.assign(g.s, { mapId: town, level: 0, x: 15, y: 30, karma: 99 });
    await enterTown(g, true);
    npc = [...Array(32).keys()].find((i) => i > 0 && g.s.npcTypes[i] !== 0 && g.s.npcs[i].fa === talk) ?? -1;
    expect(npc).toBeGreaterThan(0);
    // An hour they are out of bed, and the level they are on then.
    const sch = g.s.schedules[npc];
    const loc = g.data.locations[town - 1];
    let hour = 12;
    for (const hh of [12, 10, 14, 16, 18, 8, 20, 22, 2, 4, 6, 0]) {
      const k = scheduleSlot(g, npc, hh);
      const tile = readTownLevel(g.data.files, loc, sch.z(k)).tiles[sch.y(k) * 32 + sch.x(k)];
      if (tile !== 0xab && tile !== 0xac) {
        hour = hh;
        break;
      }
    }
    g.s.hour = hour;
    g.s.level = sch.z(scheduleSlot(g, npc, hour));
    loadLevel(g, true);
    // (and not backwards either: one townsman says everything so, and what he says is learnt the right way round)
    const backwards = [...word].reverse().join('');
    g.words.learn(g, all.replace(new RegExp(`${word}|${backwards}`, 'gi'), ' '));
    expect(known()).toBe(false);

    let why = '';
    try {
      await runGame(g);
    } catch (e) {
      if (!(e instanceof Stop)) throw e;
      why = e.message;
    }
    expect(why).toBe('learnt');
  });
});
