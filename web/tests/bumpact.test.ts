import { describe, expect, it } from 'vitest';
import { bumpCommand, foesAbout } from '../src/game/bumpAct.ts';
import { processCommand } from '../src/game/commands.ts';
import { bumpInto, getChar } from '../src/game/input.ts';
import { AN_SANCT } from '../src/game/magic.ts';
import { attackCombat, combatantAt } from '../src/game/combat.ts';
import { CF, thingKey } from '../src/game/game.ts';
import { fighter, keys } from './helpers.ts';
import { K } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { T } from '../src/game/tiles.ts';
import { enterTown, townLoop } from '../src/game/town.ts';
import { enterWorld } from '../src/game/outdoors.ts';
import { setTileAt, tileAt } from '../src/game/world.ts';
import { somethingBeside } from '../src/game/items.ts';
import { Status } from '../src/game/save.ts';
import { newGame } from './helpers.ts';

const [CAST, GET, JIMMY, KLIMB, LOOK, OPEN, PUSH, SEARCH] = [0x43, 0x47, 0x4a, 0x4b, 0x4c, 0x4f, 0x50, 0x53];

/**
 * Bump to act for things (bumpAct.ts): walking into something does what there is to do with it, and "Blocked!" is
 * for walls, water and the like.
 */
describe('bump to act, for things', () => {
  const game = (mapId: number): ReturnType<typeof newGame>['g'] => {
    const { g } = newGame();
    g.s.mapId = mapId;
    g.s.partyTile = 0x1c; // on foot
    return g;
  };
  /** One bump from (5, 5) east. */
  const bump = (
    g: ReturnType<typeof newGame>['g'],
    actor: number,
    tile: number,
    where: 'town' | 'outdoors' | 'combat' = 'town',
    from = 5,
  ): number => bumpCommand(g, where, actor, tile, from + 1, 5);

  it('takes what lies about, and searches a corpse', () => {
    const g = game(0);
    expect(bump(g, 0x02, T.Grass, 'outdoors')).toBe(GET); // gold
    expect(bump(g, 0x19, T.Grass, 'outdoors')).toBe(GET); // a moonstone
    expect(bump(g, 0x1f, T.Grass, 'outdoors')).toBe(SEARCH); // a corpse
  });

  it('searches a chest, and opens it at the second bump - but only looks at one in a settlement (it costs karma)', () => {
    const g = game(0xff);
    expect(bump(g, 0x01, 0x44, 'combat')).toBe(SEARCH);
    expect(bump(g, 0x01, 0x44, 'combat')).toBe(OPEN);
    expect(bump(g, 0x01, 0x44, 'combat')).toBe(SEARCH); // and round again
    // The search is the party's, not one member's: another, walking into the chest from another side, opens it -
    // though a second chest searched between is remembered as well.
    const at = (x: number, y: number): number => bumpCommand(g, 'combat', 0x01, 0x44, x, y);
    expect(at(8, 6)).toBe(SEARCH); // a second chest, searched
    expect(at(6, 5)).toBe(OPEN); // the first, searched again above, opened by whoever walks into it next
    expect(at(8, 6)).toBe(OPEN); // the second
    const t = game(5);
    expect(bump(t, 0x01, 0x44)).toBe(LOOK);
    expect(bump(t, 0x01, 0x44)).toBe(LOOK);
  });

  it("goes on from a chest's search by what it said: open it; or, trapped, An Sanct, else Jimmy, else open it anyway", () => {
    const g = game(0);
    const m = g.s.members;
    g.s.partySize = 3;
    m.slice(0, 3).forEach((v) => Object.assign(v, { status: Status.Good, level: 1, mp: 0 }));
    [m[0].dex, m[1].dex, m[2].dex] = [12, 22, 15];
    [m[0].hp, m[1].hp, m[2].hp] = [50, 30, 80];
    const at = thingKey(g, 6, 5);
    const read = (r: 'trap' | 'clean'): number => {
      g.bumped.set(at, r);
      return bump(g, 0x01, T.Grass, 'outdoors');
    };
    expect(read('clean')).toBe(OPEN);
    expect(g.bumpWho).toBe(2); // by the hardiest: a reading may be wrong
    expect(g.bumped.has(at)).toBe(false); // opened: the next chest there is searched afresh
    // Read as trapped: An Sanct, by whoever can cast it (no key, no roll).
    Object.assign(m[2], { level: 3, mp: 9 });
    g.s.mixtures[AN_SANCT] = 1;
    g.s.keys = 4;
    expect(read('trap')).toBe(CAST);
    expect(g.castPreset).toEqual({ caster: 2, spell: AN_SANCT });
    // None mixed: jimmied, by the most dexterous.
    g.castPreset = null;
    g.s.mixtures[AN_SANCT] = 0;
    expect(read('trap')).toBe(JIMMY);
    expect(g.bumpWho).toBe(1);
    // No keys either: opened as it stands, by the hardiest.
    g.s.keys = 0;
    expect(read('trap')).toBe(OPEN);
    expect(g.bumpWho).toBe(2);
  });

  it('disarms a chest read as trapped, by An Sanct or a key, and opens it - and searches again when a key breaks', async () => {
    const run = async (g: ReturnType<typeof newGame>['g'], p: ReturnType<typeof newGame>['p']): Promise<string[]> => {
      const done: string[] = [];
      for (let i = 0; i < 4 && g.s.actors[5].tile === 0x01; i++) {
        const from = p.log.length;
        const command = bumpCommand(g, 'outdoors', 0x01, T.Grass, g.s.x + 1, g.s.y);
        bumpInto(g, command, K.Right);
        await processCommand(g, await getChar(g));
        // What was said, and the chest's reading after it (its badge).
        done.push(`${p.log.slice(from)}[${g.bumped.get(thingKey(g, g.s.x + 1, g.s.y)) ?? ''}]`);
      }
      return done;
    };
    const chest = (b5: number) => {
      const { g, p } = newGame();
      const s = g.s;
      [s.mapId, s.level, s.x, s.y] = [0, 0, 82, 106]; // the plain outside Britain
      enterWorld(g);
      Object.assign(s.actors[5], { tile: 0x01, anim: 0x01, x: s.x + 1, y: s.y, z: s.level, b5 });
      for (let i = 1; i < 0x20; i++) if (i !== 5 && s.actors[i].tile >= 0x80) s.actors[i].tile = 0; // no monster about
      s.partySize = 2;
      s.members.slice(0, 2).forEach((v) => Object.assign(v, { status: Status.Good, int: 30, dex: 30, hp: 99, level: 1, mp: 0 }));
      s.mixtures[AN_SANCT] = 0;
      return { g, p, s };
    };

    // A caster at hand: Search ("a trap!"), An Sanct, then Open - with no trap sprung.
    {
      const { g, p, s } = chest(0x81);
      Object.assign(s.members[1], { level: 4, mp: 10 });
      s.mixtures[AN_SANCT] = 1;
      const [search, cast, open] = await run(g, p);
      expect(search).toMatch(/a (simple )?trap!/);
      expect(search).toMatch(/\[trap\]$/);
      expect(cast).toMatch(/Cast/);
      expect(cast).toMatch(/\[disarmed\]$/);
      expect(s.mixtures[AN_SANCT]).toBe(0);
      expect(s.members[1].mp).toBe(8);
      expect(open).toMatch(/Open/);
      expect(open).not.toMatch(/Trapped!/);
      expect(s.actors[5].tile).not.toBe(0x01);
    }
    // No caster, a key: Search, Jimmy ("Success!"), Open.
    {
      const { g, p, s } = chest(0x81);
      s.keys = 2;
      const [, jimmy, open] = await run(g, p);
      expect(jimmy).toMatch(/Success!/);
      expect(jimmy).toMatch(/\[disarmed\]$/);
      expect(s.keys).toBe(2);
      expect(open).not.toMatch(/Trapped!/);
    }
    // A reading that was wrong: the chest never trapped breaks the key, and is searched again.
    {
      const { g, p, s } = chest(0x00);
      s.keys = 2;
      g.bumped.set(thingKey(g, s.x + 1, s.y), 'trap');
      const [jimmy, again] = await run(g, p);
      expect(jimmy).toMatch(/Key broke!/);
      expect(s.keys).toBe(1);
      expect(again).toMatch(/Search/);
      expect(jimmy).toMatch(/\[\]$/); // the badge gone with the reading
      expect(again).toMatch(/no trap!/);
      expect(again).toMatch(/\[clean\]$/);
    }
  });

  it('searches a barrel and pushes it at the second bump; searches a bookshelf; pushes a plant', () => {
    const g = game(5);
    expect(bump(g, 0, T.Barrel)).toBe(SEARCH);
    expect(bump(g, 0, T.Barrel)).toBe(PUSH);
    expect(bump(g, 0, T.Bookshelf)).toBe(SEARCH);
    expect(bump(g, 0, 0x5b)).toBe(PUSH);
    expect(bump(g, 0, T.CannonB4)).toBe(PUSH); // never Fire: that calls the guards
  });

  it('opens the doors that will say why not, klimbs rocks on foot, borrows a torch, looks at the rest', () => {
    const g = game(5);
    expect(bump(g, 0, 0x97)).toBe(OPEN); // an odd door: "Locked!"
    expect(bump(g, 0, 0x99)).toBe(OPEN); // a portcullis: "Too heavy!"
    expect(bump(g, 0, 0x4c)).toBe(KLIMB);
    g.s.partyTile = 0x10; // on horseback
    expect(bump(g, 0, 0x4c)).toBe(0);
    // In a fight each member is on foot, and climbs the rocks a gargoyle leaves - but no fence, which Klimb there does not
    expect(bump(g, 0, 0x4c, 'combat')).toBe(KLIMB);
    expect(bump(g, 0, 0xca, 'combat')).toBe(0);
    expect(bump(g, 0, 0xb0)).toBe(GET);
    for (const t of [T.Well, T.Fountain, T.Clock, T.SignF0, T.Mirror, 0x9a /* a table with food */]) expect(bump(g, 0, t)).toBe(LOOK);
  });

  it('leaves walls, water and mountains "Blocked!"', () => {
    const g = game(0);
    for (const t of [T.Wall, 0xfe, T.Water1, 0x0c, 0x0d, 0x50]) expect(bump(g, 0, t, 'outdoors')).toBe(0);
  });

  it('searches a barrel walked into in a town, then pushes it', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    await enterTown(g, true);
    const s = g.s;
    s.activeMember = 0; // no "Player:" to answer
    for (const [x, t] of [
      [s.x + 1, T.Barrel],
      [s.x + 2, 0x44],
    ] as const)
      setTileAt(g, x, s.y, t);
    const [x0] = [s.x];
    p.keys.push(K.Right, K.Right);
    await townLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    expect(p.log).toMatch(/Search/);
    expect(p.log).toMatch(/Push/);
    expect(p.log).not.toMatch(/Blocked!/);
    expect(s.x).toBe(x0 + 1); // the barrel pushed on, and the party into its place
  });

  it('in a fight won, searches a corpse walked into, and searches then opens a chest', async () => {
    const { g, p } = newGame(2);
    journeyOnward(g);
    await enterTown(g, true);
    p.keys.push(...keys(K.Down, K.Down, K.Down, 'O', K.Down), ...Array<number>(14).fill(K.Down), 'Y'.charCodeAt(0));
    await townLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    const s = g.s;
    const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
    const foe = s.actors[1];
    foe.tile = foe.anim = 0x40 + rat * 4;
    [foe.x, foe.y, foe.z] = [s.x + 1, s.y, 0];
    const fight = fighter(g);
    // The member first asked, and the side of it the things are set down at.
    let who = -1;
    let step = 0;
    const said: string[] = [];
    let from = 0;
    const put = (tile: number, x: number, y: number, b5 = 0): void => {
      const a = s.actors.findIndex((v, i) => i > 0 && v.tile === 0);
      Object.assign(s.actors[a], { tile, anim: tile, x, y, z: 0, b5 });
    };
    p.next = () => {
      const me = g.combat[s.combatTurn];
      const mine = !!(me.flags & CF.Player) && !s.crosshair;
      g.options.input = 'letters';
      // Once the rat is dead: while a foe stands, nothing lying about is searched or opened at a bump.
      if (mine && step < 3 && !foesAbout(g, 'combat') && (who === -1 || me.who === who)) {
        const [x, y] = [me.x, me.y - 1];
        if (step === 0) {
          // No room to the north: the turn passed, for the field won is not to be left yet.
          if (y < 0 || combatantAt(g, x, y) >= 0) return K.Space;
          who = me.who;
          put(0x1f, x, y); // a corpse, to the north
        } else if (step === 1) {
          // Whatever the corpse left (now and then gold or food) is cleared away, and a chest set there, untrapped.
          for (const v of s.actors.slice(1)) if (v.x === x && v.y === y && v.tile < 0x20) v.tile = 0;
          put(0x01, x, y, 0x05);
        }
        if (step > 0) said.push(p.log.slice(from));
        from = p.log.length;
        step++;
        g.options.input = 'controller';
        return K.Up;
      }
      if (step === 3 && mine && me.who === who) {
        said.push(p.log.slice(from));
        step++;
      }
      // The field won, the others pass until the one walking into things is done.
      if (mine && step <= 3 && !foesAbout(g, 'combat')) return K.Space;
      return fight();
    };
    await attackCombat(g, 1);
    expect(said.length).toBe(3);
    const [corpse, chest1, chest2] = said;
    expect(corpse).toMatch(/Search/);
    expect(chest1).toMatch(/Search/);
    expect(chest1).toMatch(/trap/);
    expect(chest2).toMatch(/Open/);
    for (const t of said) expect(t).not.toMatch(/Blocked!/);
  });

  it('leaves what lies about alone while foes are about, but still opens, climbs and looks', () => {
    const g = game(0);
    // A monster in view of the party, out in the world.
    Object.assign(g.s.actors[5], { tile: 0x90, anim: 0x90, x: g.s.x + 3, y: g.s.y, z: g.s.level });
    expect(foesAbout(g, 'outdoors')).toBe(true);
    expect(bump(g, 0x02, T.Grass, 'outdoors')).toBe(0); // gold, not taken
    expect(bump(g, 0x01, T.Grass, 'outdoors')).toBe(0); // a chest, not searched
    expect(bump(g, 0x1f, T.Grass, 'outdoors')).toBe(0); // a corpse, not searched
    expect(bump(g, 0, T.Barrel, 'outdoors')).toBe(0);
    expect(bump(g, 0, 0x97, 'outdoors')).toBe(OPEN); // an odd door still says why it will not open
    // Out of sight, the monster is no matter.
    g.s.actors[5].x = g.s.x + 8;
    expect(foesAbout(g, 'outdoors')).toBe(false);
    expect(bump(g, 0x02, T.Grass, 'outdoors')).toBe(GET);
  });

  it('counts as foes about in a fight only those still standing on the monsters’ side', () => {
    const g = game(0xff);
    for (const c of g.combat) c.flags = 0;
    g.combat[0].flags = CF.Player;
    g.combat[6].flags = CF.Monster;
    expect(foesAbout(g, 'combat')).toBe(true);
    expect(bump(g, 0x01, T.Grass, 'combat')).toBe(0);
    g.combat[6].flags = CF.Monster | CF.Charmed; // on the party's side now
    expect(foesAbout(g, 'combat')).toBe(false);
    g.combat[6].flags = CF.Monster | CF.Dead;
    expect(foesAbout(g, 'combat')).toBe(false);
    expect(bump(g, 0x01, T.Grass, 'combat')).toBe(SEARCH);
  });

  it('has a chest searched by the cleverest, a corpse by the hardiest - or the hardiest already poisoned', () => {
    const g = game(0);
    const m = g.s.members;
    g.s.partySize = 3;
    [m[0].int, m[1].int, m[2].int] = [10, 25, 18];
    [m[0].hp, m[1].hp, m[2].hp] = [90, 40, 70];
    m.slice(0, 3).forEach((v) => (v.status = Status.Good));
    expect(bump(g, 0x01, 0x05, 'outdoors')).toBe(SEARCH);
    expect(g.bumpWho).toBe(1); // the most intelligent
    expect(bump(g, 0x1f, 0x05, 'outdoors')).toBe(SEARCH);
    expect(g.bumpWho).toBe(0); // the most hit points
    m[1].status = Status.Poisoned;
    m[2].status = Status.Poisoned;
    expect(bump(g, 0x1f, 0x05, 'outdoors')).toBe(SEARCH);
    expect(g.bumpWho).toBe(2); // the most hit points of those already poisoned: plague costs them nothing
    m[1].status = Status.Dead;
    m[2].status = Status.Good;
    expect(bump(g, 0x01, 0x05, 'outdoors', 7)).toBe(SEARCH);
    expect(g.bumpWho).toBe(2); // the dead search nothing
  });

  it('looks at a wall with a nick, then searches it: a hidden door, then a locked door', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    await enterTown(g, true);
    const s = g.s;
    setTileAt(g, s.x + 1, s.y, T.HiddenDoor);
    s.keys = 0;
    p.keys.push(K.Right, K.Right, K.Right);
    await townLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    expect(p.log).toMatch(/a wall with a\s+nick/i);
    expect(p.log).toMatch(/a hidden\s+door!/);
    expect(tileAt(g, s.x + 1, s.y)).toBe(T.DoorB9);
    expect(p.log).toMatch(/Locked!/); // the third bump: no keys, so Open, which says why not
    expect(p.log).not.toMatch(/Player:\s*$/m); // nobody was asked for
  });

  it('puts Search at the head of the menu beside something still to be found, and not once it is found', async () => {
    const { g } = newGame();
    journeyOnward(g);
    await enterTown(g, true);
    const s = g.s;
    const maps = g.data.bytes(0x3f5c, 0x72);
    const i = [...maps].findIndex((m, k) => m === s.mapId && (k < 0xd || k > 0xf));
    expect(i).toBeGreaterThanOrEqual(0);
    s.level = g.data.bytes(0x3fce, 0x72)[i];
    [s.x, s.y] = [g.data.bytes(0x4040, 0x72)[i] - 1, g.data.bytes(0x40b2, 0x72)[i]];
    expect(somethingBeside(g)).toBe(true);
    s.d585c[i >> 3] |= 1 << (i & 7); // found
    expect(somethingBeside(g)).toBe(false);
  });

  it('in a fight, wields the Sceptre at the strange walls walked into', async () => {
    const { g, p } = newGame(2);
    journeyOnward(g);
    await enterTown(g, true);
    p.keys.push(...keys(K.Down, K.Down, K.Down, 'O', K.Down), ...Array<number>(14).fill(K.Down), 'Y'.charCodeAt(0));
    await townLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    const s = g.s;
    s.sceptre = 0xff;
    const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
    const foe = s.actors[1];
    foe.tile = foe.anim = 0x40 + rat * 4;
    [foe.x, foe.y, foe.z] = [s.x + 1, s.y, 0];
    const fight = fighter(g);
    let wall: [number, number] | null = null;
    let from = -1;
    let then = -1; // the wall's square, at the next question after the bump
    p.next = () => {
      if (wall && then < 0) then = tileAt(g, wall[0], wall[1]);
      const me = g.combat[s.combatTurn];
      g.options.input = 'letters';
      if (!wall && me.flags & CF.Player && !s.crosshair && me.y > 0 && combatantAt(g, me.x, me.y - 1) < 0) {
        wall = [me.x, me.y - 1];
        setTileAt(g, me.x, me.y - 1, 0x70);
        from = p.log.length;
        g.options.input = 'controller';
        return K.Up;
      }
      return fight();
    };
    await attackCombat(g, 1);
    expect(wall).not.toBeNull();
    const after = p.log.slice(from, from + 200);
    expect(after).toMatch(/Wielding\s+the\s+Sceptre/);
    expect(after).not.toMatch(/Blocked!/);
    expect(then).toBe(T.Grass); // dissolved
  });

  it('has a locked door walked into jimmied by the most dexterous', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    await enterTown(g, true);
    const s = g.s;
    s.keys = 3;
    s.activeMember = 0xff;
    const m = s.members;
    for (let k = 0; k < s.partySize; k++) m[k].dex = 10 + k;
    const nimble = s.partySize - 1;
    setTileAt(g, s.x + 1, s.y, T.DoorB9);
    p.log = '';
    p.keys.push(K.Right);
    await townLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    expect(p.log).toMatch(/Jimmy/);
    expect(p.log.replace(/\s+/g, ' ')).toContain(`Player: ${m[nimble].name}`);
  });
});

describe('bump to act, where it had said Blocked', () => {
  it("opens a door in a fight's room, as Open would, rather than saying Blocked", () => {
    const { g } = newGame();
    g.s.mapId = 0xff;
    for (const door of [T.DoorB8, T.DoorBA]) expect(bumpCommand(g, 'combat', 0, door, 5, 0)).toBe(OPEN);
    // A plain wall is still Blocked.
    expect(bumpCommand(g, 'combat', 0, 0x4f, 5, 0)).toBe(0);
  });

  it("looks at a shop's two-square sign from either square", async () => {
    const { g } = newGame();
    journeyOnward(g);
    await enterTown(g, true);
    // An armoury's sign at (10, 4): its first square, and its second east of it pointing back west (0xe2).
    setTileAt(g, 10, 4, 0xf2);
    setTileAt(g, 11, 4, T.E2);
    expect(bumpCommand(g, 'town', 0, 0xf2, 10, 4)).toBe(LOOK);
    expect(bumpCommand(g, 'town', 0, T.E2, 11, 4)).toBe(LOOK);
  });

  it('in a fight, opens a door walked into', async () => {
    const { g, p } = newGame(2);
    journeyOnward(g);
    await enterTown(g, true);
    p.keys.push(...keys(K.Down, K.Down, K.Down, 'O', K.Down), ...Array<number>(14).fill(K.Down), 'Y'.charCodeAt(0));
    await townLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    const s = g.s;
    const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
    const foe = s.actors[1];
    foe.tile = foe.anim = 0x40 + rat * 4;
    [foe.x, foe.y, foe.z] = [s.x + 1, s.y, 0];
    const fight = fighter(g);
    let door: [number, number] | null = null;
    let from = -1;
    let then = -1; // the door's square, at the next question after the bump
    p.next = () => {
      if (door && then < 0) then = tileAt(g, door[0], door[1]);
      const me = g.combat[s.combatTurn];
      g.options.input = 'letters';
      if (!door && me.flags & CF.Player && !s.crosshair && me.y > 0 && combatantAt(g, me.x, me.y - 1) < 0) {
        door = [me.x, me.y - 1];
        setTileAt(g, me.x, me.y - 1, T.DoorB8);
        from = p.log.length;
        g.options.input = 'controller';
        return K.Up;
      }
      return fight();
    };
    await attackCombat(g, 1);
    expect(door).not.toBeNull();
    const after = p.log.slice(from, from + 200);
    expect(after).toMatch(/Opened!/);
    expect(after).not.toMatch(/Blocked!/);
    expect(then).toBe(0x44); // open
  });

  it("in a fight's room, searches a wall with a nick, and jimmies a locked door where there is a key", async () => {
    const { g } = newGame();
    g.s.mapId = 0xff;
    expect(bumpCommand(g, 'combat', 0, T.HiddenDoor, 5, 0)).toBe(SEARCH);
    g.s.keys = 2;
    for (const door of [T.DoorB9, T.DoorBB]) expect(bumpCommand(g, 'combat', 0, door, 5, 0)).toBe(JIMMY);
    g.s.keys = 0;
    for (const door of [T.DoorB9, T.DoorBB]) expect(bumpCommand(g, 'combat', 0, door, 5, 0)).toBe(OPEN); // "Locked!"
    // Search is offered beside the nick, as the menu's way to it.
    const { searchOffer } = await import('../src/game/targets.ts');
    for (const c of g.combat) c.flags = 0;
    g.combatMap.fill(0x44);
    Object.assign(g.s, { x: 5, y: 5 });
    expect(searchOffer(g)).toBe('hide');
    g.combatMap[4 * 32 + 5] = T.HiddenDoor;
    expect(searchOffer(g)).toBe('show');
  });
});
