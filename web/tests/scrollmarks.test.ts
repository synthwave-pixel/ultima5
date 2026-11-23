import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { ask, choose, type Item } from '../src/game/menu.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/**
 * The arrows of a list too long to show whole (menu.ts choose): an arrow up at the right of the row above its lines
 * where there are more above, an arrow down at the right of the row below them where there are more below - on rows
 * of their own, so no line is cut for them. A list that shows whole has none.
 */
describe('the arrows of a list that scrolls', () => {
  const game = () => {
    const { g, p } = newGame();
    journeyOnward(g);
    g.options.input = 'controller';
    return { g, p };
  };
  const many = (n: number, note?: string): Item[] =>
    Array.from({ length: n }, (_, i) => (note ? { label: `Line ${i}`, note } : { label: `Line ${i}` }));

  /** The list's window as each key is asked for: its row above the lines and below them, at the right; its rows. */
  const watch = (g: ReturnType<typeof game>['g'], p: ReturnType<typeof game>['p'], keys: number[]) => {
    const seen: { at: number; above: string; below: string; rows: string[] }[] = [];
    p.next = () => {
      const w = g.text.windows[g.text.current];
      const edge = (y: number): string => g.text.screenText(y, w.right, w.right);
      const rows = Array.from({ length: w.bottom - w.top + 1 }, (_, y) => g.text.screenText(w.top + y, w.left, w.right));
      const shown = g.menuShown!;
      // The row above the first line shown and the row below the last, found by the lines' own text.
      const first = rows.findIndex((r) => r.trim() !== '' && shown.labels.some((l) => r.trim() === l || r.trim().startsWith(l)));
      const last = rows.length - 1 - [...rows].reverse().findIndex((r) => shown.labels.some((l) => r.trim().startsWith(l)));
      seen.push({ at: shown.at, above: edge(w.top + first - 1), below: edge(w.top + last + 1), rows });
      return keys.shift() ?? Pad.B;
    };
    return seen;
  };

  it('marks a long list: down at the top, both in the middle, up at the foot', async () => {
    const { g, p } = game();
    const seen = watch(g, p, [K.Right, K.Right, K.Right, K.Right, K.Right]);
    await choose(g, 'Long', many(48));
    expect([seen[0].above, seen[0].below]).toEqual([' ', '\x19']);
    expect(seen.some((s) => s.above === '\x18' && s.below === '\x19')).toBe(true);
    const end = seen.find((s) => s.at === 47)!;
    expect([end.above, end.below]).toEqual(['\x18', ' ']);
  });

  it('marks a long list with notes, the arrow down above the notes', async () => {
    const { g, p } = game();
    const seen = watch(g, p, []);
    await choose(g, 'Noted', many(30, 'What this line does.'));
    expect([seen[0].above, seen[0].below]).toEqual([' ', '\x19']);
  });

  it('marks nothing on a list that shows whole', async () => {
    const { g, p } = game();
    const seen = watch(g, p, []);
    await choose(g, 'Short', many(5));
    expect(seen[0].rows.some((r) => r.includes('\x18') || r.includes('\x19'))).toBe(false);
  });

  it('cuts no line for the arrows: a line as wide as the list is shown whole', async () => {
    const { g, p } = game();
    const wide = 'W'.repeat(21);
    const seen = watch(g, p, []);
    await choose(g, 'Wide', [{ label: wide }, ...many(40)]);
    expect(seen[0].rows.some((r) => r === wide)).toBe(true);
  });

  it('marks a long list in a box the same way', async () => {
    const { g, p } = game();
    const seen = watch(g, p, [K.Up]); // up from the first: round to the last
    await ask(
      g,
      'Which',
      many(30).map((it) => it.label),
    );
    expect([seen[0].above, seen[0].below]).toEqual([' ', '\x19']);
    expect([seen[1].above, seen[1].below]).toEqual(['\x18', ' ']);
  });
});
