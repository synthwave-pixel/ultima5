// web/tests/actorTable.test.ts
// The actor table reached only through actors.ts's functions (#69).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTOR_SLOTS, actor, actorSlots, clearActors, copyActorTable, party, restoreActorTable } from '../src/game/actors.ts';
import { newGame } from './helpers.ts';

describe('the actor table', () => {
  it('gives each slot by number, slot 0 the party', () => {
    const { g } = newGame();
    actor(g, 3).tile = 0x2c;
    expect(actor(g, 3).tile).toBe(0x2c);
    expect(party(g)).toBe(actor(g, 0));
    expect(ACTOR_SLOTS).toBe(32);
  });

  it('lists the slots in order, empty ones included', () => {
    const { g } = newGame();
    const all = [...actorSlots(g)];
    expect(all.length).toBe(32);
    expect(all[0][0]).toBe(0);
    expect(all[31][0]).toBe(31);
    expect(all[5][1]).toBe(actor(g, 5));
    const some = [...actorSlots(g, 1, 0x18)];
    expect(some.length).toBe(23);
    expect(some[0][0]).toBe(1);
  });

  it('clears every slot but the party', () => {
    const { g } = newGame();
    party(g).tile = 0x1c;
    for (let i = 1; i < 32; i++) actor(g, i).tile = 0x30 + (i & 0xf);
    clearActors(g);
    expect(party(g).tile).toBe(0x1c);
    for (let i = 1; i < 32; i++) expect(actor(g, i).tile).toBe(0);
  });

  it('copies the table and puts it back', () => {
    const { g } = newGame();
    actor(g, 7).tile = 0x2c;
    actor(g, 7).x = 99;
    const copy = copyActorTable(g);
    expect(copy.length).toBe(256);
    actor(g, 7).tile = 0;
    actor(g, 7).x = 3;
    expect(copy[7 * 8]).toBe(0x2c);
    restoreActorTable(g, copy);
    expect(actor(g, 7).tile).toBe(0x2c);
    expect(actor(g, 7).x).toBe(99);
  });
});

describe('the table is private to actors.ts', () => {
  it('no code reaches the table but actors.ts', () => {
    const root = new URL('..', import.meta.url).pathname;
    const allowed = new Set(['src/game/actors.ts', 'src/game/save.ts', 'tests/actorTable.test.ts']);
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|js|mjs)$/.test(f)) files.push(p);
      }
    };
    for (const d of ['src', 'tests', 'tools']) walk(join(root, d));
    const bad = files
      .map((p) => relative(root, p))
      .filter((p) => !allowed.has(p) && /\.actors\b|savedActor|0x5c5a/.test(readFileSync(join(root, p), 'utf8')));
    expect(bad).toEqual([]);
  });
});
