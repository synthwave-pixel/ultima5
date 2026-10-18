import { describe, expect, it } from 'vitest';
import type { Game } from '../src/game/game.ts';
import { K, Pad } from '../src/game/io.ts';
import { stashWorldActors } from '../src/game/outdoors.ts';
import { journeyOnward } from '../src/game/run.ts';
import { talkToNpc } from '../src/game/talk.ts';
import { enterTown, loadLevel } from '../src/game/town.ts';
import { newGame } from './helpers.ts';

/** The townsman of this settlement whose script bears this name. */
function findNpc(g: Game, name: string): number {
  const s = g.s;
  const file = g.data.files.get('TOWNE.TLK');
  const count = file[0] | (file[1] << 8);
  for (let i = 1; i < 32; i++) {
    const talk = s.npcs[i].fa;
    if (s.npcTypes[i] === 0 || talk === 0 || talk >= 0x80) continue;
    for (let n = 0, at = 2; n < count; n++, at += 4) {
      if ((file[at] | (file[at + 1] << 8)) !== talk) continue;
      let word = '';
      for (let p = file[at + 2] | (file[at + 3] << 8); file[p] >= 0xa0; p++) word += String.fromCharCode(file[p] & 0x7f);
      if (word.toUpperCase() === name.toUpperCase()) return i;
    }
  }
  return -1;
}

/**
 * Jimmy of Trinsic listens for the Cape as "hms" and as "H.M.", and says it "H.M.S.": heard, it is learnt as the one
 * word it is written as, and offered as that ("H.M.S.") - never as "Hm", an interjection's letters, which he does not
 * answer.
 */
describe('Jimmy of Trinsic and the H.M.S. Cape', () => {
  it('learns "H.M.S." as one word, offers it as written, and has his answer for it', async () => {
    const { g, p } = newGame();
    const s = g.s;
    g.options.input = 'controller';
    journeyOnward(g);
    stashWorldActors(g);
    Object.assign(s, { mapId: 6, level: 0, x: 15, y: 30, hour: 12 }); // Trinsic
    await enterTown(g, true);
    const npc = findNpc(g, 'Jimmy');
    expect(npc).toBeGreaterThan(0);
    const n = s.npcs[npc];
    Object.assign(s, { level: n.z, x: n.x, y: n.y + 1 });
    loadLevel(g, true);
    g.words.learn(g, 'Hm, let me think.'); // an interjection, heard somewhere
    g.words.learn(g, "Ever 'eard of the H.M.S. Cape?");
    expect(g.words.forStub('hms')).toBe('H.M.S.');
    const says: string[][] = [];
    let asked = false;
    const queue: number[] = [];
    p.next = () => {
      if (queue.length) return queue.shift();
      const m = g.menuShown;
      if (!m) return Pad.A;
      if (m.title !== 'Say') return Pad.A;
      says.push([...m.labels]);
      const want = asked ? m.labels.indexOf('Take leave') : m.labels.indexOf('H.M.S.');
      asked = true;
      expect(want).toBeGreaterThanOrEqual(0);
      for (let i = m.at; i !== want; i += want > i ? 1 : -1) queue.push(want > i ? K.Down : K.Up);
      queue.push(Pad.A);
      return queue.shift();
    };
    await talkToNpc(g, npc);
    expect(says[0]).toContain('H.M.S.');
    expect(says[0]).not.toContain('Hm');
    const log = p.log.replace(/\s+/g, ' ');
    expect(log).toContain('HMS "Many extraordinary powers had she!"');
  });
});
