import { describe, expect, it } from 'vitest';
import { setActor } from '../src/game/actors.ts';
import { CF, thingKey } from '../src/game/game.ts';
import { K, Pad } from '../src/game/io.ts';
import { lootField, lootOffer } from '../src/game/loot.ts';
import { AN_SANCT } from '../src/game/magic.ts';
import { commandMenu } from '../src/game/menu.ts';
import { journeyOnward } from '../src/game/run.ts';
import { Status } from '../src/game/save.ts';
import { newGame } from './helpers.ts';

/** Loot and Leave (loot.ts): a won field's chests opened by whoever does it best, what lies about taken, then away. */
describe('Loot and Leave', () => {
  /** The log without its spacing: the message window's wrapping takes the space where it breaks a line. */
  const flat = (log: string): string => log.replace(/\s+/g, '');
  /** A fight won on an open field, the party of three standing, nothing lying there yet; dice that roll high. */
  const won = () => {
    const made = newGame();
    const { g } = made;
    journeyOnward(g);
    const s = g.s;
    g.commandPrompt = 'combat';
    for (const c of g.combat) c.flags = 0;
    g.combat[0].flags = CF.Player;
    Object.assign(s, { mapId: 0xff, combatTurn: 0, battleWon: 1, crosshair: 0, combatFlags: 0, keys: 0 });
    for (let i = 1; i < 32; i++) s.actors[i].tile = 0;
    s.mixtures.fill(0);
    for (let m = 0; m < s.partySize; m++) {
      const p = s.members[m];
      Object.assign(p, { status: Status.Good, int: 10, dex: 10, mp: 0 });
      p.hp = 50;
    }
    // High rolls: a search reads true, a key works, a chest gives what its level allows.
    g.random = (_lo, hi) => hi;
    return made;
  };
  /** A chest at (x, y) of `level`, trapped or not. */
  const chest = (g: ReturnType<typeof newGame>['g'], i: number, x: number, y: number, level: number, trapped: boolean): void =>
    setActor(g, i, 1, 1, x, y, 0, level | (trapped ? 0x80 : 0));

  it('is offered above Leave combat only where a won field that may be left holds something to take', async () => {
    const { g, p } = won();
    const s = g.s;
    expect(lootOffer(g)).toBe('hide'); // nothing lies there
    chest(g, 3, 2, 2, 5, false);
    expect(lootOffer(g)).toBe('show');
    let labels: string[] = [];
    p.next = () => {
      labels = [...g.menuShown!.labels];
      return Pad.B;
    };
    await commandMenu(g);
    expect(labels.slice(0, 2)).toEqual(['Loot and Leave', 'Leave combat']);
    expect(g.menuShown).toBeNull(); // (closed by B)
    s.combatFlags = 0x82; // a dungeon room, left by its exits
    expect(lootOffer(g)).toBe('hide');
    s.combatFlags = 0;
    s.battleWon = 0; // foes still standing
    expect(lootOffer(g)).toBe('hide');
    s.battleWon = 1;
    s.actors[3].tile = 0;
    setActor(g, 4, 2, 2, 3, 3, 0, 12); // gold alone
    expect(lootOffer(g)).toBe('show');
    for (let m = 0; m < s.partySize; m++) s.members[m].status = Status.Sleeping;
    expect(lootOffer(g)).toBe('grey');
    // No one to take it: Leave combat leads, Loot and Leave greyed under it.
    await commandMenu(g);
    expect(labels.slice(0, 2)).toEqual(['Leave combat', 'Loot and Leave']);
  });

  it('searches by the cleverest and opens by the hardiest, then takes all that lies there', async () => {
    const { g, p } = won();
    const s = g.s;
    s.members[1].int = 25;
    s.members[2].hp = 80;
    chest(g, 3, 2, 2, 6, false);
    setActor(g, 4, 2, 2, 7, 7, 0, 12); // twelve gold dropped beside
    const gold = s.gold;
    expect(await lootField(g)).toBe(true);
    expect(flat(p.log)).toContain(flat(`${s.members[1].name} searched 1 chest.`));
    expect(flat(p.log)).toContain(flat(`${s.members[2].name} opened 1 chest.`));
    expect(s.gold).toBeGreaterThanOrEqual(gold + 12);
    expect(s.actors.slice(1).some((a) => a.tile >= 1 && a.tile <= 0xf)).toBe(false);
  });

  it('unlocks a trapped chest with An Sanct where someone can cast it, spending its mixture and mana', async () => {
    const { g, p } = won();
    const s = g.s;
    s.mixtures[AN_SANCT] = 2;
    Object.assign(s.members[2], { mp: 10, level: 3 });
    chest(g, 3, 2, 2, 6, true);
    expect(await lootField(g)).toBe(true);
    expect(flat(p.log)).toContain(flat(`${s.members[2].name} cast An Sanct.`));
    expect(s.mixtures[AN_SANCT]).toBe(1);
    expect(s.members[2].mp).toBe(8);
    expect(flat(p.log)).not.toContain(flat('Trapped!'));
  });

  it('jimmies a trapped chest once, by the most dexterous; a key broken is not tried again', async () => {
    const { g, p } = won();
    const s = g.s;
    s.keys = 3;
    s.members[0].dex = 25;
    chest(g, 3, 2, 2, 6, true);
    g.bumped.set(thingKey(g, 2, 2), 'trap'); // searched already, and read true
    g.random = (lo, hi) => (lo === 1 && hi === 0x1e ? 1 : hi); // the key breaks
    await lootField(g);
    expect(flat(p.log)).toContain(flat(`${s.members[0].name} jimmied 1 chest: 1 key broke.`));
    expect(s.keys).toBe(2);
    expect(flat(p.log).match(/jimmied/g)?.length).toBe(1);
  });

  it('leaves a chest no one can open without risking a life, stays, and says so', async () => {
    const { g, p } = won();
    const s = g.s;
    for (let m = 0; m < s.partySize; m++) s.members[m].hp = 30; // acid could take every one of them
    chest(g, 3, 2, 2, 6, true);
    setActor(g, 4, 2, 2, 7, 7, 0, 12);
    const gold = s.gold;
    expect(await lootField(g)).toBe(false);
    expect(s.actors[3].tile).toBe(1);
    expect(s.gold).toBe(gold + 12); // what could be taken was
    expect(flat(p.log)).toContain(flat('A chest is left: no one could open it safely.'));
    // Chosen from the menu, the party stays on the field.
    p.next = () => (g.menuShown!.labels[g.menuShown!.at] === 'Loot and Leave' ? Pad.A : K.Down);
    expect(await commandMenu(g)).toBe(0);
  });

  it('opens a chest made safe for certain by anyone, however few their hit points', async () => {
    const { g } = won();
    const s = g.s;
    for (let m = 0; m < s.partySize; m++) s.members[m].hp = 10;
    chest(g, 3, 2, 2, 6, false);
    g.bumped.set(thingKey(g, 2, 2), 'disarmed');
    expect(await lootField(g)).toBe(true);
    expect(s.actors[3].tile).not.toBe(1);
  });

  it('gives a poisoned opener the chest first, poison costing them nothing', async () => {
    const { g, p } = won();
    const s = g.s;
    s.members[2].hp = 90;
    s.members[1].hp = 40;
    s.members[1].status = Status.Poisoned;
    chest(g, 3, 2, 2, 6, true); // read as trapped; nothing to make it safe
    await lootField(g);
    expect(flat(p.log)).toContain(flat(`${s.members[1].name} opened 1 chest.`));
    expect(flat(p.log)).toContain(flat(`${s.members[1].name} sprang a trap!`)); // poisoned already: nothing lost
  });

  it('says what several chests gave up once, together, not a run of lines for each', async () => {
    const { g, p } = won();
    const s = g.s;
    s.members[2].hp = 80;
    chest(g, 3, 2, 2, 6, false);
    chest(g, 5, 4, 2, 6, false);
    chest(g, 6, 6, 2, 6, false);
    setActor(g, 4, 2, 2, 7, 7, 0, 12); // twelve gold dropped beside
    const gold = s.gold;
    expect(await lootField(g)).toBe(true);
    const log = flat(p.log);
    expect(log).toContain(flat(`${s.members[2].name} opened 3 chests.`));
    expect(log.match(/Taken:/g)?.length).toBe(1);
    expect(log).not.toContain('Found:');
    // The gold taken, all of it, in one sum.
    const said = /Taken:(\d+)gold/.exec(log);
    expect(Number(said?.[1])).toBe(s.gold - gold);
  });

  it('makes each sound once, however many chests: one An Sanct, not one for every chest', async () => {
    const { g, p } = won();
    const s = g.s;
    g.soundOff = false;
    s.mixtures[AN_SANCT] = 3;
    Object.assign(s.members[2], { mp: 20, level: 3 });
    for (const [i, x] of [
      [3, 2],
      [5, 4],
      [6, 6],
    ])
      chest(g, i, x, 2, 6, true);
    const noises: string[] = [];
    const real = p.sound.noise.bind(p.sound);
    p.sound.noise = (...a) => (noises.push(a.join(',')), real(...a));
    expect(await lootField(g)).toBe(true);
    expect(s.mixtures[AN_SANCT]).toBe(0); // three cast
    expect(noises.length).toBe(1); // the sparkle, once
    noises.length = 0;
    await g.sound.noise(1, 2, 3); // and after, every sound again
    await g.sound.noise(1, 2, 3);
    expect(noises.length).toBe(2);
  });

  it('counts what was taken together', async () => {
    const { sayTaken } = await import('../src/game/loot.ts');
    expect(
      sayTaken(['12 gold!\n', 'A potion: Heal!\n', '30 gold!\n', 'Leather armour!\n', 'A potion: Heal!\n', '1 torch!\n', '2 torches!\n']),
    ).toBe('42 gold, 2 potions: Heal, Leather armour, 3 torches');
    expect(sayTaken(['Leather armour!', 'Leather armour!', '1 key!'])).toBe('Leather armour x2, 1 key');
  });

  it('leaves when everything was taken, as Leave combat does', async () => {
    const { g, p } = won();
    setActor(g, 4, 2, 2, 7, 7, 0, 12);
    p.next = () => (g.menuShown!.labels[g.menuShown!.at] === 'Loot and Leave' ? Pad.A : K.Down);
    expect(await commandMenu(g)).toBe(K.Escape);
  });
});
