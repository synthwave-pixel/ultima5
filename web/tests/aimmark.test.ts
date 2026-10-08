import { describe, expect, it } from 'vitest';
import { drawCombatMarks } from '../src/game/combat.ts';
import { turnColour } from '../src/game/frame.ts';
import { CF } from '../src/game/game.ts';
import { type Member, Status } from '../src/game/save.ts';
import { Colour } from '../src/ui/colours.ts';
import { newGame } from './helpers.ts';

/** The aiming mark: the Standard look's four triangles where it has them; the EGA look keeps the 1988 crosshair. */
describe('the aiming mark', () => {
  const aiming = (look: 'standard' | 'original') => {
    const { g, p } = newGame();
    const s = g.s;
    s.mapId = 0xff;
    // A member's turn, the aim on a square three away.
    Object.assign(g.combat[0], { who: 0, x: 5, y: 7, flags: CF.Player });
    Object.assign(s, { combatTurn: 0, blink: 0, crosshair: 1, crossX: 5, crossY: 4 });
    g.options.tileSet = look;
    const aims: [number, number][] = [];
    let lines = 0;
    p.draw.aim = (x, y) => void aims.push([x, y]);
    p.draw.marker = () => {};
    p.draw.line = () => void lines++;
    drawCombatMarks(g);
    return { aims, lines };
  };

  it('draws the triangles at the square aimed at, and no crosshair, in the Standard look', () => {
    const { aims, lines } = aiming('standard');
    expect(aims).toEqual([[5, 4]]);
    expect(lines).toBe(0);
  });

  it('draws the crosshair in the original look', () => {
    const { aims, lines } = aiming('original');
    expect(aims).toEqual([]);
    expect(lines).toBeGreaterThan(0);
  });

  /** The marks drawn, each with its kind, in a fight with the Avatar's turn and Shamino beside. */
  const marks = (set: (g: ReturnType<typeof newGame>['g']) => void): [number, number, string][] => {
    const { g, p } = newGame();
    const s = g.s;
    s.mapId = 0xff;
    g.options.tileSet = 'standard';
    Object.assign(g.combat[0], { who: 0, x: 5, y: 7, flags: CF.Player });
    Object.assign(g.combat[1], { who: 1, x: 4, y: 8, flags: CF.Player });
    Object.assign(s, { combatTurn: 0, crosshair: 0 });
    const drawn: [number, number, string][] = [];
    p.draw.aim = (x, y, mark = 'attack') => void drawn.push([x, y, mark]);
    p.draw.marker = () => {};
    set(g);
    drawCombatMarks(g);
    return drawn;
  };

  it("marks a spell's aim apart from a weapon's", () => {
    expect(marks((g) => Object.assign(g.s, { crosshair: 1, crossX: 5, crossY: 2 }))).toEqual([[5, 2, 'attack']]);
    expect(
      marks((g) => {
        Object.assign(g.s, { crosshair: 1, crossX: 5, crossY: 2 });
        g.casting = true;
      }),
    ).toEqual([[5, 2, 'spell']]);
  });

  it('marks the member a spell is for, where they stand', () => {
    expect(marks((g) => (g.healPick = 1))).toEqual([[4, 8, 'heal']]);
  });

  it('marks whoever acts while a direction is asked, in a fight and in a town', () => {
    expect(marks((g) => (g.directing = true))).toEqual([[5, 7, 'direction']]);
    const { g, p } = newGame();
    g.s.mapId = 13;
    g.options.tileSet = 'standard';
    g.directing = true;
    const drawn: [number, number, string][] = [];
    p.draw.aim = (x, y, mark = 'attack') => void drawn.push([x, y, mark]);
    drawCombatMarks(g);
    expect(drawn).toEqual([[5, 5, 'direction']]); // the party, in the middle of the view
  });
});

/** The turn's outline on the combat map (the Standard look): the colour of the member's bar in the party panel. */
describe('the turn marker', () => {
  const colourFor = (set: (m: Member) => void, playerFlags = CF.Player): number | undefined => {
    const { g, p } = newGame();
    const s = g.s;
    s.mapId = 0xff;
    g.options.tileSet = 'standard';
    Object.assign(g.combat[0], { who: 0, x: 5, y: 7, flags: playerFlags });
    Object.assign(s, { combatTurn: 0, crosshair: 0 });
    const m = s.members[0];
    Object.assign(m, { hp: 100, maxHp: 100, status: Status.Good, exp: 0, level: 1 });
    set(m);
    let drawn: number | undefined;
    p.draw.marker = (_x, _y, colour) => void (drawn = colour);
    drawCombatMarks(g);
    expect(drawn).toBe(turnColour(g, 0));
    return drawn;
  };

  it('is white when well, and the state’s or hit points’ colour otherwise, the state first', () => {
    expect(colourFor(() => {})).toBe(Colour.brightWhite);
    expect(colourFor((m) => (m.hp = 20))).toBe(Colour.brightYellow); // under a quarter
    expect(colourFor((m) => (m.hp = 5))).toBe(Colour.brightRed); // under a tenth
    expect(colourFor((m) => (m.status = Status.Poisoned))).toBe(Colour.brightGreen);
    expect(colourFor((m) => Object.assign(m, { status: Status.Poisoned, hp: 5 }))).toBe(Colour.brightGreen);
    expect(colourFor((m) => (m.exp = 100))).toBe(Colour.levelBlue); // a level due
    expect(colourFor((m) => Object.assign(m, { exp: 100, hp: 5 }))).toBe(Colour.levelBlue);
  });
});
