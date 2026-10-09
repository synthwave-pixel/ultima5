import { describe, expect, it } from 'vitest';
import { autoKey } from '../src/game/autocombat.ts';
import { CF } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/** Auto combat, the field won: it leaves - unless there is treasure lying there, which is the player's to open. */
describe('auto combat with a last spear', () => {
  it('closes with the foe rather than aiming a throw that will not be made', async () => {
    const { g } = newGame();
    journeyOnward(g);
    const s = g.s;
    g.options.autoCombat = 'all';
    g.options.rules = 'modern';
    g.commandPrompt = 'combat';
    for (const c of g.combat) c.flags = 0;
    const spear = g.data.table(0x1962, 0x38).findIndex((n) => /spear/i.test(n));
    s.members[0].equips.fill(0xff);
    s.members[0].equips[2] = spear;
    s.equipment[spear] = 0; // the one in hand is the last
    for (const ranged of [0x11, 0x13, 0x1a, 0x1c, 0x24]) s.equipment[ranged] = 0; // nothing to Switch Weapon to
    Object.assign(g.combat[0], { flags: CF.Player, who: 0, x: 5, y: 8 });
    Object.assign(g.combat[8], { flags: CF.Monster, who: 0x10, x: 5, y: 4, actor: 9 });
    s.actors[9].tile = s.actors[9].anim = 0xc4;
    Object.assign(s, { combatTurn: 0, battleWon: 0, crosshair: 0, combatFlags: 0 });
    // Four squares off, a spear would be thrown (key A); kept, the member walks north instead.
    expect(await autoKey(g)).toBe(K.Up);
  });
});

describe('auto combat closing with a foe', () => {
  it('goes round what is in the way: over the plank to the pirates, not into the rail', async () => {
    const { g } = newGame();
    journeyOnward(g);
    const s = g.s;
    g.options.autoCombat = 'all';
    g.commandPrompt = 'combat';
    for (const c of g.combat) c.flags = 0;
    // A wall two deep across the arena at rows 6 and 7, with one gap at x = 1; the member at (5, 8), the foe at (5, 3).
    g.combatMap.fill(0x04); // grass
    for (let x = 0; x < 11; x++) if (x !== 1) g.combatMap[6 * 32 + x] = g.combatMap[7 * 32 + x] = 0x4f; // wall
    s.members[0].equips.fill(0xff);
    s.equipment.fill(0); // nothing in the pack to Switch Weapon to: bare hands close with the foe
    Object.assign(g.combat[0], { flags: CF.Player, who: 0, x: 5, y: 8, actor: 0 });
    s.actors[0].tile = s.actors[0].anim = 0x1c;
    s.actors[0].x = 5;
    s.actors[0].y = 8;
    Object.assign(g.combat[8], { flags: CF.Monster, who: 0x10, x: 5, y: 3, actor: 9 });
    s.actors[9].tile = s.actors[9].anim = 0xc4;
    s.actors[9].x = 5;
    s.actors[9].y = 3;
    Object.assign(s, { mapId: 0xff, combatTurn: 0, battleWon: 0, crosshair: 0, combatFlags: 0 });
    // Straight north is the wall: the way is west along it to the gap.
    expect(await autoKey(g)).toBe(K.Left);
  });
});

describe('auto combat at range', () => {
  it('shoots only at a foe the crosshair can be brought to, measured as the game measures it', async () => {
    const { g } = newGame();
    journeyOnward(g);
    const s = g.s;
    g.options.autoCombat = 'all';
    g.commandPrompt = 'combat';
    for (const c of g.combat) c.flags = 0;
    g.combatMap.fill(0x04);
    s.members[0].equips.fill(0xff);
    s.members[0].equips[2] = 0x11; // a sling: range 4
    Object.assign(g.combat[0], { flags: CF.Player, who: 0, x: 7, y: 7, actor: 0 });
    s.actors[0].tile = s.actors[0].anim = 0x1c;
    Object.assign(s.actors[0], { x: 7, y: 7 });
    Object.assign(g.combat[8], { flags: CF.Monster, who: 0x10, x: 4, y: 3, actor: 9 });
    s.actors[9].tile = s.actors[9].anim = 0xc4;
    Object.assign(s.actors[9], { x: 4, y: 3 });
    Object.assign(s, { mapId: 0xff, combatTurn: 0, battleWon: 0, crosshair: 0, combatFlags: 0 });
    // Three across and four down is five away (the crosshair's reckoning), past a sling's four: close in, don't shoot.
    expect(g.data.bytes(0x1664, 0x38)[0x11]).toBe(4);
    const k = await autoKey(g);
    expect(k).not.toBe(0x41);
    expect([K.Up, K.Left]).toContain(k);
    // One nearer, it shoots.
    Object.assign(g.combat[0], { x: 6, y: 6 });
    Object.assign(s.actors[0], { x: 6, y: 6 });
    expect(await autoKey(g)).toBe(0x41);
  });
});

describe('auto combat hemmed in', () => {
  it('tries each way once, and then passes the turn rather than trying them for ever', async () => {
    const { g } = newGame();
    journeyOnward(g);
    const s = g.s;
    g.options.autoCombat = 'all';
    g.commandPrompt = 'combat';
    for (const c of g.combat) c.flags = 0;
    // The member walled in on all four sides; the foe beyond reach.
    g.combatMap.fill(0x04);
    for (const [x, y] of [
      [4, 4],
      [6, 4],
      [5, 3],
      [5, 5],
    ])
      g.combatMap[y * 32 + x] = 0x4f;
    s.members[0].equips.fill(0xff);
    Object.assign(g.combat[0], { flags: CF.Player, who: 0, x: 5, y: 4, actor: 0 });
    s.actors[0].tile = s.actors[0].anim = 0x1c;
    Object.assign(s.actors[0], { x: 5, y: 4 });
    Object.assign(g.combat[8], { flags: CF.Monster, who: 0x10, x: 5, y: 9, actor: 9 });
    s.actors[9].tile = s.actors[9].anim = 0xc4;
    Object.assign(s.actors[9], { x: 5, y: 9 });
    Object.assign(s, { mapId: 0xff, combatTurn: 0, battleWon: 0, crosshair: 0, combatFlags: 0 });
    const keys: number[] = [];
    for (let i = 0; i < 8; i++) keys.push(await autoKey(g));
    expect(keys).toContain(K.Space);
    expect(keys.indexOf(K.Space)).toBeLessThanOrEqual(6);
  });
});

describe('auto combat on a won field', () => {
  const won = (): ReturnType<typeof newGame> => {
    const made = newGame();
    const { g } = made;
    journeyOnward(g);
    g.options.autoCombat = 'all';
    g.commandPrompt = 'combat';
    for (const c of g.combat) c.flags = 0;
    g.combat[0].flags = CF.Player;
    Object.assign(g.s, { combatTurn: 0, battleWon: 1, crosshair: 0, combatFlags: 0 });
    for (let i = 1; i < 32; i++) g.s.actors[i].tile = 0;
    return made;
  };

  it('leaves an empty field', async () => {
    const { g } = won();
    expect(await autoKey(g)).toBe(K.Escape);
  });

  it('waits for the player where a chest lies, says so once, and stays on', async () => {
    const { g, p } = won();
    g.s.actors[3].tile = 1;
    expect(await autoKey(g)).toBe(0);
    expect(await autoKey(g)).toBe(0);
    expect(p.log.match(/treasure\s+lies\s+here/g)?.length).toBe(1);
    expect(g.options.autoCombat).toBe('all');
  });

  it('waits as well for what came out of a chest - a sack of gold, a potion - and not only for chests', async () => {
    const { g } = won();
    g.s.actors[3].tile = 2;
    expect(await autoKey(g)).toBe(0);
  });
});

describe('auto combat with a friend charmed', () => {
  /** The Avatar (0) and a member charmed by a Shadow Lord (1); the Shadow Lord (8) on the field, seen or not. */
  function field(invisible: boolean) {
    const { g } = newGame();
    journeyOnward(g);
    const s = g.s;
    g.options.autoCombat = 'all';
    g.options.rules = 'modern';
    g.commandPrompt = 'combat';
    for (const c of g.combat) c.flags = 0;
    Object.assign(g.combat[0], { flags: CF.Player, who: 0, x: 5, y: 8, actor: 0 });
    Object.assign(g.combat[1], { flags: CF.Player | CF.Charmed, who: 1, x: 5, y: 7, actor: 1 });
    g.charmedBy.set(1, 8);
    Object.assign(g.combat[8], { flags: CF.Monster | (invisible ? CF.Invisible : 0), who: 0x2f, x: 5, y: 2, actor: 9 });
    s.actors[9].tile = s.actors[9].anim = invisible ? 0 : 0xfc;
    Object.assign(s, { mapId: 0xff, combatTurn: 0, battleWon: 0, crosshair: 0, combatFlags: 0 });
    return g;
  }

  it('passes while the charm wears off when the charmer is gone', async () => {
    const g = field(false);
    g.combat[8].flags = 0;
    expect(await autoKey(g)).toBe(K.Space);
    expect(g.options.autoCombat).toBe('all');
  });

  it('hands the fight back where the charmer stands unseen, rather than passing while the charmed strike on', async () => {
    const g = field(true);
    expect(await autoKey(g)).toBe(0);
    expect(g.options.autoCombat).toBe('off');
  });
});
