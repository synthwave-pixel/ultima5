import { describe, expect, it } from 'vitest';
import { lookInDungeon, searchInDungeon } from '../src/game/dungeon.ts';
import { drawDungeonMap } from '../src/game/dungeonMap.ts';
import { revealCells } from '../src/game/fog.ts';
import { K, Pad } from '../src/game/io.ts';
import { commandMenu } from '../src/game/offers.ts';
import { loadOptions, saveOptions } from '../src/game/settings.ts';
import { journeyOnward } from '../src/game/run.ts';
import { klimbOffer, searchOffer, signAhead } from '../src/game/targets.ts';
import { A, T } from '../src/game/tiles.ts';
import { newGame } from './helpers.ts';
import { fly, Landed, pick, press } from './pilot.ts';

/** The dungeon's cells, by controller: what the menu offers for each, and how the map marks them (the port's). */
describe("a dungeon's cells", () => {
  /** Open floor, lit, the party at (3, 3) facing east, no creature about; `cells` set round it by (dx, dy). */
  const room = (cells: [number, number, number][] = []) => {
    const made = newGame();
    const { g } = made;
    journeyOnward(g);
    Object.assign(g.s, { mapId: 0x21, level: 0, x: 3, y: 3, facing: 1, d58a7: 0xff, d58a6: 0 });
    g.s.dungeon.fill(0x00);
    for (const [dx, dy, c] of cells) g.s.dungeon[(3 + dy) * 8 + 3 + dx] = c;
    g.s.actors[1].x = g.s.actors[1].y = 0xff;
    return made;
  };
  const labels = async (made: ReturnType<typeof room>): Promise<{ labels: string[]; enabled: boolean[] }> => {
    const { g, p } = made;
    let shown = { labels: [] as string[], enabled: [] as boolean[] };
    fly(g, p, [
      (game) => {
        shown = { labels: [...game.menuShown!.labels], enabled: [...game.menuShown!.enabled] };
        return Pad.B;
      },
    ]);
    g.commandPrompt = 'dungeon';
    await commandMenu(g).catch((e: unknown) => {
      if (!(e instanceof Landed)) throw e;
    });
    return shown;
  };

  it('offers Change View just below Look in a dungeon under Enhanced, Map last while the view is the large one; Retro neither', async () => {
    const { labels: shown } = await labels(room());
    expect(shown[shown.indexOf('Look') + 1]).toBe('Change View');
    expect(shown[shown.length - 1]).toBe('Map');
    const whole = room();
    whole.g.options.dungeonView = 'full'; // the map large already: no Map to look at it
    expect((await labels(whole)).labels).not.toContain('Map');
    const retro = room();
    retro.g.options.tileSet = 'original';
    const retroShown = (await labels(retro)).labels;
    expect(retroShown).not.toContain('Change View');
    expect(retroShown[retroShown.length - 1]).toBe('Map');
  });

  it("switches the dungeon's view with Change View; Map shows the whole level until B, then the view again", async () => {
    const choose = async (label: string): Promise<{ maps: number; during: string; after: string }> => {
      const { g, p } = room();
      g.options.dungeonView = 'mini';
      let maps = 0;
      let during = '';
      g.hooks.showMap = async () => void maps++;
      fly(g, p, [
        pick('Commands', label),
        (game) => {
          if (during) return undefined;
          during = game.options.dungeonView;
          return Pad.B;
        },
      ]);
      g.commandPrompt = 'dungeon';
      await commandMenu(g).catch((e: unknown) => {
        if (!(e instanceof Landed)) throw e;
      });
      return { maps, during, after: g.options.dungeonView };
    };
    expect(await choose('Change View')).toEqual({ maps: 0, during: '', after: 'full' }); // switched, kept, no key asked
    expect(await choose('Map')).toEqual({ maps: 0, during: 'full', after: 'mini' });
  });

  it("ends Map's look at the level on A or Enter too, as on B, Escape or Space", async () => {
    for (const end of [Pad.A, K.Enter, Pad.B, K.Escape, K.Space]) {
      const { g, p } = room();
      g.options.dungeonView = 'mini';
      let asked = 0;
      fly(g, p, [
        pick('Commands', 'Map'),
        () => {
          asked++;
          return asked === 1 ? end : Pad.B;
        },
      ]);
      g.commandPrompt = 'dungeon';
      await commandMenu(g).catch((e: unknown) => {
        if (!(e instanceof Landed)) throw e;
      });
      expect(asked, `key ${end}`).toBe(1);
      expect(g.options.dungeonView).toBe('mini');
    }
  });

  it("keeps the view's layout as chosen when the settings are saved during Map's look (from the Pause menu)", async () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    try {
      const { g, p } = room();
      g.options.dungeonView = 'mini';
      saveOptions(g.options);
      fly(g, p, [
        pick('Commands', 'Map'),
        (game) => {
          saveOptions(game.options); // a setting changed in the Pause menu while the level is looked at
          return Pad.B;
        },
      ]);
      g.commandPrompt = 'dungeon';
      await commandMenu(g).catch((e: unknown) => {
        if (!(e instanceof Landed)) throw e;
      });
      expect(loadOptions().dungeonView).toBe('mini');
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  it('offers Search where there is something it could find, here, ahead or to either hand, and not behind', () => {
    expect(searchOffer(room().g)).toBe('hide');
    expect(searchOffer(room([[1, 0, 0xd0]]).g)).toBe('show'); // a hidden door ahead
    expect(searchOffer(room([[0, -1, 0x61]]).g)).toBe('show'); // a pit trap to the left
    expect(searchOffer(room([[0, 0, 0x42]]).g)).toBe('show'); // a trapped chest here
    expect(searchOffer(room([[-1, 0, 0xd0]]).g)).toBe('hide'); // behind: Search cannot be pointed there
    const { g } = room([[-1, 0, 0xd0]]);
    g.options.dungeonView = 'full'; // with the whole map up it asks by the compass, behind and all
    expect(searchOffer(g)).toBe('show');
  });

  it('offers Klimb down a pit, but not a pit trap not yet found', () => {
    expect(klimbOffer(room([[0, 0, 0x60]]).g)).toBe('show');
    expect(klimbOffer(room([[0, 0, 0x61]]).g)).toBe('hide');
  });

  it('puts Ignite torch first in the dark, ahead of Climb up the ladder out', async () => {
    const made = room([[0, 0, 0x10]]); // a ladder up, here
    Object.assign(made.g.s, { d58a7: 0, d58a6: 0, torches: 3 }); // dark
    const { labels: l } = await labels(made);
    expect(l[0]).toBe('Ignite torch (x3)'); // with how many there are
    expect(l).toContain('Climb');
  });

  it('greys Climb for a hole above without the grapple', async () => {
    const made = room([[0, 0, 0x08]]);
    made.g.s.grapple = 0;
    expect(klimbOffer(made.g)).toBe('grey');
    const { labels: l, enabled } = await labels(made);
    expect(enabled[l.indexOf('Climb')]).toBe(false); // Klimb, by a controller's plain name
  });

  it('offers Read sign for a sign on the wall ahead, and prints it in the log', async () => {
    const made = room([[1, 0, 0xb1]]);
    expect(signAhead(made.g)).toBeGreaterThanOrEqual(0);
    const { labels: l } = await labels(made);
    expect(l).toContain('Read sign');
    const { readSignAhead } = await import('../src/game/dungeon.ts');
    readSignAhead(made.g);
    expect(made.p.log).toContain('You see:');
    made.g.s.facing = 2;
    expect(signAhead(made.g)).toBe(-1);
  });

  it('lets B back out of the way Look asks, and asks by the compass with the whole map up', async () => {
    const made = room([[0, 1, 0x51]]); // a fountain to the south
    const { g, p } = made;
    fly(g, p, [press(Pad.A, Pad.B)]); // the Avatar looks, then backs out
    await lookInDungeon(g).catch((e: unknown) => {
      if (!(e instanceof Landed)) throw e;
    });
    expect(p.log).toContain('Pass');
    g.options.dungeonView = 'full';
    fly(g, p, [press(Pad.A, K.Down, Pad.B)]); // South, by the compass, though the party faces east
    await lookInDungeon(g).catch((e: unknown) => {
      if (!(e instanceof Landed)) throw e;
    });
    expect(p.log).toContain('South');
    expect(p.log).toContain('Will you drink?');
  });

  it('searches Here with A by the compass', async () => {
    const made = room([[0, 0, 0x40]]);
    const { g, p } = made;
    g.options.dungeonView = 'full';
    fly(g, p, [press(Pad.A, Pad.A)]);
    await searchInDungeon(g).catch((e: unknown) => {
      if (!(e instanceof Landed)) throw e;
    });
    expect(p.log).toContain('Here');
  });

  it('searches a skeleton walked into, the way not asked, by the active member or the first who can', async () => {
    const made = room([[1, 0, 0xc0]]); // a skeleton ahead, east
    const { g, p } = made;
    g.s.dungeonLook = 0; // skeletons, not stalactites or caved in passages
    const { dungeonCommand } = await import('../src/game/dungeon.ts');
    const { getCommandKey } = await import('../src/game/input.ts');
    expect(await dungeonCommand(g, K.Up)).toBe(0); // no step, and the Search takes the turn
    expect(p.log).not.toContain('Blocked');
    expect(await getCommandKey(g, 'dungeon')).toBe(0x53); // Search, queued
    // It crumbles in a dissolve, as 1988's does: the view grown on page 1 itself first, in the Standard look.
    const calls: string[] = [];
    g.p.fx.transferScaled = (from: number, to: number) => void calls.push(`scale ${from}>${to}`);
    const dissolve = g.p.fx.reveal.bind(g.p.fx);
    g.p.fx.reveal = async (...a: [number, number, number, number, [number, number, number, number]?, number?]) => {
      calls.push(`reveal in ${a[5]} ms`);
      return dissolve(...a);
    };
    await searchInDungeon(g);
    // In a second: the intro's pace (512 pixels a tick) would take the view some three. The view dissolved in as drawn,
    // never grown (it is shown at the colour page's own four times, in a border, in the map's square).
    expect(calls).toEqual(['reveal in 1000 ms']);
    expect(p.log).toContain('Ahead');
    expect(p.log.replace(/\s+/g, ' ')).toContain('It crumbles away.');
  });

  it('searches a wall walked into, and finds a hidden door in one', async () => {
    const { dungeonCommand } = await import('../src/game/dungeon.ts');
    const walled = room([[1, 0, 0xb0]]);
    await dungeonCommand(walled.g, K.Up);
    expect(walled.p.log).not.toContain('Blocked');
    expect(walled.g.searchAhead).toBe(true);
    const hidden = room([[1, 0, 0xd0]]);
    await dungeonCommand(hidden.g, K.Up);
    await searchInDungeon(hidden.g);
    expect(hidden.p.log.replace(/\s+/g, ' ')).toContain('A hidden door!');
    expect(hidden.g.s.dungeon[3 * 8 + 4] & 0xf0).toBe(0xe0); // a door now
  });

  it('only says Blocked walking into rubble in the dark', async () => {
    const { dungeonCommand } = await import('../src/game/dungeon.ts');
    const dark = room([[1, 0, 0xc0]]);
    dark.g.s.d58a7 = 0;
    await dungeonCommand(dark.g, K.Up);
    expect(dark.p.log).toContain('Blocked');
  });

  it('marks what the party knows of each cell on the map, and hides what it does not', () => {
    const made = room([
      [1, 0, 0x40], // a closed chest
      [0, 1, 0x70], // an opened chest's treasure
      [-1, 0, 0x61], // a pit trap not found
      [0, -1, 0xc0], // rubble, in the way
    ]);
    const { g } = made;
    revealCells(g);
    const icons: number[] = [];
    g.draw.icon = (tile) => (icons.push(tile), true);
    g.options.dungeonView = 'full';
    drawDungeonMap(g);
    expect(icons).toContain(0x100 + A.Chest);
    expect(icons).toContain(0x100 + A.Gold);
    expect(icons).not.toContain(T.Trapdoor);
  });
});
