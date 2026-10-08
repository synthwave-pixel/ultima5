import { describe, expect, it } from 'vitest';
import { picture } from '../src/data/images.ts';
import { refresh, dungeonLoop } from '../src/game/dungeon.ts';
import { arenaFree, trigger } from '../src/game/combat.ts';
import { canEnter } from '../src/game/actors.ts';
import { Status } from '../src/game/save.ts';
import { CF, Game } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { keys, newGame } from './helpers.ts';

/** The party at dungeon `d`'s top (as MAINOUT_0790 leaves it), with a torch lit. */
function inDungeon(g: Game, d: number): void {
  const s = g.s;
  journeyOnward(g);
  s.dungeon.set(g.data.files.get('DUNGEON.DAT').subarray(d * 0x200, d * 0x200 + 0x200));
  s.mapId = 0x21 + d;
  s.level = 0;
  s.x = s.y = 1;
  s.facing = 1;
  s.d6602 = 5;
  s.d58a7 = 0xff;
  const n = s.mapId - 0x20;
  s.dungeonLook = n === 1 || n === 4 || n === 5 ? 3 : n === 6 || n === 7 ? 2 : 1;
}

describe('dungeons', () => {
  it('draws every square of every level of every dungeon from real pictures', () => {
    const { g, p } = newGame();
    let drawn = 0;
    p.fx.image = (res, i, x, y) => {
      expect(picture(res, i), `picture ${i}`).not.toBeNull();
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      drawn++;
    };
    for (let d = 0; d < 8; d++) {
      inDungeon(g, d);
      for (let level = 0; level < 8; level++) {
        g.s.level = level;
        for (let i = 0; i < 64; i++) {
          g.s.x = i % 8;
          g.s.y = i >> 3;
          for (let f = 0; f < 4; f++) {
            g.s.facing = f;
            refresh(g);
          }
        }
      }
    }
    expect(drawn).toBeGreaterThan(10000);
  });

  it('walks, searches out the hidden door in Deceit and climbs down', async () => {
    const { g, p } = newGame();
    inDungeon(g, 0);
    g.s.activeMember = 0;
    p.keys.push(K.Left, 'S'.charCodeAt(0), K.Up, K.Up, K.Up, K.Up, K.Up, K.Up, 'K'.charCodeAt(0));
    await dungeonLoop(g, true).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    expect(p.log).toContain('A hidden door!');
    expect(p.log).toContain('Klimb-Down!');
    expect(g.s.level).toBe(1);
  });

  it('enters a room behind a heavy door: its map, party, monsters and triggers', async () => {
    const { g, p } = newGame(5);
    inDungeon(g, 0);
    const s = g.s;
    // A room door on some level, entered from an open square beside it.
    let found = false;
    for (let level = 0; level < 8 && !found; level++) {
      for (let i = 0; i < 64 && !found; i++) {
        if ((s.dungeon[level * 64 + i] & 0xf0) !== 0xf0) continue;
        const x = i % 8;
        const y = i >> 3;
        for (let f = 0; f < 4 && !found; f++) {
          const bx = (x - [0, 1, 0, -1][f] + 8) & 7;
          const by = (y - [-1, 0, 1, 0][f] + 8) & 7;
          if ((s.dungeon[level * 64 + by * 8 + bx] & 0xf0) < 0x60) {
            s.level = level;
            s.x = bx;
            s.y = by;
            s.facing = f;
            found = true;
          }
        }
      }
    }
    expect(found).toBe(true);
    s.activeMember = 0xff;
    p.keys.push(K.Up);
    await dungeonLoop(g, true).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    expect(p.log).toContain('Entering room...');
    expect(s.mapId).toBe(0xff);
    expect(s.combatFlags).toBe(0x82);
    const party = g.combat.filter((c) => c.flags & CF.Player);
    const monsters = g.combat.filter((c) => c.flags & CF.Monster);
    expect(party.length).toBe(s.partySize);
    expect(monsters.length).toBeGreaterThan(0);
    // Each trigger square changes the room's map when stepped on.
    const m = g.combatMap;
    for (let k = 0; k < 8; k++) {
      const tx = m[8 * 32 + 11 + k];
      const ty = m[8 * 32 + 19 + k];
      if (tx > 10 || ty > 10) continue;
      const before = m.slice(0, 11 * 32);
      expect(trigger(g, tx, ty)).toBe(true);
      expect(m.slice(0, 11 * 32)).not.toEqual(before);
      break;
    }
  });

  it("leaves no phantom on a dead member's square in a room", async () => {
    // The original sets the party's empty record (a member dead) down on the placement row too, and a monster
    // given that record's actor leaves the square blocked for everyone (a ladder, in Doom). The port does not.
    const { g, p } = newGame(5);
    inDungeon(g, 0);
    const s = g.s;
    s.partySize = 6;
    for (let i = 0; i < 6; i++) {
      s.members[i].status = Status.Good;
      s.members[i].hp = s.members[i].maxHp = 30;
    }
    s.members[3].status = Status.Dead;
    s.members[3].hp = 0;
    let found = false;
    for (let level = 0; level < 8 && !found; level++) {
      for (let i = 0; i < 64 && !found; i++) {
        if ((s.dungeon[level * 64 + i] & 0xf0) !== 0xf0) continue;
        const x = i % 8;
        const y = i >> 3;
        for (let f = 0; f < 4 && !found; f++) {
          const bx = (x - [0, 1, 0, -1][f] + 8) & 7;
          const by = (y - [-1, 0, 1, 0][f] + 8) & 7;
          if ((s.dungeon[level * 64 + by * 8 + bx] & 0xf0) < 0x60) {
            s.level = level;
            s.x = bx;
            s.y = by;
            s.facing = f;
            found = true;
          }
        }
      }
    }
    expect(found).toBe(true);
    s.activeMember = 0xff;
    p.keys.push(K.Up);
    await dungeonLoop(g, true).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    expect(s.mapId).toBe(0xff);
    const party = g.combat.filter((c) => c.flags & CF.Player);
    expect(party.length).toBe(5);
    // The sixth square of the placement row: no record sits on it but a living member's, so it is free once
    // they move off it - here, the record left empty is not there at all.
    const row = { 0: 3, 5: 3, 1: 2, 3: 1 }[s.facing] ?? 4;
    const sx = g.combatMap[row * 32 + 11 + 5];
    const sy = g.combatMap[row * 32 + 17 + 5];
    const empty = g.combat.filter((c, i) => i < 6 && c.flags === 0);
    expect(empty.length).toBe(1);
    expect([empty[0].x, empty[0].y]).toEqual([0, 0]);
    const there = g.combat.filter((c) => c.x === sx && c.y === sy);
    for (const c of there) expect(c.flags).not.toBe(0);
    // And a monster taking the freed actor, elsewhere, leaves the square walkable for a member.
    const monster = g.combat.find((c) => c.flags & CF.Monster);
    expect(monster).toBeDefined();
    for (const c of there) {
      c.x = 0;
      c.y = 0;
    }
    expect(arenaFree(g, 0x48, sx, sy)).toBe(g.combatMap[sy * 32 + sx] !== 0xff && canEnter(g, 0x48, g.combatMap[sy * 32 + sx]));
  });

  it('camps in a corridor and wakes rested (or ambushed)', async () => {
    const { g, p } = newGame(9);
    inDungeon(g, 0);
    const s = g.s;
    for (const m of s.members) m.hp = 1;
    p.keys.push(...keys('H', '9', 'N'));
    await dungeonLoop(g, true).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    expect(p.log).toContain('Zzzzzz');
    expect(p.log).toMatch(/Party rested!|Ambushed!|No effect/);
  });
});
