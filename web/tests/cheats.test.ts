import { describe, expect, it } from 'vitest';
import { CHEATS, cheatsFor, Relocate } from '../src/game/cheats.ts';
import { CF } from '../src/game/game.ts';
import { Status } from '../src/game/save.ts';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/** The world's actors as the game holds them live (the chunk of the save the world's files are loaded into). */
const ACTORS = [0x5c5a - 0x55a6, 0x5c5a - 0x55a6 + 0x100] as const;

const game = () => {
  const { g, p } = newGame();
  journeyOnward(g);
  g.options.input = 'controller';
  return { g, p };
};

/** Pick menu line `want` (by its label) and A, then B out of whatever follows. */
const pick = (g: ReturnType<typeof game>['g'], p: ReturnType<typeof game>['p'], want: string): void => {
  let done = false;
  p.next = () => {
    const m = g.menuShown;
    if (!m || done) return Pad.B;
    const at = m.labels.indexOf(want);
    if (m.at !== at) return K.Down;
    done = true;
    return Pad.A;
  };
};

describe('the cheats', () => {
  it('Full restore wakes a member asleep in a fight and breaks a charm on one, as the potion and An Ex Xen do', async () => {
    const { g } = game();
    g.s.mapId = 0x80; // a fight
    Object.assign(g.combat[0], { who: 0, actor: 1, flags: CF.Player | CF.Charmed });
    Object.assign(g.combat[1], { who: 1, actor: 2, flags: CF.Player | CF.Asleep });
    Object.assign(g.combat[2], { who: 0x20, actor: 3, flags: CF.Monster | CF.Charmed }); // a foe charmed to the party: left so
    g.s.members[1].status = Status.Sleeping;
    await CHEATS.find((c) => c.label === 'Full restore')!.apply(g);
    expect(g.combat[0].flags & CF.Charmed).toBe(0);
    expect(g.combat[1].flags & CF.Asleep).toBe(0);
    expect(g.s.members[1].status).toBe(Status.Good);
    expect(g.combat[2].flags & CF.Charmed).toBe(CF.Charmed);
  });

  it('offer a player no way to jump about the world or skip the climb, outside development', () => {
    const { g } = game();
    const labels = cheatsFor(g, false).map((c) => c.label);
    expect(labels.filter((l) => l.startsWith('Go to'))).toEqual([]);
    expect(labels).not.toContain('Raise every level');
    g.s.mapId = 0x21; // in a dungeon, where Exit dungeon would be
    expect(cheatsFor(g, false).map((c) => c.label)).not.toContain('Exit dungeon');
    expect(cheatsFor(g, true).map((c) => c.label)).toEqual(expect.arrayContaining(['Raise every level', 'Exit dungeon']));
    expect(labels).toContain('Full restore');
  });

  it("offer a player Renew virtue: karma up to 75, where the party's death would put it, never down, no number said", async () => {
    const { g } = game();
    const renew = cheatsFor(g, false).find((c) => c.label === 'Renew virtue')!;
    expect(renew).toBeDefined();
    g.s.karma = 12;
    expect(await renew.apply(g)).toBe('Thy life of Virtue is renewed.');
    expect(g.s.karma).toBe(75);
    g.s.karma = 90;
    expect(await renew.apply(g)).toBe('Thou walkest the path of the Avatar already.');
    expect(g.s.karma).toBe(90);
  });

  it('take a developer beneath a dungeon in the Underworld, the worlds’ creatures changed over', async () => {
    const { g, p } = game();
    Object.assign(g.s, { mapId: 0, level: 0, x: 86, y: 110 });
    const brit = g.s.b.slice(...ACTORS);
    const under = g.ool.under.slice();
    const cheat = cheatsFor(g, true).find((c) => c.label === 'Go to Underworld...')!;
    pick(g, p, 'Shame');
    await expect(Promise.resolve(cheat.apply(g))).rejects.toBeInstanceOf(Relocate);
    const shame = g.data.locations[0x25];
    expect([g.s.mapId, g.s.level, g.s.x, g.s.y]).toEqual([0, 0xff, shame.x, shame.y]);
    expect([...g.s.b.slice(...ACTORS)]).toEqual([...under]);
    expect([...g.ool.brit]).toEqual([...brit]);
  });

  it('bring Britannia’s creatures back on leaving a dungeon from deep down, not the Underworld’s', async () => {
    const { g } = game();
    Object.assign(g.s, { mapId: 0, level: 0, x: 86, y: 110 });
    const brit = g.s.b.slice(...ACTORS);
    const { stashWorldActors } = await import('../src/game/outdoors.ts');
    stashWorldActors(g); // going in, as enterDungeon does
    Object.assign(g.s, { mapId: 0x21, level: 5, x: 1, y: 1 });
    g.s.b.fill(0, ...ACTORS); // the dungeon's own use of the space
    const exit = cheatsFor(g, true).find((c) => c.label === 'Exit dungeon')!;
    await expect(Promise.resolve(exit.apply(g))).rejects.toBeInstanceOf(Relocate);
    expect(g.s.level).toBe(0);
    expect([...g.s.b.slice(...ACTORS)]).toEqual([...brit]);
  });
});

describe('?dev in a release build', () => {
  it('turns the development cheats on: ?dev or ?dev=true, from the web address or the desktop app’s --dev', async () => {
    const { devAsked } = await import('../src/devMode.ts');
    expect(devAsked('?dev')).toBe(true);
    expect(devAsked('?dev=true')).toBe(true);
    expect(devAsked('?new&dev')).toBe(true); // the desktop app's --new --dev
    expect(devAsked('?dev=false')).toBe(false);
    expect(devAsked('?new')).toBe(false);
    expect(devAsked('')).toBe(false);
  });
});

describe('the Konami code', () => {
  const U = K.Up;
  const D = K.Down;
  const L = K.Left;
  const R = K.Right;
  const CODE = [U, U, D, D, L, R, L, R, Pad.B, Pad.A];

  it('is up, up, down, down, left, right, left, right, B, A: its B kept from the menu, its A ending it', async () => {
    const { Konami } = await import('../src/game/konami.ts');
    const k = new Konami();
    const got = CODE.map((key) => k.feed(key, key));
    expect(got.slice(0, 8)).toEqual(Array(8).fill(undefined));
    expect(got.slice(8)).toEqual(['take', 'done']);
  });

  it('forgives a false start (up, up, up still counts two), and lets any other B close the menu', async () => {
    const { Konami } = await import('../src/game/konami.ts');
    const k = new Konami();
    expect(k.feed(Pad.B, Pad.B)).toBeUndefined();
    const got = [U, ...CODE].map((key) => k.feed(key, key));
    expect(got.at(-1)).toBe('done');
    expect(new Konami().feed(Pad.A, Pad.A)).toBeUndefined();
  });

  it('takes the letters B and A from a keyboard, whether read as letters or as a controller', async () => {
    const { Konami } = await import('../src/game/konami.ts');
    const k = new Konami();
    for (const key of [U, U, D, D, L, R, L, R]) k.feed(key, key);
    expect(k.feed(Pad.B, 0x62)).toBe('take'); // b, a controller's B
    expect(k.feed(K.Left, 0x61)).toBe('done'); // a - WASD's left, read as a controller - is A here
  });

  it('in the Cheats menu turns the development cheats on, says so in the log, and shows them', async () => {
    const { devMode, setDevMode } = await import('../src/devMode.ts');
    const { pauseMenu } = await import('../src/game/menu.ts');
    setDevMode(false);
    try {
      const { g, p } = game();
      const code = [...CODE];
      const lists: string[][] = [];
      let into = false;
      p.next = () => {
        const m = g.menuShown!;
        if (m.title === 'Paused') {
          if (into) return Pad.B;
          const want = m.labels.indexOf('Cheats');
          if (m.at !== want) return K.Down;
          into = true;
          return Pad.A;
        }
        lists.push([...m.labels]);
        return code.shift() ?? Pad.B;
      };
      await pauseMenu(g);
      expect(devMode()).toBe(true);
      // Wrapped to the log's width: "Dev cheats / enabled - CAN / BREAK YOUR GAME!".
      expect(p.log.replace(/\s+/g, ' ')).toContain('Dev cheats enabled - CAN BREAK YOUR GAME!');
      expect(lists[0]).not.toContain('Go to...');
      // The code's B did not close the list, nor its A choose from it: the list came back, with the red ones in it.
      expect(lists.at(-1)).toContain('Go to...');
    } finally {
      setDevMode(true);
    }
  });
});
