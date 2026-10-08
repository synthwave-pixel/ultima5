import { describe, expect, it } from 'vitest';
import { CF, type Game } from '../src/game/game.ts';
import { K, Pad } from '../src/game/io.ts';
import { commandMenu } from '../src/game/menu.ts';
import { selectSpell, shortcutCasts } from '../src/game/magic.ts';
import {
  getOffer,
  jimmyOffer,
  klimbOffer,
  openOffer,
  pushOffer,
  searchOffer,
  stealChestOffer,
  stealOffer,
  talkOffer,
  usableHere,
} from '../src/game/targets.ts';
import { T } from '../src/game/tiles.ts';
import { newGame } from './helpers.ts';

/** A fight's field of plain floor, the party's first member at its middle, their turn. */
function fight(): Game {
  const { g } = newGame();
  const s = g.s;
  s.mapId = 0xff;
  g.commandPrompt = 'combat';
  g.combatMap.fill(0x44);
  for (const a of s.actors) a.tile = 0;
  Object.assign(s, { x: 5, y: 5, combatTurn: 0 });
  Object.assign(g.combat[0], { who: 0, x: 5, y: 5, flags: CF.Player });
  return g;
}

/** An actor standing on (x, y). */
function place(g: Game, tile: number, x: number, y: number): void {
  Object.assign(g.s.actors[5], { tile, anim: tile, x, y, z: 0 });
}

/** The menu `open` shows, read as it is shown, then backed out of. */
async function shown(g: Game, open: () => Promise<unknown>): Promise<{ labels: string[]; enabled: boolean[] }> {
  let seen: { labels: string[]; enabled: boolean[] } | null = null;
  (g.p as unknown as { next: () => number }).next = () => {
    const m = g.menuShown;
    if (m && !seen) seen = { labels: [...m.labels], enabled: [...m.enabled] };
    return m ? Pad.B : K.Escape;
  };
  await open();
  return seen!;
}

/** The menus offer what can be done where the party stands (the ultima3 port's rule). */
describe('what the menus offer', () => {
  it('leaves Get out with nothing to get, and offers it beside a thing lying there', () => {
    const g = fight();
    expect(getOffer(g)).toBe('hide');
    place(g, 8, 6, 5); // a gem, east
    expect(getOffer(g)).toBe('show');
  });

  it('offers Jimmy beside a chest, greyed without a key', () => {
    const g = fight();
    expect(jimmyOffer(g)).toBe('hide');
    place(g, 1, 5, 4); // a chest, north
    g.s.keys = 0;
    expect(jimmyOffer(g)).toBe('grey');
    g.s.keys = 2;
    expect(jimmyOffer(g)).toBe('show');
  });

  it('offers Klimb below a hole only with the grapple greyed without it, and Search only at a chest, in the light', () => {
    const { g } = newGame();
    const s = g.s;
    Object.assign(s, { mapId: 0x21, level: 0, x: 3, y: 3 });
    s.dungeon.fill(0);
    s.dungeon[3 * 8 + 3] = 0x08; // a hole overhead
    s.grapple = 0;
    expect(klimbOffer(g)).toBe('grey');
    s.grapple = 1;
    expect(klimbOffer(g)).toBe('show');
    expect(searchOffer(g)).toBe('hide');
    s.dungeon[2 * 8 + 3] = 0x41; // a chest, north
    s.d58a6 = s.d58a7 = 0;
    expect(searchOffer(g)).toBe('grey');
    s.d58a7 = 100;
    expect(searchOffer(g)).toBe('show');
    expect(pushOffer(g)).toBe('hide');
  });

  it('never offers Talk out of a town', () => {
    const g = fight();
    place(g, 0x80, 6, 5);
    expect(talkOffer(g)).toBe('hide');
  });

  it('greys an item that would do nothing here', () => {
    const g = fight();
    expect(usableHere(g, 0x22)).toBe(false); // the sextant: outdoors only
    expect(usableHere(g, 5)).toBe(true); // summon daemon: in a fight
    expect(usableHere(g, 6)).toBe(false); // resurrection: never in a fight
    expect(usableHere(g, 0x23)).toBe(true); // the watch: always
  });

  it("lists in a fight only a fight's spells of circles the caster has reached, each with its count, greyed at none", async () => {
    const g = fight();
    g.options.input = 'controller';
    g.s.mixtures.fill(0);
    g.s.mixtures[4] = g.s.mixtures[1] = 1; // Heal, Magic missile
    Object.assign(g.s.members[0], { level: 2, mp: 5 });
    const { labels, enabled } = await shown(g, () => selectSpell(g, true, 0));
    expect(labels.some((l) => l.includes('Light'))).toBe(false); // not a fight's spell
    const at = (name: string): number => labels.findIndex((l) => l.includes(name));
    expect(enabled[at('Magic missile')]).toBe(true);
    expect(enabled[at('Heal')]).toBe(true);
    expect(labels[at('Magic missile')]).toBe('Magic missile x1');
    expect(labels[at('Repel undead')]).toBe('Repel undead x0'); // a second circle, reached at level 2
    expect(enabled[at('Repel undead')]).toBe(false); // none mixed: shown, greyed
    // A circle the caster has not reached is left out, mixed or not.
    g.s.mixtures[13] = 1; // Fire bolt, the third circle
    g.s.members[0].level = 1;
    const again = await shown(g, () => selectSpell(g, true, 0));
    expect(again.labels.some((l) => l.includes('Fire bolt'))).toBe(false);
    expect(again.labels.some((l) => l.includes('Repel undead'))).toBe(false);
  });

  it("offers a fight's one-press heal only to the member whose turn it is", () => {
    const g = fight();
    const s = g.s;
    s.partySize = Math.max(2, s.partySize);
    s.mixtures[4] = 5; // Heal
    Object.assign(s.members[0], { level: 5, mp: 30 });
    Object.assign(s.members[1], { level: 1, mp: 0, hp: 5 });
    Object.assign(g.combat[0], { who: 1 }); // the one who is hurt, and has no mana, takes the turn
    expect(shortcutCasts(g).some((r) => r.spell === 4)).toBe(false);
    g.combat[0].who = 0; // the Avatar's turn: the Avatar heals
    const heal = shortcutCasts(g).find((r) => r.spell === 4);
    expect(heal?.caster).toBe(0);
    expect(heal?.on).toBe(1);
  });

  it('shows the commands as one list, without Get where there is nothing to get', async () => {
    const g = fight();
    g.options.input = 'controller';
    const { labels } = await shown(g, () => commandMenu(g));
    expect(labels).not.toContain('');
    expect(labels).not.toContain('Get');
    expect(labels).not.toContain('Look');
    expect(labels.some((l) => l.startsWith('Attack'))).toBe(true);
  });

  /** A towne's square of plain floor round the party at (5, 5), no one about. */
  function towne(): Game {
    const { g } = newGame();
    const s = g.s;
    Object.assign(s, { mapId: 2, level: 0, x: 5, y: 5 });
    g.commandPrompt = 'town';
    g.map.fill(0x44);
    for (const a of s.actors) a.tile = 0;
    return g;
  }

  it('names Get of crops or a plate Steal, the same command, where taking them costs karma', async () => {
    const g = towne();
    g.options.input = 'controller';
    g.map[5 * 32 + 6] = T.Crops; // east
    expect([getOffer(g), stealOffer(g)]).toEqual(['hide', 'show']);
    // The menu's Steal is Get, and no Get beside it with nothing else to get.
    let labels: string[] = [];
    let moves = 0;
    (g.p as unknown as { next: () => number }).next = () => {
      const m = g.menuShown!;
      labels = [...m.labels];
      if (m.labels[m.at] === 'Steal') return Pad.A;
      return ++moves > m.labels.length ? Pad.B : K.Down;
    };
    expect(await commandMenu(g)).toBe('G'.charCodeAt(0));
    expect(labels).toContain('Steal');
    expect(labels).not.toContain('Get');
    // A plate within reach is another's too; a thing lying about is anyone's - Get, and Steal for the crops beside it.
    g.map[5 * 32 + 6] = 0x44;
    g.map[6 * 32 + 5] = T.Table9A; // south
    expect(stealOffer(g)).toBe('show');
    g.map[6 * 32 + 5] = 0x44;
    expect(stealOffer(g)).toBe('hide');
    g.map[5 * 32 + 6] = T.Crops;
    place(g, 5, 4, 5); // a gem, west
    expect([getOffer(g), stealOffer(g)]).toEqual(['show', 'show']);
  });

  it('names Open of a towne’s chest Steal from chest, beside Open for a door; a fight’s chest is opened', async () => {
    const g = towne();
    place(g, 1, 5, 4); // a chest, north
    expect([openOffer(g), stealChestOffer(g)]).toEqual(['hide', 'show']);
    g.map[5 * 32 + 4] = 0xb8; // a door, west
    expect([openOffer(g), stealChestOffer(g)]).toEqual(['show', 'show']);
    g.options.input = 'controller';
    const { labels } = await shown(g, () => commandMenu(g));
    expect(labels).toContain('Open');
    expect(labels).toContain('Steal from chest');
    const f = fight();
    place(f, 1, 5, 4);
    expect([openOffer(f), stealChestOffer(f)]).toEqual(['show', 'hide']);
  });
});
