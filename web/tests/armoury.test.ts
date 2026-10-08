import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { merchant } from '../src/game/shops.ts';
import { readyPurchase } from '../src/game/zstats.ts';
import { Status } from '../src/game/save.ts';
import { newGame } from './helpers.ts';
import { fly, Landed } from './pilot.ts';

/** The armoury, by controller: what the party has is shown beside the wares, and a purchase is readied on the spot. */
describe('an armoury', () => {
  it('asks who is buying, offers the wares for them, and readies what is bought on them, the old piece going to the pack', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    s.mapId = g.data.bytes(0x23ca, 16)[0];
    s.gold = 5000;
    s.members[0].str = 30;
    const wares = g.data.bytes(0x3ae2, 8);
    const before = [...s.members[0].equips];
    const titles = new Set<string>();
    let bought = false;
    let readyAt = -1;
    let offered: string[] = [];
    let cardShown = false;
    fly(
      g,
      p,
      [
        (game) => {
          const m = game.menuShown;
          if (!m) return bought ? Pad.B : Pad.A;
          titles.add(m.title);
          const go = (i: number): number => (m.at === i ? Pad.A : m.at < i ? K.Down : K.Up);
          if (m.title === 'Ready it?') {
            bought = true;
            readyAt = m.at;
            // The member under the bar, their arms against the ware on the panel (shopCard.ts).
            cardShown = p.rows
              .map((r) => r.join(''))
              .join('\n')
              .includes('vs');
            return Pad.A;
          }
          if (m.title === 'Who is buying?') return bought ? Pad.B : go(0);
          if (m.title === 'Buy') {
            if (!offered.length) offered = [...m.labels];
            return bought ? Pad.B : go(0);
          }
          const buy = m.labels.findIndex((l) => /^buy/i.test(l));
          if (buy >= 0) return go(buy);
          return bought && m.labels.includes('No') ? go(m.labels.indexOf('No')) : Pad.A;
        },
      ],
      300,
    );
    await merchant(g, 0x81).catch((e: unknown) => {
      if (!(e instanceof Landed)) throw e;
    });
    const item = wares[0];
    expect(titles.has('Who is buying?')).toBe(true);
    expect(p.log).toContain('Readied:');
    // Each ware with its price; all to be had here, in the shop's own order.
    expect(offered[0]).toMatch(/\d+g$/);
    // The bar starts on who it was bought for, and it is theirs - their arms against it on the panel.
    expect(readyAt).toBe(1);
    expect(cardShown).toBe(true);
    expect(s.members[0].equips).toContain(item);
    // Whatever was in its way is in the pack, not gone.
    const gone = before.filter((v) => v !== 0xff && !s.members[0].equips.includes(v));
    for (const v of gone) expect(s.equipment[v]).toBeGreaterThan(0);
  });

  it('prices the wares by the cleverest of the party awake, whoever is first', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    s.mapId = g.data.bytes(0x23ca, 16)[0];
    s.gold = 5000;
    s.members[0].int = 10;
    s.members[1].int = 25; // the cleverest standing
    s.members[2].int = 30;
    s.members[2].status = Status.Dead; // cleverer, but past haggling
    let offered: string[] = [];
    fly(
      g,
      p,
      [
        (game) => {
          const m = game.menuShown;
          if (!m) return Pad.A;
          if (m.title === 'Buy') {
            offered = [...m.labels];
            return Pad.B;
          }
          if (m.title === 'Who is buying?') return offered.length ? Pad.B : Pad.A;
          const buy = m.labels.findIndex((l) => /^buy/i.test(l));
          if (buy >= 0) return m.at === buy ? Pad.A : K.Down;
          return Pad.B;
        },
      ],
      200,
    );
    await merchant(g, 0x81).catch((e: unknown) => {
      if (!(e instanceof Landed)) throw e;
    });
    // Each ware at its price haggled by intelligence 25 (3% off a point), not 10, the first's, nor 30, the dead's.
    const names = g.data.table(0x17f6, 0x30);
    const price = (base: number, int: number): number => base + Math.trunc((base * -(int * 3 - 100)) / 100);
    for (const item of g.data.bytes(0x3ae2, 8)) {
      if (item === 0xff) break;
      const line = offered.find((l) => l.startsWith(names[item].slice(0, 13)));
      expect(line, names[item]).toMatch(new RegExp(` ${price(g.data.words(0x3a82, 0x30)[item], 25)}g$`));
    }
    expect(s.gold).toBe(5000);
  });

  it('speaks to the Avatar while alive, whoever haggles; to the one haggling once the Avatar has fallen', async () => {
    const visit = async (avatarDead: boolean): Promise<string> => {
      const { g, p } = newGame();
      journeyOnward(g);
      const s = g.s;
      s.mapId = g.data.bytes(0x23ca, 16)[0];
      s.gold = 5000;
      s.members[0].gender = 0xc; // a lady Avatar, the least clever
      s.members[0].int = 10;
      s.members[1].int = 25; // Shamino haggles
      if (avatarDead) s.members[0].status = Status.Dead;
      let bought = false;
      fly(
        g,
        p,
        [
          (game) => {
            const m = game.menuShown;
            if (!m) return bought ? Pad.B : Pad.A;
            if (m.title === 'Ready it?') {
              if (m.at !== 0) return K.Up; // to Keep it packed
              bought = true;
              return Pad.A;
            }
            if (m.title === 'Who is buying?') return bought ? Pad.B : m.enabled[m.at] ? Pad.A : K.Down;
            if (m.title === 'Buy') return bought ? Pad.B : Pad.A;
            const buy = m.labels.findIndex((l) => /^buy/i.test(l));
            if (buy >= 0) return m.at === buy ? Pad.A : K.Down;
            return Pad.A;
          },
        ],
        300,
      );
      await merchant(g, 0x81).catch((e: unknown) => {
        if (!(e instanceof Landed)) throw e;
      });
      return p.log.replace(/\s+/g, ' ');
    };
    expect(await visit(false)).toMatch(/Anything else, milady\?/);
    expect(await visit(true)).toMatch(/Anything else, sir\?/);
  });

  it('will not ready what the member has not the strength for, and changes nothing', async () => {
    const { g } = newGame();
    journeyOnward(g);
    const s = g.s;
    const weight = g.data.bytes(0x1aae, 0x30);
    const heavy = weight.indexOf(Math.max(...weight));
    s.equipment[heavy] = 1;
    s.members[0].str = 1;
    const before = [...s.members[0].equips];
    expect(await readyPurchase(g, 0, heavy)).toBe(false);
    expect([...s.members[0].equips]).toEqual(before);
    expect(s.equipment[heavy]).toBe(1);
  });
});

/**
 * The lists a pad player picks gear from are menus over the map, as the
 * ultima3 port has them - the stats pane is for choosing members - with
 * what is readied marked, the way that port marks it.
 */
describe('the gear lists, by controller', () => {
  it('readies from a menu over the map that marks what is in hand, and sells from one', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const names = g.data.table(0x17f6, 0x30);
    const sword = names.findIndex((n) => /^Short Sword$/.test(n));
    s.members[0].str = 30;
    s.members[0].equips.fill(0xff);
    s.equipment.fill(0);
    s.equipment[sword] = 2;
    const { readyCommand } = await import('../src/game/zstats.ts');
    let labels: string[] = [];
    let seen = 0;
    fly(
      g,
      p,
      [
        (game) => {
          const m = game.menuShown;
          if (!m) return Pad.A; // "Player:" the first member
          if (m.title !== 'Ready') return Pad.B;
          if (seen === 0) {
            labels = [...m.labels];
            seen = 1;
            return Pad.A; // ready the sword
          }
          if (seen === 1) {
            labels = [...m.labels];
            seen = 2;
          }
          return Pad.B; // done
        },
      ],
      60,
    );
    await readyCommand(g).catch((e: unknown) => {
      if (!(e instanceof Landed)) throw e;
    });
    expect(seen).toBe(2);
    expect(s.members[0].equips).toContain(sword);
    expect(labels).toEqual(['Short Sword x1 (hand)']);
    expect(p.log).not.toContain('Item: Done'); // the stats pane's list of old was not drawn
    // Sold from the same kind of menu: the pack's short sword offered, the offer taken.
    s.mapId = g.data.bytes(0x23ca, 16)[0];
    const goldBefore = s.gold;
    let sellMenu: string[] = [];
    fly(
      g,
      p,
      [
        (game) => {
          const m = game.menuShown;
          if (!m) return Pad.A;
          const go = (i: number): number => (m.at === i ? Pad.A : m.at < i ? K.Down : K.Up);
          if (m.title === 'Sell') {
            if (sellMenu.length) return Pad.B;
            sellMenu = [...m.labels];
            return Pad.A;
          }
          const sell = m.labels.findIndex((l) => /^sell/i.test(l));
          if (sell >= 0 && !sellMenu.length) return go(sell);
          if (m.labels.includes('Yes')) return go(m.labels.indexOf(sellMenu.length ? 'Yes' : 'No'));
          return Pad.B;
        },
      ],
      120,
    );
    await merchant(g, 0x81).catch((e: unknown) => {
      if (!(e instanceof Landed)) throw e;
    });
    expect(sellMenu).toEqual(['Short Sword x1']);
    expect(s.gold).toBeGreaterThan(goldBefore);
    expect(s.equipment[sword]).toBe(0);
  });
});
