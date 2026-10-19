import { describe, expect, it } from 'vitest';
import type { Game } from '../src/game/game.ts';
import { K, Pad } from '../src/game/io.ts';
import { stashWorldActors } from '../src/game/outdoors.ts';
import { journeyOnward } from '../src/game/run.ts';
import { boxShown, placement, SPEECH, waitsForKey } from '../src/game/speech.ts';
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
 * The Dialog setting's Play (speech.ts): a townsman's words in the play area, in a box only as big as its lines,
 * centred over the townsman just beyond them from the party; a long one a box at a time, the story page's arrow at its
 * corner till a key. The party's words, the prompts and what is seen of them stay in the log.
 */
describe('what is said, in the play area', () => {
  it('goes at the top of the view, centred, a row clear of whoever is spoken to to the north, or of the party', () => {
    expect(placement(0, -1)).toEqual({ top: 2, centre: 12, rows: 6 }); // north of the party: short of them
    expect(placement(0, -2)).toEqual({ top: 2, centre: 12, rows: 4 }); // across a counter
    expect(placement(1, 0)).toEqual({ top: 2, centre: 12, rows: 8 }); // beside: short of the party's row
    expect(placement(-1, 1)).toEqual({ top: 2, centre: 12, rows: 8 }); // south
    expect(placement(0, 7)).toEqual(placement(0, 0)); // farther: as beside
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
    const boxes: NonNullable<ReturnType<typeof boxShown>>[] = [];
    const queue: number[] = [];
    p.next = () => {
      if (waitsForKey(g)) {
        pages++;
        boxes.push(boxShown(g)!);
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
    const shownPages: string[][] = [];
    const showStaged = g.text.showStaged.bind(g.text);
    g.text.showStaged = (f, count, column, row, width) => {
      shownPages.push(g.text.stagedLines().slice(f, f + count));
      showStaged(f, count, column, row, width);
    };
    const from = p.log.length;
    await talkToNpc(g, npc);
    const said = p.log.slice(from).replace(/\s+/g, '');
    // Every word of it, in order, across the boxes.
    const vision =
      'In the deep of night, many moons ago, a vision came unto my sister and I... We saw the Shard of Falsehood deep below a dungeon named Deceit. The path that was revealed traveled first southwest across many high peaks, opening to a large system of caverns. Then the way led southwest. At a major intersection it turned northwest, soon branching northeast. After a long journey northward, the passage turned west. Here the path went on to rocky hills to the southwest, then turned northwest. Over a lake it ran, unto a massive series of great falls, ending in a larger lake. Here, upon a small isle, lies the Shard of Falsehood!';
    let at = 0;
    for (const word of vision.split(' ')) {
      const next = said.indexOf(word.replace(/[^A-Za-z!.,]/g, ''), at);
      expect(next, `"${word}" after ${said.slice(Math.max(0, at - 40), at)}`).toBeGreaterThanOrEqual(0);
      at = next + 1;
    }
    expect(pages).toBeGreaterThan(2); // a page at a time, and the last read before the panel goes
    // Each box full - all six rows it has room for - or its speech ended: none broken off short of a line that fitted.
    for (const lines of shownPages) expect(lines.length === 6 || /"$/.test(lines[lines.length - 1]), lines.join(' / ')).toBe(true);
    // Each box at the top of the view, its last row clear of her square, centred.
    for (const b of boxes) {
      expect(b.top).toBe(2);
      expect(b.top + b.height - 1).toBeLessThanOrEqual(7);
      expect(b.width).toBeLessThanOrEqual(20);
      expect(b.left + (b.width >> 1)).toBe(12);
    }
    expect(new Set(boxes.map((b) => b.width)).size).toBeGreaterThan(1); // sized to each box's lines
    expect(boxShown(g)).toBeNull(); // put away at the end
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
    // What is heard (the journal's, the words') heard as ever.
    expect(g.words.knows('VISION')).toBe(true);
  });
  it("keeps a speech's last line with it where a row ends at the box's edge (Greyson's Codex, Britain)", async () => {
    const { g, p } = newGame();
    const s = g.s;
    Object.assign(g.options, { input: 'controller', dialog: 'play' });
    journeyOnward(g);
    stashWorldActors(g);
    Object.assign(s, { mapId: 2, level: 0, x: 15, y: 30, hour: 12 });
    await enterTown(g, true);
    g.words.add('SACRED');
    const npc = findNpc(g, 'Greyson');
    const a = s.actors[s.npcs[npc].actor];
    Object.assign(s, { level: a.z, x: a.x, y: a.y + 1 }); // south of him: six rows above him
    loadLevel(g, true);
    const shownPages: string[][] = [];
    const showStaged = g.text.showStaged.bind(g.text);
    g.text.showStaged = (f, count, column, row, width) => {
      shownPages.push(g.text.stagedLines().slice(f, f + count));
      showStaged(f, count, column, row, width);
    };
    const queue = [K.Down, K.Down, K.Down, Pad.A];
    p.next = () => (g.menuShown?.title === 'Say' ? (queue.shift() ?? Pad.B) : Pad.A);
    await talkToNpc(g, npc);
    // "...then canst thou enter / the Shrine of the" fills its row to the edge, the next word on the sixth: one box.
    const meditate = shownPages.find((l) => l[0].startsWith('"Meditate'));
    expect(meditate, shownPages.map((l) => l.join(' / ')).join(' | ')).toHaveLength(6);
    expect(meditate![5]).toBe('Codex!"');
  });
});
