import { describe, expect, it } from 'vitest';
import type { Game } from '../src/game/game.ts';
import { K, Pad } from '../src/game/io.ts';
import { stashWorldActors } from '../src/game/outdoors.ts';
import { journeyOnward } from '../src/game/run.ts';
import { panelRows, panelShown, SPEECH, waitsForKey } from '../src/game/speech.ts';
import { talkToNpc } from '../src/game/talk.ts';
import { enterTown, loadLevel } from '../src/game/town.ts';
import { newGame } from './helpers.ts';

/** The townsman of this settlement whose script bears this name. */
function findNpc(g: Game, name: string): number {
  const s = g.s;
  const file = g.data.files.get(['TOWNE.TLK', 'DWELLING.TLK', 'CASTLE.TLK', 'KEEP.TLK'][(s.mapId - 1) >> 3]);
  const count = file[0] | (file[1] << 8);
  for (let i = 1; i < 32; i++) {
    const talk = s.npcs[i].fa;
    if (s.npcTypes[i] === 0 || talk === 0 || talk >= 0x80) continue;
    for (let n = 0, at = 2; n < count; n++, at += 4) {
      if ((file[at] | (file[at + 1] << 8)) !== talk) continue;
      let word = '';
      for (let p = file[at + 2] | (file[at + 3] << 8); file[p] >= 0xa0; p++) word += String.fromCharCode(file[p] & 0x7f);
      if (word.replace(/[^A-Za-z' ]+$/, '').toUpperCase() === name.toUpperCase()) return i;
    }
  }
  return -1;
}

/**
 * The Dialog setting's Play (speech.ts): a townsman's words in a panel in the play area, opposite the talk's menu and
 * short of the townsman, the party and they in sight between; a long one a page at a time, the story page's arrow at
 * its corner till a key. The party's words, the prompts and what is seen of them stay in the log.
 */
describe('what is said, in the play area', () => {
  it('lies opposite the menu, short of whoever is spoken to, a row clear of the squares in sight', () => {
    expect(panelRows(-1)).toEqual({ side: 'top', first: 1, last: 7 }); // north of the party, the menu below
    expect(panelRows(-2)).toEqual({ side: 'top', first: 1, last: 5 }); // across a counter
    expect(panelRows(0)).toEqual({ side: 'top', first: 1, last: 9 }); // east or west: the whole half
    expect(panelRows(1)).toEqual({ side: 'bottom', first: 16, last: 22 }); // south, the menu above
    expect(panelRows(2)).toEqual({ side: 'bottom', first: 18, last: 22 });
    expect(panelRows(7)).toEqual(panelRows(0)); // farther: as beside
  });

  it("shows Leona's vision, the game's longest speech, a page at a time - every word of it - and keeps the log for the party", async () => {
    const { g, p } = newGame();
    const s = g.s;
    g.options.input = 'controller';
    g.options.dialog = 'play';
    journeyOnward(g);
    stashWorldActors(g);
    const cove = g.data.locations.find((l) => l.name.toUpperCase() === 'COVE')!;
    Object.assign(s, { mapId: cove.id, level: 0, x: 15, y: 30, hour: 12 });
    await enterTown(g, true);
    const npc = findNpc(g, 'Leona');
    expect(npc).toBeGreaterThan(0);
    const n = s.npcs[npc];
    Object.assign(s, { level: n.z, x: n.x, y: n.y + 1 }); // south of her: the panel above, the menu below
    loadLevel(g, true);
    g.words.learn(g, 'A vision came unto me.');
    let pages = 0;
    let asked = false;
    let panel: ReturnType<typeof panelShown> = null;
    const queue: number[] = [];
    p.next = () => {
      if (waitsForKey(g)) {
        pages++;
        panel ??= panelShown(g);
        return Pad.A;
      }
      if (queue.length) return queue.shift();
      const m = g.menuShown;
      if (!m) return Pad.A;
      if (m.title !== 'Say') return Pad.A;
      const want = asked ? m.labels.indexOf('Take leave') : m.labels.indexOf('Vision');
      expect(want, m.labels.join('|')).toBeGreaterThanOrEqual(0);
      asked = true;
      for (let i = m.at; i !== want; i += want > i ? 1 : -1) queue.push(want > i ? K.Down : K.Up);
      queue.push(Pad.A);
      return queue.shift();
    };
    const from = p.log.length;
    await talkToNpc(g, npc);
    const said = p.log.slice(from).replace(/\s+/g, '');
    // Every word of it, in order, across the pages (the panel's title written again atop each, between).
    const vision =
      'In the deep of night, many moons ago, a vision came unto my sister and I... We saw the Shard of Falsehood deep below a dungeon named Deceit. The path that was revealed traveled first southwest across many high peaks, opening to a large system of caverns. Then the way led southwest. At a major intersection it turned northwest, soon branching northeast. After a long journey northward, the passage turned west. Here the path went on to rocky hills to the southwest, then turned northwest. Over a lake it ran, unto a massive series of great falls, ending in a larger lake. Here, upon a small isle, lies the Shard of Falsehood!';
    let at = 0;
    for (const word of vision.split(' ')) {
      const next = said.indexOf(word.replace(/[^A-Za-z!.,]/g, ''), at);
      expect(next, `"${word}" after ${said.slice(Math.max(0, at - 40), at)}`).toBeGreaterThanOrEqual(0);
      at = next + 1;
    }
    expect(pages).toBeGreaterThan(2); // a page at a time, and the last read before the panel goes
    expect(panel).toEqual({ side: 'top', first: 1, last: 7 });
    expect(panelShown(g)).toBeNull(); // put away at the end
    // The log kept for the party: no line of hers in its window.
    const log = g.text.windows[2];
    const cells = (g.text as unknown as { cells: { ch: string }[][] }).cells;
    const logText = cells
      .slice(log.top, log.bottom + 1)
      .map((r) =>
        r
          .slice(log.left, log.right + 1)
          .map((c) => c.ch)
          .join(''),
      )
      .join('');
    expect(logText).not.toContain('moons ago');
    expect(SPEECH).toBe(4);
    // Its title on the panel's top row, and no word of hers: what is heard (the journal's, the words') goes without it.
    const top = cells[1]
      .slice(1, 22)
      .map((c) => c.ch)
      .join('')
      .trim();
    expect(top.length).toBeGreaterThan(0);
    expect(g.words.knows('VISION')).toBe(true);
  });
});
