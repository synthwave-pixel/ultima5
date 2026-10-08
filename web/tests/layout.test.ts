import { describe, expect, it } from 'vitest';
import { clearBorderTitle, drawVitals, setWind } from '../src/game/frame.ts';
import { withFullPanel } from '../src/game/layout.ts';
import { gameWindows, journeyOnward } from '../src/game/run.ts';
import { restore, serialize } from '../src/game/storage.ts';
import { A } from '../src/game/tiles.ts';
import { newGame } from './helpers.ts';

/** The Standard look's panel (frame.ts, layout.ts): one box for the party and its food, the date on the map's border. */
describe('the Standard panel', () => {
  const standard = () => {
    const made = newGame();
    const { g, p } = made;
    g.options.tileSet = 'standard';
    journeyOnward(g);
    const s = g.s;
    Object.assign(s, { month: 4, day: 5, year: 139 });
    const row = (r: number, from = 0, to = 40): string => p.rows[r].slice(from, to).join('');
    return { ...made, s, row };
  };

  it('puts food and gold straight under the party, and gives the log the rows that were the second box', () => {
    const { g, row } = standard();
    drawVitals(g);
    expect(row(7, 24, 39)).toMatch(/^F:\d+\s+G:\d+/);
    expect(g.text.windows[1].bottom).toBe(7);
    expect(g.text.windows[2].top).toBe(9); // 1988's began at 11
  });

  it('shows the date on the bottom border; at sea the wind as well, or a calm; in a dungeon the facing', () => {
    const { g, s, row } = standard();
    const bottom = (): string => row(23, 1, 23).trim();
    drawVitals(g);
    expect(bottom()).toContain('4-5-139');
    expect(bottom()).not.toContain('Wind');
    Object.assign(s, { mapId: 0, level: 0, partyTile: A.Frigate24 });
    setWind(g, 1); // north: it blows toward the south
    expect(bottom()).toContain(`Wind:${String.fromCharCode(0x19)} 4-5-139`);
    setWind(g, 0);
    expect(bottom()).toContain('Calm 4-5-139');
    Object.assign(s, { mapId: 0x21, facing: 0, partyTile: A.Avatar });
    drawVitals(g);
    expect(bottom()).toContain('North 4-5-139');
  });

  it('names the lasting spell on the band under the party, with its turns', () => {
    const { g, s, row } = standard();
    Object.assign(s, { icon: 0x50, protection: 12 });
    drawVitals(g);
    expect(row(8, 24, 40)).toContain('Protection 12');
    Object.assign(s, { icon: 0, protection: 0 });
    drawVitals(g);
    expect(row(8, 24, 40).trim()).not.toContain('Protection');
  });

  it("names the regalia worn on the party box's top border, apart from the spell", () => {
    const { g, s, row } = standard();
    g.regalia = 0x1c;
    Object.assign(s, { icon: 0x50, protection: 20 });
    clearBorderTitle(g);
    drawVitals(g);
    expect(row(0, 24, 40)).toContain('Crown');
    expect(row(8, 24, 40)).toContain('Protection 20');
  });

  it('lays the full 1988 height over the log as an overlay: the log unmoved, and nothing it printed meanwhile lost', async () => {
    const say = (g: ReturnType<typeof newGame>['g'], from: number, to: number): void => {
      g.text.select(2);
      for (let n = from; n < to; n++) g.print(`Line ${n}\n`);
    };
    const plain = standard();
    say(plain.g, 0, 30);
    const { g, row } = standard();
    const t = g.text;
    say(g, 0, 10);
    await withFullPanel(g, async () => {
      expect(t.windows[1].bottom).toBe(9); // the panel's nine rows
      expect(t.windows[2].top).toBe(9); // the log's window where it was
      expect(row(8, 24, 39)).toMatch(/^F:/); // the food under 1988's divider
      say(g, 10, 30); // printed while the panel lies over the log's top rows, scrolling it
      expect(row(9, 24, 40).trim()).toMatch(/\d+-\d+-\d+/); // the panel's date shows there, not the log
    });
    for (let r = 9; r <= 23; r++) expect(row(r, 24, 40), `row ${r}`).toBe(plain.row(r, 24, 40));
    expect(row(7, 24, 39)).toMatch(/^F:/);
  });

  it('keeps the 1988 panel in the EGA look, its one letter the regalia where no spell is in force', () => {
    const { g, s, row } = standard();
    g.options.tileSet = 'original';
    gameWindows(g);
    g.regalia = 0x1d;
    drawVitals(g);
    expect(row(8, 24, 39)).toMatch(/^F:/);
    expect(row(7, 31, 32)).toBe(String.fromCharCode(0x1d)); // the Badge's glyph
    Object.assign(s, { icon: 0x51, protection: 5 });
    drawVitals(g);
    expect(row(7, 31, 32)).toBe('Q'); // the spell first
  });
});

describe('the regalia in their own slot', () => {
  it('carries a save from before it over: the regalia out of the spell slot they shared', () => {
    const { g } = newGame();
    journeyOnward(g);
    Object.assign(g.s, { icon: 0x1d, protection: 0xff });
    const old = serialize(g);
    delete old.regalia;
    g.regalia = 0;
    restore(g, old);
    expect(g.regalia).toBe(0x1d);
    expect(g.s.icon).toBe(0);
    // And a save that has it keeps it.
    g.regalia = 0x1c;
    const now = serialize(g);
    g.regalia = 0;
    restore(g, now);
    expect(g.regalia).toBe(0x1c);
  });
});
