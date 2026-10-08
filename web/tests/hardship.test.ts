import { describe, expect, it } from 'vitest';
import { damageMember, damageParty, endTurn } from '../src/game/time.ts';
import { poison } from '../src/game/combat.ts';
import { CF } from '../src/game/game.ts';
import { Status } from '../src/game/save.ts';
import { newGame } from './helpers.ts';

/**
 * Poison and starvation, by their settings: Deadly is the original's, Damage wounds without killing,
 * and Off (starvation only) leaves hunger out of the game. Nothing else that hurts the party changes.
 */
describe('poison and starvation', () => {
  const ready = (): ReturnType<typeof newGame> => {
    const made = newGame();
    const { g } = made;
    g.s.mapId = 0;
    g.s.level = 0;
    g.s.partySize = 3;
    for (let i = 0; i < g.s.partySize; i++) {
      const m = g.s.members[i];
      m.status = Status.Good;
      m.maxHp = 40;
      m.hp = 40;
    }
    g.recording = '';
    return made;
  };
  /** An hour passes with nothing to eat. */
  const hungryHour = async (g: ReturnType<typeof newGame>['g']): Promise<void> => {
    g.s.food = 0;
    g.s.lastHour = (g.s.hour + 1) & 0xff;
    await endTurn(g);
  };

  it('poison takes a member to one hit point and no further', async () => {
    const { g } = ready();
    g.options.rules = 'modern';
    g.s.members[0].status = Status.Poisoned;
    g.s.members[0].hp = 3;
    for (let turn = 0; turn < 10; turn++) await endTurn(g);
    expect(g.s.members[0].hp).toBe(1);
    expect(g.s.members[0].status).toBe(Status.Poisoned);
  });

  it('poison kills when it is deadly', async () => {
    const { g } = ready();
    g.options.rules = 'classic';
    g.s.members[0].status = Status.Poisoned;
    g.s.members[0].hp = 3;
    for (let turn = 0; turn < 10; turn++) await endTurn(g);
    expect(g.s.members[0].hp).toBe(0);
    expect(g.s.members[0].status).toBe(Status.Dead);
  });

  it('a second dose in a fight takes a poisoned member to one hit point and no further', async () => {
    // Poisoned again (a swamp square each turn, a poisonous bite) the original deals 0-20 instead: the setting
    // holds there too.
    const inFight = (g: ReturnType<typeof newGame>['g']): void => {
      g.s.mapId = 0xff;
      g.s.members[0].status = Status.Poisoned;
      g.s.members[0].hp = 5;
      g.combat[0].clear();
      g.combat[0].flags = CF.Player;
      g.combat[0].who = 0;
      g.combat[0].actor = 0;
      g.combat[0].x = 5;
      g.combat[0].y = 5;
    };
    const { g } = ready();
    inFight(g);
    g.options.rules = 'modern';
    for (let turn = 0; turn < 20; turn++) await poison(g, 0, -1);
    expect(g.s.members[0].hp).toBe(1);
    expect(g.s.members[0].status).toBe(Status.Poisoned);
    const { g: other } = ready();
    inFight(other);
    other.options.rules = 'classic';
    for (let turn = 0; turn < 20; turn++) await poison(other, 0, -1);
    expect(other.s.members[0].hp).toBe(0);
    expect(other.s.members[0].status).toBe(Status.Dead);
  });

  it('starvation takes the party to half and no further', async () => {
    const { g } = ready();
    g.options.rules = 'modern';
    for (let hour = 0; hour < 20; hour++) await hungryHour(g);
    for (let i = 0; i < g.s.partySize; i++) expect(g.s.members[i].hp).toBe(20);
    expect(g.recording).toMatch(/Starving/);
  });

  it('says nothing more once there is no one left to hurt', async () => {
    const { g } = ready();
    g.options.rules = 'modern';
    for (let i = 0; i < g.s.partySize; i++) g.s.members[i].hp = 20;
    g.recording = '';
    for (let hour = 0; hour < 5; hour++) await hungryHour(g);
    expect(g.recording).not.toMatch(/Starving/);
    for (let i = 0; i < g.s.partySize; i++) expect(g.s.members[i].hp).toBe(20);
  });

  it('starvation kills when it is deadly', async () => {
    const { g } = ready();
    g.options.rules = 'classic';
    for (let hour = 0; hour < 40; hour++) await hungryHour(g);
    expect(g.s.members.slice(0, 3).every((m) => m.status === Status.Dead)).toBe(true);
  });

  it('with the Story rules eats the food as ever, but going without hurts nobody and says nothing', async () => {
    const { g } = ready();
    g.options.rules = 'story';
    g.s.food = 500;
    for (let hour = 0; hour < 24; hour++) {
      g.s.hour = (g.s.hour + 1) % 24;
      g.s.lastHour = (g.s.hour + 1) & 0xff;
      await endTurn(g);
    }
    expect(g.s.food).toBeLessThan(500); // three meals for each of the party
    g.recording = '';
    for (let hour = 0; hour < 40; hour++) await hungryHour(g);
    expect(g.recording).not.toMatch(/Starving/);
    for (let i = 0; i < g.s.partySize; i++) expect(g.s.members[i].hp).toBe(40);
  });

  it('leaves every other hurt in the game alone', async () => {
    const { g } = ready();
    g.options.rules = 'modern';
    g.options.rules = 'modern';
    // Lava, a whirlpool, a bomb: the shared routine still kills.
    for (let i = 0; i < g.s.partySize; i++) g.s.members[i].hp = 1;
    for (let hit = 0; hit < 3; hit++) await damageParty(g);
    expect(g.s.members.slice(0, 3).every((m) => m.status === Status.Dead)).toBe(true);
    // And a blow that names no floor kills outright.
    const { g: other } = ready();
    other.options.rules = 'modern';
    other.s.members[0].hp = 2;
    await damageMember(other, 0, 99);
    expect(other.s.members[0].status).toBe(Status.Dead);
  });
});
