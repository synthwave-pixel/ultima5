import { describe, expect, it } from 'vitest';
import { shortcutCast, shortcutCasts } from '../src/game/magic.ts';
import { Status } from '../src/game/save.ts';
import { newGame } from './helpers.ts';

/** The spell the moment calls for, offered at the head of the command menu when someone can cast it. */
describe('shortcut casts', () => {
  const HEAL = 4;
  const CURE = 3;
  const GREAT_HEAL = 27;

  /** A party in the world, with a caster who has the mana and the mixtures for everything. */
  const ready = (): ReturnType<typeof newGame> => {
    const made = newGame();
    const { g } = made;
    g.s.mapId = 0;
    g.s.level = 0;
    g.s.hour = 12;
    g.s.light = 0;
    for (let i = 0; i < g.s.partySize; i++) {
      const m = g.s.members[i];
      m.status = Status.Good;
      m.hp = m.maxHp;
      m.level = 8;
      m.mp = 40;
    }
    g.s.mixtures.fill(9);
    return made;
  };

  it('offers nothing while all is well', () => {
    const { g } = ready();
    expect(shortcutCast(g)).toBeNull();
  });

  it('offers a heal when someone is hurt', () => {
    const { g } = ready();
    g.s.members[1].hp = g.s.members[1].maxHp - 3;
    const s = shortcutCast(g);
    expect(s?.spell).toBe(HEAL);
    expect(s?.label).toBe('Cast (Heal)');
  });

  it('offers the greater heal when someone is badly hurt', () => {
    const { g } = ready();
    g.s.members[1].hp = 1;
    expect(shortcutCast(g)?.spell).toBe(GREAT_HEAL);
  });

  it('falls back to the lesser spell when the greater cannot be cast', () => {
    const { g } = ready();
    g.s.members[1].hp = 1;
    g.s.mixtures[GREAT_HEAL] = 0;
    expect(shortcutCast(g)?.spell).toBe(HEAL);
  });

  it('names whom the spell is for: the one who needs it most', () => {
    const { g } = ready();
    g.s.members[1].hp = Math.max(1, Math.floor(g.s.members[1].maxHp * 0.8));
    g.s.members[2].hp = 1;
    expect(shortcutCast(g)?.on).toBe(2);
  });

  it('offers a cure for poison', () => {
    const { g } = ready();
    g.s.members[1].status = Status.Poisoned;
    expect(shortcutCast(g)?.spell).toBe(CURE);
  });

  it('offers nothing with no mixture, no mana, or the circle unlearnt', () => {
    const { g } = ready();
    g.s.members[1].hp = g.s.members[1].maxHp - 3;
    g.s.mixtures[HEAL] = 0;
    g.s.mixtures[GREAT_HEAL] = 0;
    expect(shortcutCast(g)).toBeNull();
    g.s.mixtures.fill(9);
    for (let i = 0; i < g.s.partySize; i++) g.s.members[i].mp = 0;
    expect(shortcutCast(g)).toBeNull();
    for (let i = 0; i < g.s.partySize; i++) {
      g.s.members[i].mp = 40;
      g.s.members[i].level = 0;
    }
    expect(shortcutCast(g)).toBeNull();
  });

  it('offers a light underground when nothing is alight', () => {
    const { g } = ready();
    g.s.mapId = 0x21; // a dungeon
    g.s.light = 0;
    const s = shortcutCast(g);
    expect(s?.label).toMatch(/light/i);
    g.s.light = 20;
    expect(shortcutCast(g)).toBeNull();
  });

  it('offers the cure beside the heal when one member is hurt and another poisoned, each for its own', () => {
    const { g } = ready();
    g.s.members[1].hp = g.s.members[1].maxHp - 3;
    g.s.members[2].status = Status.Poisoned;
    const offered = shortcutCasts(g);
    expect(offered.map((r) => r.label)).toEqual(['Cast (Heal)', 'Cast (Cure poison)']);
    expect(offered[0].on).toBe(1);
    expect(offered[1].on).toBe(2);
  });

  it('offers no cure where no one can cast it, however many are poisoned', () => {
    const { g } = ready();
    g.s.members[2].status = Status.Poisoned;
    g.s.mixtures[CURE] = 0;
    expect(shortcutCasts(g)).toEqual([]);
  });

  it('puts each spell the moment calls for on a line of the command menu', async () => {
    const { g } = ready();
    const { contextual } = await import('../src/game/menu.ts');
    g.commandPrompt = 'outdoors';
    g.s.members[1].hp = g.s.members[1].maxHp - 3;
    g.s.members[2].status = Status.Poisoned;
    const labels = contextual(g).map((it) => it.label);
    expect(labels).toContain('Cast (Heal)');
    expect(labels).toContain('Cast (Cure poison)');
  });
});
