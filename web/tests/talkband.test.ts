import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { analyse } from '../tools/talk/analysis.ts';
import { stashWorldActors } from '../src/game/outdoors.ts';
import { journeyOnward } from '../src/game/run.ts';
import { talkMenuRows } from '../src/game/speech.ts';
import { covered } from '../src/game/world.ts';
import { setWind } from '../src/game/frame.ts';
import { talkToNpc } from '../src/game/talk.ts';
import { enterTown, loadLevel } from '../src/game/town.ts';
import { newGame } from './helpers.ts';

/**
 * The talk's menus at the foot of the view (menu.ts choose, speech.ts talkMenuRows, the port's): framed as the
 * townsman's words are at its top, as wide as their lines and centred, with no title - a row clear of the party, and of
 * the townsman where they stand to the south, so the party and they stay in sight.
 */
describe("the talk's menus, at the view's foot", () => {
  const britain = async () => {
    const made = newGame();
    const { g } = made;
    g.options.input = 'controller';
    journeyOnward(g);
    stashWorldActors(g);
    Object.assign(g.s, { mapId: 2, level: 0, x: 15, y: 30, hour: 12 });
    await enterTown(g, true);
    const s = g.s;
    const i = [...Array(32).keys()].find((k) => k > 0 && s.npcTypes[k] !== 0 && s.npcs[k].fa > 0 && s.npcs[k].fa < 0x80)!;
    return { ...made, i };
  };

  it('stops a row short of the party, or of the townsman to the south', () => {
    expect(talkMenuRows(0, -1)).toEqual({ first: 14, last: 21 }); // north of the party
    expect(talkMenuRows(1, 0)).toEqual({ first: 14, last: 21 }); // beside it
    expect(talkMenuRows(0, 1)).toEqual({ first: 16, last: 21 }); // south: short of them
    expect(talkMenuRows(0, 2)).toEqual({ first: 18, last: 21 }); // across a counter
    expect(talkMenuRows(0, 7)).toEqual(talkMenuRows(0, 0)); // farther: as beside
  });

  it('draws the Say list framed at the foot, centred, its lines and no title, the view above it as it was', async () => {
    const { g, p, i } = await britain();
    const s = g.s;
    const n = s.npcs[i];
    Object.assign(s, { level: n.z, x: n.x, y: n.y + 1 }); // south of them: the menu below the party
    loadLevel(g, true);
    let window: { left: number; right: number; top: number; bottom: number } | null = null;
    let first = '';
    p.next = () => {
      const m = g.menuShown;
      if (m?.title === 'Say' && !window) {
        const w = g.text.windows[3];
        window = { left: w.left, right: w.right, top: w.top, bottom: w.bottom };
        first = g.text.screenText(w.top, w.left, w.right).trim();
        return Pad.B; // take leave
      }
      return Pad.A;
    };
    await talkToNpc(g, i).catch(() => undefined);
    const w = window!;
    expect(w.bottom).toBe(21); // the view's last row
    expect(w.top).toBeGreaterThanOrEqual(14); // a row clear of the party's
    expect(w.right - w.left + 1).toBeLessThan(21); // as wide as its lines, not the view
    expect(w.left + w.right + 1).toBe(24); // centred to the pixel: the view's middle is column 12's left edge
    expect(first).toBe('Name'); // its first line, not "Say"
  });
  it('marks a list too long for its box: an arrow up where lines are above it, down where they are below', async () => {
    const { g, p, i } = await britain();
    for (const w of analyse(g).learnable.keys()) g.words.add(w); // every word: a long list
    const s = g.s;
    const a = s.actors[s.npcs[i].actor];
    Object.assign(a, { x: 16, y: 16 }); // in the middle of the towne
    Object.assign(s, { level: a.z, x: 16, y: 14 }); // two squares north of them, as across a counter: four lines of room
    const marks: string[] = [];
    let centred = true;
    let presses = 0;
    p.next = () => {
      const m = g.menuShown;
      if (m?.title !== 'Say') return Pad.A;
      const w = g.text.windows[3];
      const edge = (y: number): string => g.text.screenText(y, w.right, w.right);
      marks.push(`${m.at}:${edge(w.top)}${edge(w.bottom)}:${w.bottom - w.top + 1}`);
      centred &&= w.left + w.right + 1 === 24; // the arrows' columns and all
      if (++presses <= m.labels.length) return K.Down;
      return Pad.B;
    };
    await talkToNpc(g, i).catch(() => undefined);
    expect(centred).toBe(true);
    const [first] = marks;
    expect(first).toBe(`0: \x19:4`); // at the top: more below, none above
    expect(marks.some((x) => x.includes('\x18\x19'))).toBe(true); // in the middle: both
    expect(marks.some((x) => x.endsWith(':\x18 :4'))).toBe(true); // at the foot: more above
  });

  it('offers to take leave first where everything this townsman answers has been heard', async () => {
    const { g, p, i } = await britain();
    const s = g.s;
    const n = s.npcs[i];
    Object.assign(s, { level: n.z, x: n.x, y: n.y + 1 });
    loadLevel(g, true);
    const firsts: string[] = [];
    const asked = new Set<string>();
    p.next = () => {
      const m = g.menuShown;
      if (m?.title !== 'Say') return Pad.A;
      firsts.push(m.labels[0]);
      // Each line not yet heard in turn; then leave.
      const next = m.labels.findIndex((l, k) => !m.dim[k] && l !== 'Take leave' && !asked.has(l));
      const target = next >= 0 ? next : m.labels.indexOf('Take leave');
      if (next >= 0 && m.at === next) asked.add(m.labels[next]);
      return m.at === target ? Pad.A : m.at < target ? K.Down : K.Up;
    };
    await talkToNpc(g, i).catch(() => undefined);
    expect(firsts[0]).toBe('Name'); // all to ask: Name leads
    expect(firsts[firsts.length - 1]).toBe('Take leave'); // all heard: taking leave leads, the bar on it
  });
  it('leaves the map going on round the menu: the squares under it not drawn while it is up, all once the talk is over', async () => {
    const { g, p, i } = await britain();
    const s = g.s;
    const n = s.npcs[i];
    Object.assign(s, { level: n.z, x: n.x, y: n.y + 1 });
    loadLevel(g, true);
    let seen: { cover: number[] | undefined; under: boolean; party: boolean } | null = null;
    p.next = () => {
      if (g.menuShown?.title === 'Say' && !seen) {
        // The bottom row of squares lies under the menu; the party's, at the middle, does not.
        seen = { cover: g.covers.get('menu'), under: covered(g, 5, 10), party: covered(g, 5, 5) };
        return Pad.B;
      }
      return Pad.A;
    };
    await talkToNpc(g, i).catch(() => undefined);
    expect(seen!.cover).toBeDefined();
    expect(seen!.under).toBe(true);
    expect(seen!.party).toBe(false);
    expect(g.covers.size).toBe(0);
  });

  it('keeps the Say list in the view when the wind changes as it waits, in the PC (1988) look (issue #7)', async () => {
    const { g, p, i } = await britain();
    g.options.tileSet = 'original'; // the PC (1988) look, whose wind is on the map's border
    const s = g.s;
    const n = s.npcs[i];
    Object.assign(s, { level: n.z, x: n.x, y: n.y + 1 });
    loadLevel(g, true);
    let log = '';
    let moved = false;
    p.next = () => {
      const m = g.menuShown;
      if (m?.title !== 'Say') return Pad.A;
      if (!moved) {
        setWind(g, 2); // the wind shifting, as the map goes on round the menu (frame.ts shiftWind)
        moved = true;
        return K.Down; // the bar redrawn
      }
      // The log's rows (the right-hand column, under the party panel), as the list was drawn again.
      log = [...Array(14).keys()].map((r) => g.text.screenText(r + 10, 24, 39)).join('|');
      return Pad.B;
    };
    await talkToNpc(g, i).catch(() => undefined);
    expect(moved).toBe(true);
    expect(log).not.toMatch(/Take leave|Name|Job/);
  });
});
