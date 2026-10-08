import { describe, expect, it } from 'vitest';
import type { Game } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { Status } from '../src/game/save.ts';
import { merchant } from '../src/game/shops.ts';
import { keys, newGame } from './helpers.ts';

/** Shop kinds, as the door asks for them (shops.ts merchant). */
const PUB = 0x82;
const SHIPWRIGHT = 0x84;
const HEALER = 0x87;
const INN = 0x88;

/**
 * One visit to a shop of `kind` (the `shop`th of its kind), the party standing in its door with `gold`, answering as
 * `answers` say - letters and Enter, as at a keyboard. `setup` readies the party first.
 */
async function visit(
  kind: number,
  shop: number,
  gold: number,
  answers: string | (number | string)[],
  setup: (g: Game) => void = () => {},
): Promise<{ g: Game; log: string }> {
  const { g, p } = newGame();
  journeyOnward(g);
  const s = g.s;
  s.mapId = g.data.bytes(0x23ca + (kind - 0x81) * 16, 16)[shop];
  s.gold = gold;
  s.townAir = 0xff; // a towne no Shadowlord is in, where the change is not short (shops.ts shortChange)
  s.partySize = 3;
  for (const m of s.members.slice(0, 3)) {
    m.status = Status.Good;
    m.int = 10;
  }
  setup(g);
  p.keys.push(...keys(...[answers].flat()));
  await merchant(g, kind);
  expect(p.keys).toEqual([]); // every answer was asked for
  return { g, log: p.log.replace(/\s+/g, ' ') };
}

/** The price tables in DATA.OVL, by the shop's place among its kind. */
const data = (g: Game) => ({
  innRate: (shop: number) => g.data.bytes(0x4d7e, 8)[shop],
  cure: (shop: number) => g.data.bytes(0x3d8e, 8)[shop],
  heal: (shop: number) => g.data.bytes(0x3d86, 8)[shop],
  raise: (shop: number) => g.data.words(0x3d96, 8)[shop],
  frigate: (shop: number) => g.data.words(0x4d66, 4)[shop],
  skiff: (shop: number) => g.data.words(0x4d6e, 4)[shop],
  meal: (shop: number) => g.data.words(0x4c36, 9)[shop],
  wine: (n: number) => g.data.swords(0x4c48, 6)[n],
});

describe('a night at the inn, paid for', () => {
  it('costs the room by the head, less for the cleverest of the party, and sleeps the party till morning', async () => {
    const { g } = newGame();
    const rate = data(g).innRate(0);
    // Intelligence 10 across a party of three: the base 3 x 2 gold, and 70% more (haggle: 3% off for each point).
    expect(rate * 3).toBe(6);
    const dull = await visit(INN, 0, 500, 'YRY', (g) => {
      g.s.hour = 12;
      for (const m of g.s.members.slice(0, 3)) m.hp = 1;
    });
    expect(500 - dull.g.s.gold).toBe(10);
    expect(dull.g.s.hour).toBe(6);
    for (const m of dull.g.s.members.slice(0, 3)) {
      expect(m.hp).toBe(m.maxHp);
      expect(m.status).toBe(Status.Good); // slept, and woke
    }
    // One clever member, awake, haggles for the lot.
    const clever = await visit(INN, 0, 500, 'YRY', (g) => (g.s.members[1].int = 40));
    expect(500 - clever.g.s.gold).toBe(5);
  });

  it('turns away a party that cannot pay, taking nothing and sleeping no one', async () => {
    const { g, log } = await visit(INN, 0, 9, 'YRY', (g) => {
      g.s.hour = 12;
      g.s.members[1].hp = 1;
    });
    expect(g.s.gold).toBe(9);
    expect(g.s.hour).toBe(12);
    expect(g.s.members[1].hp).toBe(1);
    expect(log).toMatch(/Highwaymen/);
  });

  it('takes nothing from a party that says no to the room', async () => {
    const { g } = await visit(INN, 0, 500, 'YRN', (g) => (g.s.members[1].hp = 1));
    expect(g.s.gold).toBe(500);
    expect(g.s.members[1].hp).toBe(1);
  });

  it('has no room to let when its rooms are taken by companions left there', async () => {
    const { g } = newGame();
    const rooms = g.data.bytes(0x4dc4, 6)[0];
    const full = await visit(INN, 0, 500, 'YRN', (g) => {
      for (let i = 0; i < rooms; i++) g.s.members[8 + i].mapId = g.s.mapId;
    });
    expect(full.log).toMatch(/no room available/);
    expect(full.g.s.gold).toBe(500);
    // One room fewer taken, and it is let.
    const free = await visit(INN, 0, 500, 'YRY', (g) => {
      for (let i = 0; i < rooms - 1; i++) g.s.members[8 + i].mapId = g.s.mapId;
    });
    expect(free.log).not.toMatch(/no room available/);
    expect(free.g.s.gold).toBeLessThan(500);
  });
});

describe('the healers, paid', () => {
  /** Keys for one art asked for at a healer: yes, the art's letter, the second member, then `pay`, then no more. */
  const ask = (art: string, pay: 'Y' | 'N' | ''): (number | string)[] => ['Y', art, '2', K.Enter, pay, 'N'];
  const hurt = (g: Game): void => {
    g.s.members[1].hp = 5;
    g.s.members[1].maxHp = 60;
  };
  const poisoned = (g: Game): void => {
    g.s.members[1].status = Status.Poisoned;
  };
  const dead = (g: Game): void => {
    g.s.members[1].status = Status.Dead;
    g.s.members[1].hp = 0;
    g.s.members[1].exp = 400;
    g.s.karma = 100;
  };

  it("cures for the healer's price, and heals and raises for theirs", async () => {
    const { g } = newGame();
    const d = data(g);
    const cure = await visit(HEALER, 1, 1000, ask('C', 'Y'), poisoned);
    expect(cure.g.s.members[1].status).toBe(Status.Good);
    expect(1000 - cure.g.s.gold).toBe(d.cure(1));
    const heal = await visit(HEALER, 1, 1000, ask('H', 'Y'), hurt);
    expect(heal.g.s.members[1].hp).toBe(60);
    expect(1000 - heal.g.s.gold).toBe(d.heal(1));
    const raise = await visit(HEALER, 1, 1000, ask('R', 'Y'), dead);
    expect(raise.g.s.members[1].status).toBe(Status.Good);
    expect(raise.g.s.members[1].hp).toBe(raise.g.s.members[1].maxHp);
    expect(1000 - raise.g.s.gold).toBe(d.raise(1));
    // Each healer has his own prices.
    expect(d.raise(1)).not.toBe(d.raise(3));
    expect(d.cure(1)).toBeLessThan(d.heal(1));
    expect(d.heal(1)).toBeLessThan(d.raise(1));
  });

  it('does nothing and asks nothing of a party that will not pay', async () => {
    const cure = await visit(HEALER, 1, 1000, ask('C', 'N'), poisoned);
    expect(cure.g.s.members[1].status).toBe(Status.Poisoned);
    expect(cure.g.s.gold).toBe(1000);
    const raise = await visit(HEALER, 1, 1000, ask('R', 'N'), dead);
    expect(raise.g.s.members[1].status).toBe(Status.Dead);
    expect(raise.g.s.gold).toBe(1000);
  });

  it('refuses to cure, heal or raise for a party one gold short, charity cases not being taken', async () => {
    const { g } = newGame();
    const d = data(g);
    for (const [art, price, ready, unchanged] of [
      ['C', d.cure(1), poisoned, (g: Game) => g.s.members[1].status === Status.Poisoned],
      ['H', d.heal(1), hurt, (g: Game) => g.s.members[1].hp === 5],
      ['R', d.raise(1), dead, (g: Game) => g.s.members[1].status === Status.Dead],
    ] as const) {
      const r = await visit(HEALER, 1, price - 1, ask(art, 'Y'), ready);
      expect(r.g.s.gold).toBe(price - 1);
      expect(r.log).toMatch(/cannot accept charity cases/);
      expect(unchanged(r.g)).toBe(true);
    }
  });

  it('charges nothing at the healer whose Light is free, for a cure or a heal', async () => {
    const cure = await visit(HEALER, 0, 0, ask('C', ''), poisoned);
    expect(cure.g.s.mapId).toBe(5);
    expect(cure.g.s.members[1].status).toBe(Status.Good);
    const heal = await visit(HEALER, 0, 0, ask('H', ''), hurt);
    expect(heal.g.s.members[1].hp).toBe(60);
    expect(heal.g.s.gold).toBe(0);
  });

  it('heals a pauper at the Abbey for a small sum but not a resurrection, whose price is dear', async () => {
    const heal = await visit(HEALER, 2, 5, ask('H', 'Y'), hurt);
    expect(heal.g.s.mapId).toBe(7);
    expect(data(heal.g).heal(2)).toBeLessThanOrEqual(100);
    expect(heal.g.s.members[1].hp).toBe(60);
    expect(heal.g.s.gold).toBe(5);
    const raise = await visit(HEALER, 2, 5, ask('R', 'Y'), dead);
    expect(raise.g.s.members[1].status).toBe(Status.Dead);
    expect(raise.g.s.gold).toBe(5);
  });

  it('says there is no need of the art and takes nothing for a cure of one not poisoned or a raising of one not dead', async () => {
    for (const art of ['C', 'R']) {
      const r = await visit(HEALER, 1, 1000, ask(art, ''));
      expect(r.log).toMatch(/Thou hast no need of this art/);
      expect(r.g.s.gold).toBe(1000);
    }
  });
});

describe('the pub, paid', () => {
  it('serves a meal to every one of the party standing, charging for each and feeding each', async () => {
    const { g } = newGame();
    const each = data(g).meal(0);
    const r = await visit(PUB, 0, 100, 'YMN', (g) => {
      g.s.food = 50;
      g.s.members[2].status = Status.Dead; // the dead eat nothing
    });
    expect(100 - r.g.s.gold).toBe(2 * each);
    expect(r.g.s.food).toBe(52);
  });

  it('turns out a party that cannot pay for the round, and serves nothing', async () => {
    const r = await visit(PUB, 0, 5, 'YM', (g) => (g.s.food = 50));
    expect(r.g.s.gold).toBe(5);
    expect(r.g.s.food).toBe(50);
    expect(r.log).toMatch(/CAN'T PAY/);
  });

  it('charges a gold a head for a drink, feeds no one, and calls a halt at the fourth round', async () => {
    const three = await visit(PUB, 0, 100, 'YAYAYAN', (g) => (g.s.food = 50));
    expect(100 - three.g.s.gold).toBe(9);
    expect(three.g.s.food).toBe(50);
    expect(three.g.s.drunk).toBe(0);
    // A fourth: "Haven't ye had enough?" - yes, and it is not poured; no, and it is, the party drunk and a karma the less.
    const stop = await visit(PUB, 0, 100, 'YAYAYAYAYN', (g) => (g.s.karma = 50));
    expect(100 - stop.g.s.gold).toBe(9);
    expect(stop.g.s.drunk).toBe(0);
    expect(stop.g.s.karma).toBe(50);
    const on = await visit(PUB, 0, 100, 'YAYAYAYANN', (g) => (g.s.karma = 50));
    expect(100 - on.g.s.gold).toBe(12);
    expect(on.g.s.drunk).toBe(0x19);
    expect(on.g.s.karma).toBe(49);
  });

  it('charges for a wine as the wine list prints it', async () => {
    const { g } = newGame();
    const w = data(g);
    // The wine list: a) Rose.......18 ... f) Chablis....98, at the fifth pub, whose drink is wine.
    for (const [i, letter] of ['A', 'B', 'C', 'D', 'E', 'F'].entries()) {
      const r = await visit(PUB, 5, 1000, ['Y', 'W', letter, 'N']);
      expect(1000 - r.g.s.gold).toBe(w.wine(i));
      const printed = new RegExp(`${letter.toLowerCase()}\\) \\w+\\.+${w.wine(i)}(?!\\d)`);
      expect(r.log).toMatch(printed);
    }
  });

  it('refuses a wine the party cannot pay for, and charges nothing', async () => {
    const r = await visit(PUB, 5, 100, ['Y', 'W', 'B']);
    expect(r.g.s.gold).toBe(100);
  });
});

describe('the shipwright, paid', () => {
  const dockOf = (g: Game, shop: number): [number, number] => [g.data.bytes(0x4d76, 4)[shop], g.data.bytes(0x4d7a, 4)[shop]];

  it('sells a frigate, takes the gold the cleverest could haggle it to, and has it waiting at the dock', async () => {
    const { g } = newGame();
    const base = data(g).frigate(0);
    // Intelligence 10 everywhere: haggle's 70% more.
    const price = base + Math.trunc((base * 70) / 100);
    const r = await visit(SHIPWRIGHT, 0, 5000, 'YFYN', (g) => (g.s.boughtShip = 0));
    expect(5000 - r.g.s.gold).toBe(price);
    expect(r.g.s.boughtShip).toBe(0x82);
    expect([r.g.s.shipX, r.g.s.shipY]).toEqual(dockOf(g, 0));
  });

  it('throws out a party that cannot pay for a frigate, selling nothing', async () => {
    const r = await visit(SHIPWRIGHT, 0, 100, 'YFY', (g) => (g.s.boughtShip = 0));
    expect(r.g.s.gold).toBe(100);
    expect(r.g.s.boughtShip).toBe(0);
    expect(r.log).toMatch(/OUT!/);
  });

  it('sells a skiff for less, and a second skiff to a party with a frigate goes aboard it, with no new dock', async () => {
    const { g } = newGame();
    const frigate = data(g).frigate(0);
    const skiff = data(g).skiff(0);
    expect(skiff).toBeLessThan(frigate);
    const first = await visit(SHIPWRIGHT, 0, 5000, 'YSYN', (g) => (g.s.boughtShip = 0));
    expect(5000 - first.g.s.gold).toBe(skiff + Math.trunc((skiff * 70) / 100));
    expect(first.g.s.boughtShip).toBe(0x40);
    expect([first.g.s.shipX, first.g.s.shipY]).toEqual(dockOf(g, 0));
    const aboard = await visit(SHIPWRIGHT, 0, 5000, 'YSYN', (g) => {
      g.s.boughtShip = 0x82;
      g.s.shipX = 7;
      g.s.shipY = 9;
    });
    expect(5000 - aboard.g.s.gold).toBe(skiff + Math.trunc((skiff * 70) / 100));
    expect(aboard.g.s.boughtShip).toBe(0x83);
    expect([aboard.g.s.shipX, aboard.g.s.shipY]).toEqual([7, 9]);
  });

  it('leaves the party its gold when it will not take the ship', async () => {
    const r = await visit(SHIPWRIGHT, 0, 5000, 'YFN', (g) => (g.s.boughtShip = 0));
    expect(r.g.s.gold).toBe(5000);
    expect(r.g.s.boughtShip).toBe(0);
  });
});
