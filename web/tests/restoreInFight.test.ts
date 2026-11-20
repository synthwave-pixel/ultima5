import { describe, expect, it } from 'vitest';
import { CHEATS } from '../src/game/cheats.ts';
import { combatantAt, damage, placeCombatant } from '../src/game/combat.ts';
import { CF } from '../src/game/game.ts';
import { Status } from '../src/game/save.ts';
import { setView } from '../src/game/world.ts';
import { newGame } from './helpers.ts';

const BODY = 0x1e; // a fallen member's figure
const restore = (g: ReturnType<typeof newGame>['g']) => CHEATS.find((c) => c.label === 'Full restore')!.apply(g);

/**
 * A fight on a field of floor: members 0 and 1 standing at (2, 5) and (3, 5), member 2 dead before it began, and a
 * foe at (8, 5).
 * Issue #40: Full restore in a fight made the fallen whole on the party's list while their figure lay dead on the
 * field - skipped every turn, walked over, and alive again once the rest had fallen, the fight over and nobody dead.
 */
function fight() {
  const { g } = newGame();
  const s = g.s;
  s.mapId = 0xff;
  s.partySize = 3;
  g.combatMap.fill(0x44);
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) setView(g, x, y, 0x44);
  for (const a of s.actors) a.tile = a.anim = 0;
  for (const c of g.combat) Object.assign(c, { flags: 0, x: 0x63, y: 0x63 });
  for (const m of [0, 1]) Object.assign(s.members[m], { status: Status.Good, hp: 50, maxHp: 90 });
  Object.assign(s.members[2], { status: Status.Dead, hp: 0, maxHp: 90 }); // dead before the fight: never placed
  // Each member drawn as it is placed (as placeParty does), so the next takes a figure of its own.
  const member = (m: number, x: number): number => {
    const i = placeCombatant(g, m, 1, x, 5, 0);
    s.actors[g.combat[i].actor].tile = s.actors[g.combat[i].actor].anim = 0x48;
    return i;
  };
  const m0 = member(0, 2);
  const m1 = member(1, 3);
  const foe = placeCombatant(g, 0x10, 0, 8, 5, 0);
  expect(new Set([m0, m1, foe].map((i) => g.combat[i].actor)).size).toBe(3);
  return { g, s, m0, m1, foe };
}

/** Every member alive on the party's list stands on the field, and every one dead lies there or was never placed. */
function agrees(g: ReturnType<typeof newGame>['g']): void {
  for (let m = 0; m < g.s.partySize; m++) {
    const i = g.combat.findIndex((c) => c.flags & CF.Player && c.who === m);
    const alive = g.s.members[m].status !== Status.Dead;
    if (alive) {
      expect(i, `member ${m} on the field`).toBeGreaterThanOrEqual(0);
      expect(g.combat[i].flags & CF.Dead, `member ${m} standing`).toBe(0);
      expect(combatantAt(g, g.combat[i].x, g.combat[i].y), `member ${m} found where they stand`).toBe(i);
      expect(g.s.actors[g.combat[i].actor].tile, `member ${m} drawn standing`).not.toBe(BODY);
    } else if (i >= 0) expect(g.combat[i].flags & CF.Dead).toBe(CF.Dead);
  }
}

describe('Full restore in a fight', () => {
  it('raises one fallen in the fight where they fell, drawn and taking turns again', async () => {
    const { g, s, m1 } = fight();
    await damage(g, m1, 99);
    expect(g.combat[m1].flags & CF.Dead).toBe(CF.Dead);
    expect(s.actors[g.combat[m1].actor].tile).toBe(BODY);
    await restore(g);
    expect(s.members[1].status).toBe(Status.Good);
    expect(s.members[1].hp).toBe(90);
    expect(g.combat[m1].flags).toBe(CF.Player);
    expect([g.combat[m1].x, g.combat[m1].y]).toEqual([3, 5]);
    expect(g.combat[m1].timer).toBe(36 - g.combat[m1].dex);
    expect(s.actors[g.combat[m1].actor].tile).toBe(0x48);
    agrees(g);
  });

  it('raises one whose body a foe stands on, on the nearest square free', async () => {
    const { g, s, m1, foe } = fight();
    await damage(g, m1, 99);
    Object.assign(g.combat[foe], { x: 3, y: 5 });
    Object.assign(s.actors[g.combat[foe].actor], { x: 3, y: 5 });
    await restore(g);
    const c = g.combat[m1];
    expect(c.flags & CF.Dead).toBe(0);
    expect([c.x, c.y]).not.toEqual([3, 5]);
    expect(Math.max(Math.abs(c.x - 3), Math.abs(c.y - 5))).toBe(1);
    expect([s.actors[c.actor].x, s.actors[c.actor].y]).toEqual([c.x, c.y]);
    expect(combatantAt(g, 3, 5)).toBe(foe);
    agrees(g);
  });

  it('places one who was dead before the fight began, beside the party', async () => {
    const { g, s, m0 } = fight();
    await restore(g);
    expect(s.members[2].status).toBe(Status.Good);
    const i = g.combat.findIndex((c) => c.flags & CF.Player && c.who === 2);
    expect(i).toBeGreaterThanOrEqual(0);
    const [a, b] = [g.combat[i], g.combat[m0]];
    expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBe(1);
    agrees(g);
  });

  it('leaves the fallen dead where there is no square to stand on, rather than whole and nowhere', async () => {
    const { g, s, m1 } = fight();
    await damage(g, m1, 99);
    g.combatMap.fill(0x4f); // nothing anyone can stand on: wall everywhere
    for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) setView(g, x, y, 0x4f);
    await restore(g);
    expect(s.members[1].status).toBe(Status.Dead);
    expect(s.members[2].status).toBe(Status.Dead);
    expect(g.combat[m1].flags & CF.Dead).toBe(CF.Dead);
    agrees(g);
  });

  it('heals the living and leaves the fight alone where nobody had fallen', async () => {
    const { g, s, m0, m1 } = fight();
    s.members[0].hp = 3;
    await restore(g);
    expect(s.members[0].hp).toBe(90);
    expect([g.combat[m0].x, g.combat[m0].y, g.combat[m1].x, g.combat[m1].y]).toEqual([2, 5, 3, 5]);
    agrees(g);
  });
});
