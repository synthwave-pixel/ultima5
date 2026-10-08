import { describe, expect, it } from 'vitest';
import { attackCommand, charm, enemy, strayRisk } from '../src/game/combat.ts';
import { CF } from '../src/game/game.ts';
import { getCommandKey } from '../src/game/input.ts';
import { Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

const RAT = 0x14;
const BOW = 0x1a;
const ARROWS = 0x1b;

/**
 * A fight on the arena: the Avatar (0) with a bow at (2, 5), a member (1) at (7, 5), and rats at the places given
 * (combatants 6 on). The controller's X with Auto aim, as input.ts sets it.
 */
function fight(rats: [number, number][], seed = 1234) {
  const { g, p } = newGame(seed);
  journeyOnward(g);
  const s = g.s;
  s.mapId = 0xff;
  s.combatTurn = 0;
  g.options.input = 'controller';
  g.options.autoAim = true;
  const e = s.members[0].equips;
  [e[0], e[2], e[3]] = [0xff, BOW, 0xff];
  s.equipment[ARROWS] = 20;
  const place = (i: number, at: [number, number], flags: number, who: number, hp: number, tile: number): void => {
    Object.assign(g.combat[i], { who, x: at[0], y: at[1], flags, hp, dex: 10, actor: i + 1 });
    Object.assign(s.actors[i + 1], { tile, anim: tile, x: at[0], y: at[1], z: 0 });
  };
  place(0, [2, 5], CF.Player, 0, 0, 0x1c);
  place(1, [7, 5], CF.Player, 1, 0, 0x1c);
  rats.forEach((at, n) => place(6 + n, at, CF.Monster, RAT, enemy(g, RAT).maxHp, 0x40 + RAT * 4));
  const shoot = async (): Promise<void> => {
    g.autoAim = true;
    g.cancelled = false;
    await attackCommand(g, 0, 1);
  };
  return { g, p, s, shoot };
}

/** Auto aim's shots spare the party a stray (combat.ts strayRisk, allyAtRisk). */
describe("Auto aim and the party's side", () => {
  it('will not shoot at a foe beside a friend without asking, and shoots when X is pressed again', async () => {
    const { g, p, s, shoot } = fight([[6, 5]]); // the rat beside the member at (7, 5)
    await shoot();
    // (The log keeps no space where a line wrapped.)
    expect(p.log).toMatch(new RegExp(`${s.members[0].name} might hit\\s*ally, confirm\\?`));
    expect(g.cancelled).toBe(true); // the turn not spent
    expect(s.equipment[ARROWS]).toBe(20);
    p.log = '';
    await shoot(); // X again, straight away
    expect(p.log).not.toMatch(/might hit/);
    expect(s.equipment[ARROWS]).toBe(19);
  });

  it('shoots at a foe with no friend beside it rather than one with', async () => {
    const { s, shoot } = fight([
      [6, 5], // beside the member, and nearer
      [2, 9], // alone, further off
    ]);
    await shoot();
    expect([s.crossX, s.crossY]).toEqual([2, 9]);
    expect(s.equipment[ARROWS]).toBe(19);
  });

  it('counts a creature fighting for the party as a friend, and a foe as none', () => {
    const { g } = fight([
      [4, 2],
      [5, 2],
      [8, 8],
    ]);
    expect(strayRisk(g, 0, 6)).toBe(false); // a rat beside a rat
    charm(g, 7, 0); // the second rat, won to the party's side
    expect(strayRisk(g, 0, 6)).toBe(true);
    expect(strayRisk(g, 0, 8)).toBe(false);
  });

  it('forgets the warning once any other key is pressed', async () => {
    const { g, p, shoot } = fight([[6, 5]]);
    await shoot();
    expect(g.allyWarned).toBe(0);
    p.keys.push(Pad.B);
    await getCommandKey(g, 'combat');
    expect(g.allyWarned).toBe(-1);
  });
});
