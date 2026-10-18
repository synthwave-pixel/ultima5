import { describe, expect, it } from 'vitest';
import { freeActor } from '../src/game/actors.ts';
import { attackCombat, campOutdoors, removeCombatant } from '../src/game/combat.ts';
import { attackInDungeon } from '../src/game/dungeon.ts';
import { CF } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { stashWorldActors } from '../src/game/outdoors.ts';
import { journeyOnward } from '../src/game/run.ts';
import { Status } from '../src/game/save.ts';
import { attackInTown, enterTown, loadLevel } from '../src/game/town.ts';
import { newGame } from './helpers.ts';

type Made = ReturnType<typeof newGame>;

/**
 * The Modern karma's Battle at the fight's end (modernKarma.ts battleOutcome, combat.ts): counted at the VICTORY (+1,
 * +2 against greater numbers), a fight left with foes standing at its end (−3), a party fallen nothing - wherever the
 * fight is: out in the open, a camp ambushed, a dungeon's room; never for a fight won by a cheat, or against the place's
 * own people, whose killing costs instead.
 */
describe('the Battle karma, fight by fight', () => {
  const party = (made: Made, rules: 'modern' | 'story' = 'modern'): Made => {
    const { g } = made;
    journeyOnward(g);
    g.options.rules = rules;
    for (let m = 0; m < g.s.partySize; m++) Object.assign(g.s.members[m], { hp: 500, maxHp: 500, status: Status.Good });
    return made;
  };
  const monsters = (g: Made['g']): number[] =>
    [...g.combat.entries()].filter(([, c]) => c.flags & CF.Monster && !(c.flags & CF.Dead)).map(([i]) => i);
  const members = (g: Made['g']): number[] =>
    [...g.combat.entries()].filter(([, c]) => c.flags & CF.Player && !(c.flags & CF.Dead)).map(([i]) => i);

  /** At the fight's first prompt, `end` the fight; then, the field won, leave it (Escape) - or pass. */
  const playing = (made: Made, end: (g: Made['g']) => void): void => {
    const { g, p } = made;
    let done = false;
    let steps = 0;
    p.next = () => {
      if (++steps > 3000) throw new Error(`the fight went on too long: ${p.log.replace(/\s+/g, ' ').slice(-400)}`);
      if (g.commandPrompt !== 'combat') return K.Space;
      if (!done) {
        done = true;
        end(g);
      }
      return g.s.battleWon !== 0 ? K.Escape : K.Space;
    };
  };
  /** Orcs beside the party, out in the open, and the fight with them. */
  const fightOrcs = async (made: Made): Promise<void> => {
    const { g } = made;
    const foe = freeActor(g);
    Object.assign(g.s.actors[foe], { tile: 0xc0, anim: 0xc0, x: g.s.x, y: g.s.y - 1, z: g.s.level, b5: 0 });
    await attackCombat(g, foe);
  };
  const win = (g: Made['g']): void => {
    for (const i of monsters(g)) removeCombatant(g, -i - 1);
  };

  it('counts a fight won at its VICTORY, and leaving the field won costs nothing', async () => {
    const made = party(newGame());
    playing(made, win);
    await fightOrcs(made);
    const { g, p } = made;
    expect(p.log).toContain('VICTORY');
    const odds = g.fightOdds;
    expect(g.path.pools.battle).toBe(75 + (odds.foes > odds.party ? 2 : 1));
  });

  it('costs a fight left with its foes standing', async () => {
    const made = party(newGame());
    playing(made, (g) => {
      for (const i of members(g)) removeCombatant(g, -i - 1); // every member gone from the field: fled
    });
    await fightOrcs(made);
    expect(made.g.path.pools.battle).toBe(72);
  });

  it('counts nothing for a party fallen', async () => {
    const made = party(newGame());
    playing(made, (g) => {
      for (let m = 0; m < g.s.partySize; m++) Object.assign(g.s.members[m], { hp: 0, status: Status.Dead });
      for (const i of members(g)) g.combat[i].flags |= CF.Dead;
    });
    await fightOrcs(made).catch(() => undefined); // (the party's death is the game's to deal with)
    expect(made.g.path.pools.battle).toBe(75);
  });

  it('counts nothing for a fight won by a cheat (Slay every foe)', async () => {
    const made = party(newGame());
    playing(made, (g) => {
      g.cheatedFight = true;
      win(g);
    });
    await fightOrcs(made);
    expect(made.g.path.pools.battle).toBe(75);
  });

  it('counts a camp ambush beaten', async () => {
    const made = party(newGame());
    const { g } = made;
    Object.assign(g.s, { hour: 22, minute: 0 });
    const dice = g.random.bind(g);
    g.random = (lo: number, hi: number): number => (lo === 0 && hi === 0x3f ? 0 : dice(lo, hi)); // ambushed at once
    playing(made, win);
    await campOutdoors(g, 0, 9);
    expect(made.p.log).toContain('Ambushed!');
    expect(g.path.pools.battle).toBeGreaterThan(75);
  });

  it('counts a fight won in a dungeon, against the creature in the corridor', async () => {
    const made = party(newGame());
    const { g } = made;
    g.s.dungeon.set(g.data.files.get('DUNGEON.DAT').subarray(0, 0x200));
    g.s.dungeon.fill(0x00); // open floor all round
    Object.assign(g.s, { mapId: 0x21, level: 0, x: 1, y: 1, facing: 1, d6602: 5, d58a7: 0xff });
    Object.assign(g.s.actors[1], { tile: 0xc0, anim: 0xc0, x: 2, y: 1, z: 0, b5: 0x20 }); // orcs, ahead to the east
    playing(made, win);
    await attackInDungeon(g);
    expect(made.p.log).toContain('VICTORY');
    expect(g.path.pools.battle).toBeGreaterThan(75);
  });

  it('costs the killing of a townsperson attacked, and the fight earns nothing', async () => {
    const made = party(newGame());
    const { g, p } = made;
    stashWorldActors(g);
    Object.assign(g.s, { mapId: 2, level: 0, x: 15, y: 30, hour: 12 }); // Britain
    await enterTown(g, true);
    const s = g.s;
    // Someone of the town standing in the open (no bed, stocks or counter under them), the party beside them.
    const i = [...Array(32).keys()].find((k) => k > 0 && s.npcTypes[k] >= 0x40 && s.npcTypes[k] < 0x70 && s.npcs[k].f0 !== 0)!;
    const n = s.npcs[i];
    Object.assign(s, { level: n.z, x: n.x, y: n.y + 1 });
    loadLevel(g, true);
    p.keys.push(K.Up); // Attack-North
    playing(made, win);
    await attackInTown(g);
    expect(s.battleWon).not.toBe(0);
    expect(g.path.pools.deeds).toBe(75 - 10 - 20); // attacked, then killed
    expect(g.path.pools.battle).toBe(75 - 20); // and no credit for the win
  });
});
