import { describe, expect, it } from 'vitest';
import { setActor } from '../src/game/actors.ts';
import { K, Pad } from '../src/game/io.ts';
import { lookCommand, nightSky, viewGem } from '../src/game/look.ts';
import { enterWorld, falls, hullDamage, monstersTurn, outdoorsLoop } from '../src/game/outdoors.ts';
import { Status } from '../src/game/save.ts';
import { T } from '../src/game/tiles.ts';
import { enterTown } from '../src/game/town.ts';
import { setTileAt } from '../src/game/world.ts';
import { Colour } from '../src/ui/colours.ts';
import { newGame } from './helpers.ts';
import { fly, pick, press } from './pilot.ts';

type Made = ReturnType<typeof newGame>;

/** The party at (20, 20) in the open sea west of Britannia, at noon, with no wind and no creature about. */
const atSea = (partyTile = 0x20, x = 20, y = 20): Made => {
  const made = newGame();
  const { g } = made;
  Object.assign(g.s, { mapId: 0, level: 0, x, y, partyTile, hour: 12, minute: 0 });
  enterWorld(g);
  for (let i = 1; i < 0x20; i++) g.s.actors[i].tile = 0;
  g.s.wind = 0;
  Object.assign(g.s.actors[0], { b5: 200, b7: 0 });
  return made;
};

/** What the vitals panel redraws among the words, taken out of a log. */
const said = (log: string): string => log.replace(/[A-Za-z]+ +\d+\/\d+/g, '');

/** The party's turn passes at the command prompt, `keys` pressed in the world's loop until none are left. */
const walk = async ({ g, p }: Made, ...keys: number[]): Promise<void> => {
  p.keys.push(...keys);
  await outdoorsLoop(g).catch((e: Error) => {
    if (!e.message.includes('ran out')) throw e;
  });
};

/** A pirate ship (actor 5) at (x, y), facing north. */
const pirate = ({ g }: Made, x: number, y: number): void => setActor(g, 5, 0x2c, 0x2c, x, y, 0, 100);

/** A pirate ship's cannon, a ship's hull, and what the sea does to a party. */
describe('a ship at sea', () => {
  it('is fired on by a pirate ship in line with it, within three squares, from any side', async () => {
    for (const [x, y] of [
      [20, 17],
      [20, 23],
      [17, 20],
      [23, 20],
    ]) {
      const made = atSea();
      pirate(made, x, y);
      await monstersTurn(made.g);
      expect(made.p.log, `from ${x},${y}`).toContain('BOOOM');
      expect(made.g.s.actors[0].b5, `from ${x},${y}`).toBeLessThan(200);
      expect(made.g.s.actors[0].b5).toBeGreaterThanOrEqual(170); // 1-30 a shot
    }
  });

  it('is left alone by a pirate ship too far off, or not in line', async () => {
    for (const [x, y] of [
      [20, 16],
      [16, 20],
      [24, 20],
      [22, 22],
      [21, 19],
    ]) {
      const made = atSea();
      pirate(made, x, y);
      await monstersTurn(made.g);
      expect(made.p.log, `from ${x},${y}`).not.toContain('BOOOM');
      expect(made.g.s.actors[0].b5, `from ${x},${y}`).toBe(200);
    }
  });

  it('turns the pirate broadside on, to the party: east and west where it is above or below, north and south beside', async () => {
    for (const [x, y, beam] of [
      [20, 17, [0x2d, 0x2f]],
      [20, 23, [0x2d, 0x2f]],
      [17, 20, [0x2c, 0x2e]],
      [23, 20, [0x2c, 0x2e]],
    ] as const) {
      const made = atSea();
      pirate(made, x, y);
      made.g.s.actors[5].anim = beam[0] === 0x2d ? 0x2c : 0x2d; // bows to the party, as it came
      await monstersTurn(made.g);
      expect(beam, `from ${x},${y}`).toContain(made.g.s.actors[5].anim);
      expect(made.g.s.actors[5].tile).toBe(0x2c);
    }
  });

  it('is not hit when land stands between the guns and the ship', async () => {
    const made = atSea();
    pirate(made, 20, 17);
    setTileAt(made.g, 20, 18, 0x3d); // a mountain
    setTileAt(made.g, 20, 19, 0x3d);
    await monstersTurn(made.g);
    expect(made.p.log).toContain('BOOOM');
    expect(made.g.s.actors[0].b5).toBe(200);
  });

  it('is breathed on by a dragon or a serpent within three squares, one time in eight', async () => {
    for (const tile of [0xdc, 0x88]) {
      for (const roll of [0, 1]) {
        const made = atSea();
        const real = made.g.random.bind(made.g);
        made.g.random = (lo, hi) => (lo === 0 && hi === 7 ? roll : real(lo, hi));
        setActor(made.g, 5, tile, tile, 20, 18, 0, 0);
        await monstersTurn(made.g);
        expect(made.g.s.actors[0].b5 < 200, `tile ${tile} roll ${roll}`).toBe(roll === 0);
      }
    }
  });

  it('is damaged when run aground, and the sheets come in; the shallows break it up', async () => {
    for (const [tile, word] of [
      [0x05, 'COLLISION!'],
      [T.Water3, 'BREAKING UP!'],
    ] as const) {
      const made = atSea(0x21); // heading east
      setTileAt(made.g, 21, 20, tile);
      made.g.s.sailing = K.Right;
      await walk(made, K.Right);
      expect(made.p.log).toContain(word);
      expect(made.g.s.x).toBe(20);
      expect(made.g.s.actors[0].b5).toBeLessThan(200);
      expect(made.g.s.sailing).toBe(0);
    }
  });

  it('is sunk where the hull gives out: to the skiffs aboard, a carpet, or the sea', async () => {
    // A hull of one cannot take any shot.
    const skiff = atSea(0x21);
    Object.assign(skiff.g.s.actors[0], { b5: 1, b7: 2 });
    await hullDamage(skiff.g);
    expect(skiff.p.log).toContain('Ship sunk!');
    expect(skiff.p.log).toContain('Abandon ship!');
    expect(skiff.g.s.partyTile).toBe(0x29); // a skiff, heading as the ship did
    expect(skiff.g.s.members.every((m) => m.status !== Status.Dead)).toBe(true);

    const carpet = atSea(0x21);
    carpet.g.s.actors[0].b5 = 1;
    carpet.g.s.carpets = 2;
    await hullDamage(carpet.g);
    expect(carpet.g.s.carpets).toBe(1);
    expect([0x14, 0x15]).toContain(carpet.g.s.partyTile);

    const drowned = atSea(0x21);
    drowned.g.s.actors[0].b5 = 1;
    drowned.g.s.carpets = 0;
    await hullDamage(drowned.g);
    expect(drowned.p.log).toContain('DROWNING!!!');
    expect(drowned.g.s.partyTile).toBe(0);
    expect(drowned.g.s.members.slice(0, drowned.g.s.partySize).every((m) => m.status === Status.Dead)).toBe(true);
  });

  it('is a blow to the party, not the hull, when it is on foot', async () => {
    const made = atSea(0x1c);
    const before = made.g.s.members.map((m) => m.hp);
    await hullDamage(made.g);
    expect(made.g.s.actors[0].b5).toBe(200);
    for (let i = 0; i < made.g.s.partySize; i++) expect(made.g.s.members[i].hp, `member ${i}`).toBeLessThan(before[i]);
  });

  it('is swallowed by a whirlpool alongside, and comes up in the Underworld', async () => {
    const made = atSea();
    setActor(made.g, 5, 0xec, 0xec, 21, 20, 0, 0);
    await monstersTurn(made.g);
    expect(made.p.log).toContain('WHIRLPOOL!');
    expect(made.g.s.level).toBe(0xff);
    expect([made.g.s.x, made.g.s.y]).toEqual([0x22, 0x12]);
  });

  it('is only a blow to a party on foot beside a whirlpool, which carries it nowhere', async () => {
    const made = atSea(0x1c);
    setActor(made.g, 5, 0xec, 0xec, 21, 20, 0, 0);
    const before = made.g.s.members.map((m) => m.hp);
    await monstersTurn(made.g);
    expect(made.g.s.level).toBe(0);
    expect([made.g.s.x, made.g.s.y]).toEqual([20, 20]);
    expect(made.g.s.members[0].hp).toBeLessThan(before[0]);
  });
});

/** The waterfall that bruises a party, and drops it into the Underworld at one place only. */
describe('over the falls', () => {
  const over = async (y: number) => {
    const made = atSea(0x1c, 0x36, y);
    const { g } = made;
    g.s.partySize = 3;
    Object.assign(g.s.members[0], { dex: 0, hp: 50, status: Status.Good }); // always hurt
    Object.assign(g.s.members[1], { dex: 99, hp: 50, status: Status.Good }); // never
    Object.assign(g.s.members[2], { dex: 0, hp: 50, status: Status.Dead });
    await falls(g);
    return made;
  };

  it('takes the party two squares down, bruising those whose dexterity fails, and not the dead', async () => {
    const { g, p } = await over(0x80);
    expect(p.log).toContain('F-A-L-L-S!!!');
    expect([g.s.x, g.s.y]).toEqual([0x36, 0x82]);
    expect(g.s.members.map((m) => m.hp).slice(0, 3)).toEqual([49, 50, 50]);
    expect(g.s.level).toBe(0);
    expect(p.log).not.toContain('Falling into underworld');
  });

  it('drops into the Underworld at the one place there is a way down', async () => {
    const { g, p } = await over(0x88);
    expect([g.s.x, g.s.y]).toEqual([0x36, 0x8a]);
    expect(p.log).toContain('Falling into underworld!!');
    expect(g.s.level).toBe(0xff);
  });
});

/** Trolls under a bridge: one time in eight, for a party on foot. */
describe('trolls under the bridge', () => {
  /** On foot at (20, 20) with a bridge to the east; the dice give `trolls` (0 for they come) and the dexterity roll. */
  const bridge = (partyTile: number, trolls: number, roll: number, dex: number): Made => {
    const made = atSea(partyTile);
    const { g } = made;
    setTileAt(g, 21, 20, 0x6a);
    const real = g.random.bind(g);
    g.random = (lo, hi) => (lo === 0 && hi === 7 ? trolls : lo === 1 && hi === 0x1e ? roll : real(lo, hi));
    g.s.members.forEach((m) => (m.dex = dex));
    g.s.members[0].str = 20;
    g.s.gold = 100;
    return made;
  };

  it('ask a toll of 99 less three times the strength, and take it from one who pays', async () => {
    const made = bridge(0x1c, 0, 30, 1);
    await walk(made, K.Right, 0x59);
    expect(made.g.s.x).toBe(21);
    expect(said(made.p.log)).toContain('Thou spieth trolls under the bridge!');
    expect(made.p.log).toContain('The trolls demand a 39 gp toll!');
    expect(made.g.s.gold).toBe(61);
  });

  it('are evaded by a party quick enough, with nothing to pay', async () => {
    const made = bridge(0x1c, 0, 30, 30);
    await walk(made, K.Right);
    expect(made.p.log).toContain('sneaks across');
    expect(made.p.log).toContain('Trolls evaded!');
    expect(made.p.log).not.toContain('toll');
    expect(made.g.s.gold).toBe(100);
  });

  it('do not trouble a party on horseback, or come on the other seven turns in eight', async () => {
    const horse = bridge(0x12, 0, 30, 1);
    await walk(horse, K.Right);
    expect(horse.g.s.x).toBe(21);
    expect(horse.p.log).not.toContain('trolls');

    const lucky = bridge(0x1c, 3, 30, 1);
    await walk(lucky, K.Right);
    expect(lucky.g.s.x).toBe(21);
    expect(lucky.p.log).not.toContain('trolls');
    expect(lucky.g.s.gold).toBe(100);
  });
});

/** Look at the things that are not for fighting, in the town and out of it. */
describe('Look', () => {
  const inTown = async (mapId: number, tile: number): Promise<Made> => {
    const made = newGame();
    const { g } = made;
    Object.assign(g.s, { mapId, level: 0, x: 15, y: 20 });
    await enterTown(g, true);
    g.inPlay = true;
    Object.assign(g.s, { x: 15, y: 20 });
    setTileAt(g, 15, 19, tile);
    return made;
  };
  const keysOf = (...ks: (number | string)[]): number[] =>
    ks.flatMap((k) => (typeof k === 'string' ? [...k].map((c) => c.charCodeAt(0)) : [k]));
  const horsesBeside = ({ g }: Made): number => g.s.actors.filter((a, i) => i > 0 && a.tile === 0x10 && a.x === 16 && a.y === 20).length;

  describe('a well', () => {
    it('grants a horse at the wells in Paws and Empath Abbey, for the coin it is wished on', async () => {
      for (const town of [0x16, 0x1f]) {
        const made = await inTown(town, T.Well);
        made.g.s.gold = 5;
        made.p.keys.push(...keysOf(K.Up, 'Y', 'HORSE', K.Enter));
        await lookCommand(made.g);
        expect(made.p.log, `town ${town}`).toContain('Poof!');
        expect(made.g.s.gold).toBe(4);
        expect(horsesBeside(made), `town ${town}`).toBe(1);
      }
    });

    it('has no effect on a wish made anywhere else, and keeps the coin', async () => {
      const made = await inTown(1, T.Well);
      made.g.s.gold = 5;
      made.p.keys.push(...keysOf(K.Up, 'Y', 'HORSE', K.Enter));
      await lookCommand(made.g);
      expect(made.p.log).toContain('No effect...');
      expect(made.p.log).not.toContain('Poof!');
      expect(made.g.s.gold).toBe(4);
      expect(horsesBeside(made)).toBe(0);
    });

    it('answers any of its six wishes with the horse, a Porsche included, and a wish for nothing it knows with nothing', async () => {
      const wished = await inTown(0x16, T.Well);
      wished.p.keys.push(...keysOf(K.Up, 'Y', 'PORSCHE', K.Enter));
      await lookCommand(wished.g);
      expect(wished.p.log).toContain('Poof!');
      expect(horsesBeside(wished)).toBe(1);

      const odd = await inTown(0x16, T.Well);
      odd.p.keys.push(...keysOf(K.Up, 'Y', 'BANANA', K.Enter));
      await lookCommand(odd.g);
      expect(odd.p.log).toContain('No effect...');
      expect(horsesBeside(odd)).toBe(0);

      const none = await inTown(0x16, T.Well);
      none.g.s.gold = 5;
      none.p.keys.push(...keysOf(K.Up, 'Y', K.Enter));
      await lookCommand(none.g);
      expect(none.p.log).toContain('Nothing');
      expect(horsesBeside(none)).toBe(0);
    });

    it('takes no coin when it is declined, or when the party has none', async () => {
      const declined = await inTown(0x16, T.Well);
      declined.g.s.gold = 5;
      declined.p.keys.push(...keysOf(K.Up, 'N'));
      await lookCommand(declined.g);
      expect(declined.g.s.gold).toBe(5);
      expect(declined.p.log).not.toContain('Thy wish?');

      const poor = await inTown(0x16, T.Well);
      poor.g.s.gold = 0;
      poor.p.keys.push(...keysOf(K.Up, 'Y'));
      await lookCommand(poor.g);
      expect(poor.g.s.gold).toBe(0);
      expect(poor.p.log).not.toContain('Thy wish?');
    });

    it('offers a controller only a wish that has been heard, and only at a well that grants it', async () => {
      const offered = async (town: number, learn: boolean): Promise<string[]> => {
        const made = await inTown(town, T.Well);
        if (learn) made.g.words.add('HORSE');
        made.g.s.gold = 5;
        let labels: string[] = [];
        fly(made.g, made.p, [
          press(K.Up),
          press(Pad.A),
          (g) => {
            labels = [...(g.menuShown?.labels ?? [])];
            return Pad.B;
          },
        ]);
        await lookCommand(made.g).catch(() => undefined);
        return labels;
      };
      expect(await offered(0x16, true)).toEqual(['Horse', 'Say nothing']);
      expect(await offered(0x16, false)).toEqual(['Say nothing']);
      expect(await offered(1, true)).toEqual(['Say nothing']);
    });

    it('grants the horse chosen from that list', async () => {
      const made = await inTown(0x16, T.Well);
      made.g.words.add('HORSE');
      made.g.s.gold = 5;
      fly(made.g, made.p, [press(K.Up), press(Pad.A), pick('Wish', 'Horse')]);
      await lookCommand(made.g);
      expect(made.p.log).toContain('Poof!');
      expect(horsesBeside(made)).toBe(1);
    });
  });

  describe('a fountain', () => {
    it('is drunk from by the member chosen: Refreshing, or Incapacitated for one asleep or dead', async () => {
      const made = await inTown(1, T.Fountain);
      made.g.s.members[1].status = Status.Sleeping;
      made.g.s.members[2].status = Status.Dead;
      made.p.keys.push(...keysOf(K.Up, '1', K.Enter));
      await lookCommand(made.g);
      expect(made.p.log).toContain('a gurgling fountain!');
      expect(made.p.log).toContain('Refreshing...');
      for (const who of ['2', '3']) {
        const again = await inTown(1, T.Fountain);
        again.g.s.members[1].status = Status.Sleeping;
        again.g.s.members[2].status = Status.Dead;
        again.p.keys.push(...keysOf(K.Up, who, K.Enter));
        await lookCommand(again.g);
        expect(again.p.log, `member ${who}`).toContain('Incapacitated!');
        expect(again.p.log).not.toContain('Refreshing...');
      }
    });

    it('says None! when nobody is chosen to drink', async () => {
      const made = await inTown(1, T.Fountain);
      made.p.keys.push(...keysOf(K.Up, K.Escape));
      await lookCommand(made.g);
      expect(made.p.log).toContain('None!');
      expect(made.p.log).not.toContain('Refreshing');
    });
  });

  describe('a grandfather clock', () => {
    it('shows the time in twelve hours, noon as 12 PM and midnight as 12 AM', async () => {
      for (const [hour, minute, shown] of [
        [13, 5, '1:05 PM.'],
        [12, 30, '12:30 PM.'],
        [0, 0, '12:00 AM.'],
        [9, 45, '9:45 AM.'],
      ] as const) {
        const made = await inTown(1, T.Clock);
        Object.assign(made.g.s, { hour, minute });
        made.p.keys.push(K.Up);
        await lookCommand(made.g);
        expect(made.p.log, `${hour}:${minute}`).toContain(`showing: ${shown}`);
      }
    });
  });

  describe('through the telescope', () => {
    const through = async (hour: number): Promise<Made> => {
      const made = await inTown(1, T.T59);
      made.g.s.hour = hour;
      made.p.next = () => Pad.A; // any key leaves the sky
      return made;
    };

    it('shows the sun by day, and burns a member for a point', async () => {
      for (const hour of [6, 12, 17]) {
        const made = await through(hour);
        const hp = made.g.s.members.map((m) => m.hp);
        made.p.keys.push(K.Up);
        await lookCommand(made.g);
        expect(made.p.log, `hour ${hour}`).toContain('the sun!');
        expect(made.g.s.members[0].hp).toBe(hp[0] - 1);
        expect(made.g.s.members[1].hp).toBe(hp[1]);
      }
    });

    it('shows the night sky by night, with no harm done', async () => {
      for (const hour of [18, 23, 0, 5]) {
        const made = await through(hour);
        const hp = made.g.s.members.map((m) => m.hp);
        made.p.keys.push(K.Up);
        await lookCommand(made.g);
        expect(made.p.log, `hour ${hour}`).toContain('the night sky!');
        expect(made.p.log).not.toContain('the sun!');
        expect(made.g.s.members.map((m) => m.hp)).toEqual(hp);
      }
    });

    it('draws the eight moons in white, and moves them as the days pass', async () => {
      const moons = async (day: number): Promise<string> => {
        const made = await through(22);
        made.g.s.day = day;
        const plotted: string[] = [];
        made.g.draw.plot = (x, y) => {
          if (made.g.draw.pen === Colour.brightWhite) plotted.push(`${x},${y}`);
        };
        await nightSky(made.g);
        expect(plotted.length).toBeGreaterThanOrEqual(8 * 9);
        return plotted.join(' ');
      };
      const first = await moons(5); // the day the moons are reckoned from (year 39, month 4)
      expect(await moons(5)).toBe(first);
      expect(await moons(6)).not.toBe(first);
    });

    it('marks the moon of a Shadowlord in red, and no other', async () => {
      const marks = async (lords: number[]): Promise<number> => {
        const made = await through(22);
        made.g.s.shadowlords.set(lords);
        let red = 0;
        made.g.draw.line = () => {
          if (made.g.draw.pen === Colour.red) red++;
        };
        await nightSky(made.g);
        return red;
      };
      expect(await marks([0, 0, 0])).toBe(0);
      const one = await marks([3, 0, 0]);
      expect(one).toBeGreaterThan(0);
      expect(await marks([3, 5, 0])).toBe(one * 2);
    });
  });

  describe('a crystal sphere, the gem', () => {
    /** The sea off the shore at (20, 20), with the gem to the north and the player of the first member looking. */
    const gem = (int: number): Made => {
      const made = atSea(0x1c);
      const { g } = made;
      setTileAt(g, 20, 19, T.T29);
      g.s.activeMember = 0;
      g.s.members[0].int = int;
      const real = g.random.bind(g);
      g.random = (lo, hi) => (lo === 1 && hi === 0x1e ? 15 : real(lo, hi)); // the vision's roll
      return made;
    };

    it('shows a death vision to a mind too weak for it: a point of damage, and no map', async () => {
      const made = gem(14);
      const hp = made.g.s.members[0].hp;
      made.p.keys.push(K.Up);
      await lookCommand(made.g);
      expect(made.p.log).toContain('Death vision!');
      expect(made.g.s.members[0].hp).toBe(hp - 1);
    });

    it('shows a strange vision to a mind that can bear it: the map of the surroundings, until a key', async () => {
      const made = gem(15 + 1);
      const { g, p } = made;
      let idle = 0;
      const own = p.waitKey.bind(p);
      p.waitKey = async (watch?: () => void | Promise<void>) => {
        if (p.keys.length > 0) return own(); // the way to look is asked first
        for (; idle < 8; idle++) await watch?.();
        return Pad.A;
      };
      const hp = g.s.members[0].hp;
      p.keys.push(K.Up);
      await lookCommand(g);
      expect(p.log).toContain('Strange vision!');
      expect(g.s.members[0].hp).toBe(hp);
      expect(idle).toBe(8);
    });

    it('draws the 32 squares about the party as small symbols, the party’s own square flashing', async () => {
      const { g, p } = atSea(0x1c, 20, 20);
      setTileAt(g, 22, 23, 0x09); // brush: a green square
      const fills: string[] = [];
      const inverts: string[] = [];
      g.draw.fill = (x1, y1, x2, y2) => fills.push(`${g.draw.pen}:${x1},${y1},${x2},${y2}`);
      g.draw.invert = (x1, y1, x2, y2) => inverts.push(`${x1},${y1},${x2},${y2}`);
      p.waitKey = async (watch?: () => void | Promise<void>) => {
        for (let i = 0; i < 8; i++) await watch?.();
        return Pad.A;
      };
      await viewGem(g, g.s.x, g.s.y);
      expect(fills[0]).toBe('0:8,8,183,183'); // the old view wiped
      const bx = ((22 - g.s.chunkX) & 0xff) * 4 + 0x20;
      const by = ((23 - g.s.chunkY) & 0xff) * 4 + 0x20;
      expect(fills).toContain(`${Colour.green + 8}:${bx},${by},${bx + 3},${by + 3}`);
      const px = ((20 - g.s.chunkX) & 0xff) * 4 + 0x20;
      const py = ((20 - g.s.chunkY) & 0xff) * 4 + 0x20;
      expect(inverts).toEqual([`${px},${py},${px + 3},${py + 3}`, `${px},${py},${px + 3},${py + 3}`]);
    });
  });
});
