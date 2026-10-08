import { describe, expect, it } from 'vitest';
import { journeyOnward } from '../src/game/run.ts';
import { shrine } from '../src/game/shrine.ts';
import { blackthornCapture, death, endgame } from '../src/game/story.ts';
import { Status } from '../src/game/save.ts';
import { K } from '../src/game/io.ts';
import { keys, newGame } from './helpers.ts';

const until = async (p: Promise<unknown>): Promise<void> => {
  await p.catch((e: Error) => {
    if (!e.message.includes('ran out')) throw e;
  });
};

describe('the shrines and the Codex', () => {
  it('ordains a quest, the Codex answers it, and the shrine rewards it', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const v = 0;
    s.mapId = 0;
    s.x = g.data.bytes(0x1f6e, 8)[v];
    s.y = g.data.bytes(0x1f76, 8)[v];
    const { enterWorld } = await import('../src/game/outdoors.ts');
    enterWorld(g);
    const virtue = g.data.table(0x4b3e, 8)[v].toUpperCase();
    const mantra = g.data.table(0x1f5e, 8)[v].toUpperCase();
    const meditate = keys(virtue, K.Enter, mantra, K.Enter, mantra, K.Enter, mantra, K.Enter);

    p.keys.push(...meditate, K.Space, K.Space);
    await shrine(g);
    expect(p.log).toMatch(/Quest is\s*ordained/);
    expect(s.questActive & 1).toBe(1);
    expect(s.mapId).toBe(0);
    expect(g.chromePlace, 'the gold frame left in the shrine').toBeNull();

    p.keys.push(K.Space, K.Space, K.Space, K.Space);
    s.x = 0; // not a shrine square: the Codex branch is by the tile, so check it directly
    const { T } = await import('../src/game/tiles.ts');
    const world = await import('../src/game/world.ts');
    world.setTileAt(g, s.x, s.y, T.Codex);
    await shrine(g);
    expect(s.questDone & 1).toBe(1);

    s.x = g.data.bytes(0x1f6e, 8)[v];
    const karma = s.karma;
    p.keys.push(...meditate);
    await shrine(g);
    expect(p.log).toMatch(/WELL\s*DONE/);
    expect(s.questActive & 1).toBe(0);
    expect(s.karma).toBe(Math.min(99, karma + 3));
  });

  it('turns away the unfocused', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    s.x = g.data.bytes(0x1f6e, 8)[2];
    s.y = g.data.bytes(0x1f76, 8)[2];
    p.keys.push(...keys('LOVE', K.Enter, 'OM', K.Enter, 'OM', K.Enter, 'OM', K.Enter));
    await shrine(g);
    expect(p.log).toContain('unfocused');
  });
});

describe('death', () => {
  it("raises the fallen party in Lord British's castle at dawn", async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    s.mapId = 0;
    for (let m = 0; m < s.partySize; m++) {
      s.members[m].status = Status.Dead;
      s.members[m].hp = 0;
    }
    p.keys.push(K.Enter, K.Space); // Lord British's aid (no game saved), then on past his words
    await death(g);
    expect(p.log).toContain('FORTIS FORTUNA');
    expect(s.mapId).toBe(0x11);
    expect(g.chromePlace, 'the copper of death left behind').toBeNull();
    expect(s.hour).toBe(6);
    for (let m = 0; m < s.partySize; m++) expect(s.members[m].status).toBe(Status.Good);
    expect(s.karma).toBeGreaterThanOrEqual(0x4b);
  });
});

describe('Blackthorn', () => {
  it('questions the Avatar, and a companion pays for silence', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    s.mapId = 0x12;
    const size = s.partySize;
    const companion = s.members[1].name;
    p.next = () => (p.log.length > 200000 ? undefined : K.Space);
    p.keys.push(
      K.Space,
      K.Space,
      ...keys('NEVER', K.Enter),
      K.Space,
      ...keys('NO', K.Enter),
      ...keys('NO', K.Enter),
      ...keys('NO', K.Enter),
    );
    await until(blackthornCapture(g));
    expect(p.log).toContain('Blackthorn says');
    expect(s.partySize).toBe(size - 1);
    expect(s.members[0xf].name).toBe(companion);
    expect(s.members[0xf].mapId).toBe(0x7f);
    expect([s.mapId, s.x, s.y]).toEqual([0x12, 10, 7]);
  });
});

describe('the end', () => {
  it('frees Lord British and, with the Sandalwood Box, proclaims the Avatar', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    s.sandalwoodBox = 1;
    s.mapId = 0xff;
    let n = 0;
    p.next = () => (++n > 60 ? undefined : n === 2 ? 'Y'.charCodeAt(0) : K.Space);
    await until(endgame(g));
    expect(p.log).toContain(s.members[0].name);
    expect(p.log).toContain('Be it known that on');
    expect(p.log).toContain('the Avatar');
  });
});
