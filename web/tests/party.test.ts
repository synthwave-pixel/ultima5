import { describe, expect, it } from 'vitest';
import { drawVitals, markTurn } from '../src/game/frame.ts';
import type { Figure, Place } from '../src/game/io.ts';
import { gameWindows, journeyOnward } from '../src/game/run.ts';
import { earnedLevel, Status } from '../src/game/save.ts';
import { A } from '../src/game/tiles.ts';
import { animateParty, drawView, partyFigures, setView } from '../src/game/world.ts';
import { Colour } from '../src/ui/colours.ts';
import { newGame } from './helpers.ts';

/**
 * The party as the ultima3 port's Standard look shows it: members in the colour of their state on the panel (and
 * a letter only for a state to tell), and on the map as themselves - four in a grid out in the world, all of them
 * in a line in a settlement - tinted as their names are, the dead left out.
 */
describe('the party, as the Standard look shows it', () => {
  const setup = () => {
    const { g, p } = newGame();
    journeyOnward(g);
    g.options.tileSet = 'standard';
    const s = g.s;
    s.partySize = 6;
    for (let m = 0; m < 6; m++) {
      const v = s.members[m];
      v.status = Status.Good;
      v.hp = v.maxHp = 100;
      v.exp = 0;
      v.level = 1;
    }
    return { g, p, s };
  };

  it('earns a level at 100 experience, and another each time it doubles', () => {
    expect([0, 99, 100, 199, 200, 400, 800, 3200].map(earnedLevel)).toEqual([1, 1, 2, 2, 3, 4, 5, 7]);
  });

  it('colours each name by state, a level due in blue, and keeps the letters off the line', () => {
    const { g, p, s } = setup();
    const colours: number[] = [];
    const out = (g.text as unknown as { out: { glyph: (...a: number[]) => void } }).out;
    const glyph = out.glyph.bind(out);
    out.glyph = (f, code, c, r, fg, ...rest) => {
      if (c === 24) colours[r - 1] = fg; // the first letter of each member's name
      glyph(f, code, c, r, fg, ...rest);
    };
    s.members[1].status = Status.Poisoned;
    s.members[2].status = Status.Sleeping;
    s.members[3].status = Status.Dead;
    s.members[4].exp = 400; // level 4 earned, still level 1
    drawVitals(g);
    expect(colours.slice(0, 6)).toEqual([15, Colour.brightGreen, Colour.lavender, Colour.lightGray, Colour.levelBlue, 15]);
    // The line is the name and the numbers: the state's letter is not in it (it goes on the frame, if at all).
    expect(p.rows.slice(1, 7).map((r) => r[38])).toEqual(['0', '0', '0', '0', '0', '0']);
  });

  /** Every mark set on the frame, by 'row:side', the last for each (Draw.mark). */
  const marks = (g: ReturnType<typeof setup>['g']): Map<string, number> => {
    const set = new Map<string, number>();
    g.draw.mark = (row, side, code) => void set.set(`${row}:${side}`, code);
    return set;
  };

  it("shows hit points as current over maximum at the line's end; an eight-letter name at 240/240 meets them without a space", () => {
    const { g, p, s } = setup();
    const line = (i: number): string => p.rows[i + 1].slice(24, 39).join('');
    s.members[0].name = 'Geoffrey';
    s.members[0].hp = s.members[0].maxHp = 240;
    s.members[1].name = 'Shamino';
    s.members[1].hp = 5;
    s.members[1].maxHp = 240;
    s.members[2].name = 'Iolo';
    s.members[2].hp = 99;
    s.members[2].maxHp = 180;
    drawVitals(g);
    expect(line(0)).toBe('Geoffrey240/240');
    expect(line(1)).toBe('Shamino   5/240');
    expect(line(2)).toBe('Iolo     99/180');
  });

  it("puts the active player's arrow on the frame to the left, and the state's letter on the right only when Settings asks", () => {
    const { g, s } = setup();
    const set = marks(g);
    s.members[1].status = Status.Poisoned;
    s.members[2].status = Status.Sleeping;
    s.activeMember = 0;
    drawVitals(g);
    expect(set.get('1:left')).toBe(0x1a); // row 1: the first member
    expect(set.get('2:left')).toBe(0);
    expect([...Array(6).keys()].map((i) => set.get(`${i + 1}:right`))).toEqual([0, 0, 0, 0, 0, 0]);
    g.options.statusLetters = true;
    drawVitals(g);
    expect([...Array(6).keys()].map((i) => set.get(`${i + 1}:right`))).toEqual([0, Status.Poisoned, Status.Sleeping, 0, 0, 0]);
    // A member asleep is no active player: the arrow goes.
    s.activeMember = 2;
    drawVitals(g);
    expect(set.get('3:left')).toBe(0);
    expect(s.activeMember).toBe(0xff);
  });

  it("shows experience over the next level's while Ztats is chosen, thousands as k, shortened beside a long name", () => {
    const { g, p, s } = setup();
    const line = (i: number): string => p.rows[i + 1].slice(24, 39).join('');
    const member = (i: number, name: string, level: number, exp: number): void => void Object.assign(s.members[i], { name, level, exp });
    member(0, 'Iolo', 3, 350);
    member(1, 'Jaana', 7, 3456);
    member(2, 'Shamino', 7, 3456);
    member(3, 'Geoffrey', 7, 3456);
    member(4, 'Dupre', 8, 9999);
    member(5, 'Gorn', 2, 250); // a level due: 200 reached
    g.panelXp = true;
    drawVitals(g);
    expect(line(0)).toBe('Iolo    350/400');
    expect(line(1)).toBe('Jaana 3.4k/6.4k');
    expect(line(2)).toBe('Shamino3.4/6.4k'); // the k dropped, then the space
    expect(line(3)).toBe('Geoffrey 3/6.4k'); // and the tenths
    expect(line(4)).toBe('Dupre  9.9k MAX');
    g.panelXp = false;
    drawVitals(g);
    expect(line(0)).toMatch(/^Iolo\s+100\/100$/);
  });

  it('gives a member charmed in a fight a colour of their own, and C on the frame when letters are shown', () => {
    const { g, s } = setup();
    const set = marks(g);
    const colours: number[] = [];
    const out = (g.text as unknown as { out: { glyph: (...a: number[]) => void } }).out;
    const glyph = out.glyph.bind(out);
    out.glyph = (f, code, c, r, fg, ...rest) => {
      if (c === 24) colours[r - 1] = fg;
      glyph(f, code, c, r, fg, ...rest);
    };
    s.mapId = 0xff;
    s.combatTurn = 0xff;
    g.combat[1].flags = 0x81;
    g.combat[1].who = 1;
    g.options.statusLetters = true;
    drawVitals(g);
    expect(colours[1]).toBe(Colour.charmed);
    expect(set.get('2:right')).toBe(0x43);
  });

  it("draws the line of the member whose turn it is in a fight as one bar: the state's colour, else the hit points', else plain", () => {
    const { g, s } = setup();
    const bars = new Map<number, Set<number>>();
    const out = (g.text as unknown as { out: { glyph: (...a: number[]) => void } }).out;
    const glyph = out.glyph.bind(out);
    out.glyph = (f, code, c, r, fg, bg, ...rest) => {
      if (c >= 24) bars.set(r - 1, (bars.get(r - 1) ?? new Set()).add(bg));
      glyph(f, code, c, r, fg, bg, ...rest);
    };
    s.mapId = 0xff;
    const turn = (who: number): void => {
      s.combatTurn = 0;
      g.combat[0].flags = 0x80;
      g.combat[0].who = who;
      bars.clear();
      drawVitals(g);
    };
    s.members[1].status = Status.Poisoned;
    s.members[1].hp = 5; // nearly gone as well: the state's colour still makes the bar
    turn(1);
    expect([...bars.get(1)!]).toEqual([Colour.brightGreen]);
    s.members[2].hp = 5;
    turn(2);
    expect([...bars.get(2)!]).toEqual([Colour.brightRed]);
    turn(0);
    expect([...bars.get(0)!]).toEqual([15]);
  });

  it("marks a fight's turn by drawing the line again in the Standard look, where the EGA look turns its colours over", () => {
    const { g, s } = setup();
    let inverted = 0;
    g.draw.invert = () => void inverted++;
    const bars = new Map<number, Set<number>>();
    const out = (g.text as unknown as { out: { glyph: (...a: number[]) => void } }).out;
    const glyph = out.glyph.bind(out);
    out.glyph = (f, code, c, r, fg, bg, ...rest) => {
      if (c >= 24) bars.set(r - 1, (bars.get(r - 1) ?? new Set()).add(bg));
      glyph(f, code, c, r, fg, bg, ...rest);
    };
    s.mapId = 0xff;
    s.combatTurn = 0;
    g.combat[0].flags = 0x80;
    g.combat[0].who = 1;
    s.members[1].status = Status.Poisoned;
    markTurn(g, 1, true);
    expect(inverted).toBe(0);
    expect([...bars.get(1)!]).toEqual([Colour.brightGreen]);
    bars.clear();
    markTurn(g, 1, false);
    expect([...bars.get(1)!]).toEqual([0]); // the line as it is out of its turn: no bar
    g.options.tileSet = 'original';
    markTurn(g, 1, true);
    expect(inverted).toBe(1);
  });

  it('keeps the letters, and no colours, in the EGA look', () => {
    const { g, p, s } = setup();
    g.options.tileSet = 'original';
    gameWindows(g); // the 1988 panel's windows, as a change of look lays them out (layout.ts relayout)
    s.members[1].status = Status.Poisoned;
    drawVitals(g);
    expect(p.rows.slice(1, 3).map((r) => r[38])).toEqual(['G', 'P']);
  });

  it('draws the living in order, the dead left out, poisoned green and asleep lavender', () => {
    const { g, s } = setup();
    s.members[1].status = Status.Dead;
    s.members[2].status = Status.Poisoned;
    s.members[3].status = Status.Sleeping;
    const f = partyFigures(g);
    expect(f.length).toBe(5);
    expect(f[0].tile & ~3).toBe(0x14c); // the walking Avatar, in a frame of its four
    expect(f.map((v) => v.tint)).toEqual([0, 0x40ff40, 0xb8a0ff, 0, 0]);
  });

  it("walks: each member steps through their figure's four frames as the map ticks, not all in step", () => {
    const { g } = setup();
    const seen = new Set<string>();
    const frames = new Set<number>();
    for (let i = 0; i < 40; i++) {
      animateParty();
      const f = partyFigures(g).map((v) => v.tile);
      seen.add(f.map((t) => t & 3).join());
      for (const t of f) frames.add(t & 3);
    }
    expect([...frames].sort()).toEqual([0, 1, 2, 3]);
    expect(seen.size).toBeGreaterThan(4); // the members at different frames from one another
  });

  it('draws the party on foot out in the world as its leader alone, the first member living', () => {
    const { g, s } = setup();
    s.mapId = 0;
    s.partyTile = A.Avatar;
    s.members[0].status = Status.Dead;
    let grid: Figure[] | null = null;
    let leader = -1;
    g.draw.party = (_t: number, x: number, y: number, figures: Figure[]) => {
      if (x === 5 && y === 5) grid = figures;
    };
    const tile = g.draw.tile.bind(g.draw);
    g.draw.tile = (t, x, y, ...rest) => {
      if (x === 5 && y === 5) leader = t;
      tile(t, x, y, ...rest);
    };
    for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) setView(g, x, y, 0x05);
    setView(g, 5, 5, 0);
    g.actorMap[5 * 16 + 5] = A.Avatar;
    g.groundMap[5 * 16 + 5] = 0x05;
    drawView(g);
    expect(grid).toBeNull();
    expect(leader).toBe(partyFigures(g)[0].tile);
  });

  it('draws the party out in the world as 1988’s party icon with the Apple ][ and PC EGA tiles', () => {
    for (const tiles of ['apple2', 'pc-ega'] as const) {
      const { g, s } = setup();
      g.options.tiles = tiles;
      s.mapId = 0;
      s.partyTile = A.Avatar;
      let drawn = -1;
      const tile = g.draw.tile.bind(g.draw);
      g.draw.tile = (t, x, y, ...rest) => {
        if (x === 5 && y === 5) drawn = t;
        tile(t, x, y, ...rest);
      };
      for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) setView(g, x, y, 0x05);
      setView(g, 5, 5, 0);
      g.actorMap[5 * 16 + 5] = A.Avatar;
      g.groundMap[5 * 16 + 5] = 0x05;
      drawView(g);
      expect(drawn, tiles).toBe(0x100 + A.Avatar);
    }
  });

  it('draws the others in a line behind the leader in a settlement, on the squares it came through', () => {
    const { g, s } = setup();
    s.mapId = 5;
    s.level = 0;
    s.partyTile = A.Avatar;
    [s.x, s.y] = [10, 10];
    s.partySize = 3;
    s.members[1].status = Status.Poisoned;
    g.trail = [
      { x: 10, y: 11, z: 0 },
      { x: 10, y: 12, z: 0 },
      { x: 10, y: 13, z: 0 },
    ];
    for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) setView(g, x, y, 0x44);
    setView(g, 5, 5, 0);
    g.actorMap[5 * 16 + 5] = A.Avatar;
    g.groundMap[5 * 16 + 5] = 0x44;
    const drawn = new Map<string, [number, number | undefined]>();
    g.draw.tile = (tile: number, x: number, y: number, _gr?: number, _pl?: Place, tint?: number) =>
      void drawn.set(`${x},${y}`, [tile, tint]);
    drawView(g);
    const figures = partyFigures(g);
    expect(drawn.get('5,5')).toEqual([figures[0].tile, 0]);
    expect(drawn.get('5,6')).toEqual([figures[1].tile, 0x40ff40]); // the poisoned one, green
    expect(drawn.get('5,7')).toEqual([figures[2].tile, 0]);
    expect(drawn.get('5,8')![0]).toBe(0x44); // three members: the trail's last square is empty
  });
});
