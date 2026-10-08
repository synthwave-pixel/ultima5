import { describe, expect, it } from 'vitest';
import { foePast, followUpFoe, passable, placeCombatant } from '../src/game/combat.ts';
import { CF, type Game } from '../src/game/game.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/**
 * Walking into a foe gives every hand a blow (a spiked helm and a weapon in each hand, up to three), none of them
 * asking where: at the foe walked into while it stands, else the nearest foe the hand reaches (the weaker of two as
 * near), else the blow is skipped. What leaves the hand - dagger, oil, spear, throwing axe - reaches only a neighbour.
 */
describe("a bump attack's later blows", () => {
  const DAGGER = 0x10;
  const SHORT_SWORD = 0x17;
  const BOW = 0x1a;
  const SPIKED_HELM = 0x03;
  const MAGIC_AXE = 0x26;
  const HALBERD = 0x22;

  /** A field with the member at (5, 5) and foes where asked, each with its hit points. */
  const field = (...foes: [number, number, number][]): { g: Game; me: number; at: number[] } => {
    const { g } = newGame(1);
    journeyOnward(g);
    for (const c of g.combat) c.flags = 0;
    for (const a of g.s.actors) a.tile = a.anim = 0;
    const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
    const me = placeCombatant(g, 0, 1, 5, 5, 0);
    const at = foes.map(([x, y, hp]) => {
      const j = placeCombatant(g, rat, 0, x, y, 0);
      g.combat[j].hp = hp;
      return j;
    });
    return { g, me, at };
  };
  const walkedInto = { x: 6, y: 5 };

  /** The field open ground, but for walls at the cells given. */
  const walls = (g: Game, ...at: [number, number][]): void => {
    const tiles = Array.from({ length: 256 }, (_, t) => t);
    g.view.fill(0);
    const open = tiles.find((t) => (g.view.fill(t), passable(g, 0, 0)))!;
    const wall = tiles.find((t) => (g.view.fill(t), !passable(g, 0, 0)))!;
    g.view.fill(open);
    for (const [x, y] of at) g.view[y * 32 + x] = wall;
  };

  it('strikes the foe walked into again while it stands', () => {
    const { g, me } = field([6, 5, 10], [4, 5, 1]);
    expect(followUpFoe(g, me, SHORT_SWORD, walkedInto)).toEqual(walkedInto);
  });

  it('turns to the nearest foe when the one walked into is dead, the weaker of two as near', () => {
    const { g, me, at } = field([6, 5, 10], [4, 5, 9], [5, 6, 3], [5, 3, 1]);
    g.combat[at[0]].flags |= CF.Dead;
    expect(followUpFoe(g, me, SHORT_SWORD, walkedInto)).toEqual({ x: 5, y: 6 });
  });

  it('skips the blow when no foe is in reach', () => {
    const { g, me, at } = field([6, 5, 10], [8, 5, 1]);
    g.combat[at[0]].flags |= CF.Dead;
    expect(followUpFoe(g, me, SHORT_SWORD, walkedInto)).toBeNull();
    expect(followUpFoe(g, me, SPIKED_HELM, walkedInto)).toBeNull();
  });

  it('throws nothing past a neighbour, but shoots as far as the weapon reaches', () => {
    const { g, me, at } = field([6, 5, 10], [7, 5, 1]);
    g.combat[at[0]].flags |= CF.Dead;
    expect(followUpFoe(g, me, DAGGER, walkedInto)).toBeNull();
    expect(followUpFoe(g, me, BOW, walkedInto)).toEqual({ x: 7, y: 5 });
    expect(followUpFoe(g, me, MAGIC_AXE, walkedInto)).toEqual({ x: 7, y: 5 });
  });

  it('takes a neighbour across a corner, and passes over the charmed and the invisible', () => {
    const { g, me, at } = field([6, 5, 10], [6, 6, 8], [4, 4, 1], [4, 6, 1]);
    g.combat[at[0]].flags |= CF.Dead;
    g.combat[at[2]].flags |= CF.Charmed;
    g.combat[at[3]].flags |= CF.Invisible;
    expect(followUpFoe(g, me, SHORT_SWORD, walkedInto)).toEqual({ x: 6, y: 6 });
  });

  it('shoots only where no wall stops the shot, the weaker foe behind a wall passed over for one in the open', () => {
    const { g, me, at } = field([6, 5, 10], [8, 5, 1], [5, 8, 40]);
    g.combat[at[0]].flags |= CF.Dead;
    walls(g, [7, 5]);
    expect(followUpFoe(g, me, BOW, walkedInto)).toEqual({ x: 5, y: 8 });
    walls(g);
    expect(followUpFoe(g, me, BOW, walkedInto)).toEqual({ x: 8, y: 5 });
  });

  it('strikes over a wall with a halberd, which flies nowhere, where a bow is stopped', () => {
    const { g, me } = field([7, 5, 5]);
    walls(g, [6, 5]);
    expect(followUpFoe(g, me, HALBERD, walkedInto)).toEqual({ x: 7, y: 5 });
    expect(followUpFoe(g, me, BOW, walkedInto)).toBeNull();
  });

  it('finds its own foe with no foe walked into (Y, Auto aim Y): the nearest each weapon reaches', () => {
    const { g, me } = field([6, 6, 10], [4, 5, 3], [8, 5, 1]);
    expect(followUpFoe(g, me, SHORT_SWORD, null)).toEqual({ x: 4, y: 5 });
    expect(followUpFoe(g, me, DAGGER, null)).toEqual({ x: 4, y: 5 });
    const far = field([8, 5, 1]);
    expect(followUpFoe(far.g, far.me, SHORT_SWORD, null)).toBeNull();
    expect(followUpFoe(far.g, far.me, BOW, null)).toEqual({ x: 8, y: 5 });
  });

  describe('past a friend walked into', () => {
    const SPEAR = 0x15;
    /** The member at (5, 5) armed with `hands`, a friend east at (6, 5), and the foes and walls given. */
    const line = (hands: number[], foes: [number, number, number][], wallsAt: [number, number][] = []) => {
      const f = field(...foes);
      const m = f.g.s.members[0];
      m.equips[0] = m.equips[2] = m.equips[3] = 0xff;
      hands.forEach((w, k) => (m.equips[[2, 3, 0][k]] = w));
      placeCombatant(f.g, 1, 1, 6, 5, 0);
      walls(f.g, ...wallsAt);
      return f;
    };

    it('points at the first foe along the line, over other members, and throws at it', () => {
      const { g, me } = line(
        [DAGGER],
        [
          [8, 5, 10],
          [5, 6, 1],
        ],
      );
      placeCombatant(g, 2, 1, 7, 5, 0);
      const past = foePast(g, me, 1, 0);
      expect(past).toMatchObject({ x: 8, y: 5, pointed: true });
      expect(followUpFoe(g, me, DAGGER, past)).toBe(past);
      // Not pointed at, the same foe is too far to throw at.
      expect(followUpFoe(g, me, DAGGER, { x: 8, y: 5 })).toEqual({ x: 5, y: 6 });
    });

    it('strikes with a halberd two squares off, and not at all with only a sword', () => {
      expect(foePast(line([HALBERD], [[7, 5, 10]]).g, 0, 1, 0)).toMatchObject({ x: 7, y: 5 });
      const { g, me } = line([SHORT_SWORD], [[7, 5, 10]]);
      expect(foePast(g, me, 1, 0)).toBeNull();
    });

    it('stops at a wall, and at the edge of what the longest weapon reaches', () => {
      expect(foePast(line([BOW], [[9, 5, 10]], [[7, 5]]).g, 0, 1, 0)).toBeNull();
      const spear = line([SPEAR], [[10, 5, 10]]).g;
      spear.s.equipment[SPEAR] = 1; // a spare: the last one is kept in hand (Throw: Safe)
      expect(foePast(spear, 0, 1, 0)).toMatchObject({ x: 10, y: 5 });
      spear.s.equipment[SPEAR] = 0;
      expect(foePast(spear, 0, 1, 0)).toBeNull();
      expect(foePast(line([DAGGER], [[10, 5, 10]]).g, 0, 1, 0)).toBeNull();
    });

    it('lets each hand that does not reach the foe pointed at take one it does', () => {
      const { g, me } = line(
        [SHORT_SWORD, BOW],
        [
          [8, 5, 10],
          [5, 6, 3],
        ],
      );
      const past = foePast(g, me, 1, 0)!;
      expect(past).toMatchObject({ x: 8, y: 5 });
      expect(followUpFoe(g, me, BOW, past)).toBe(past);
      expect(followUpFoe(g, me, SHORT_SWORD, past)).toEqual({ x: 5, y: 6 });
    });
  });
});
