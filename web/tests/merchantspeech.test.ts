import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { merchant } from '../src/game/shops.ts';
import { boxShown, waitsForKey } from '../src/game/speech.ts';
import type { Game } from '../src/game/game.ts';
import { setTileAt } from '../src/game/world.ts';
import { T } from '../src/game/tiles.ts';
import { newGame } from './helpers.ts';
import { boxedWords, words } from './merchantWords.ts';
import { fly, Landed } from './pilot.ts';

/**
 * A merchant's words in the Dialog setting's box with Play (merchantSpeech.ts): the same visit as with Log - the same
 * menus offered, the same sales made - but what the merchant says between its quotation marks shown in the box, and
 * the log left with who says it, the party's answers, what comes of them and the lists of wares.
 */
describe("a merchant's words with the Dialog setting's Play", () => {
  const KINDS = ['armoury', 'pub', 'stables', 'shipwright', 'apothecary', 'guild', 'healer', 'inn'];

  /** A visit to the first shop of `kind`, every choice its `pick`'s; what was offered, done, logged and boxed. */
  const visit = async (
    kind: number,
    dialog: 'play' | 'log',
    pick: (step: number, n: number, labels: string[]) => number,
    setup?: (g: Game) => void,
  ) => {
    const { g, p } = newGame(7);
    g.options.input = 'controller';
    g.options.dialog = dialog;
    journeyOnward(g);
    const s = g.s;
    s.mapId = g.data.bytes(0x23ca + kind * 16, 16)[0];
    s.gold = 5000;
    s.hour = 10;
    s.members[1].status = 0x50; // poisoned: the healer has something to do
    // No change gone astray (shops.ts shortChange): its roll is the wind's too, and Play's box draws the view more.
    s.townAir = 1;
    // Nor the wind's rolls between, which draws the view more often with Play rolls more of: the merchants' words are
    // chosen by roll too.
    const roll = g.random.bind(g);
    g.random = (low: number, high: number) => (/shiftWind/.test(new Error().stack ?? '') ? high : roll(low, high));
    setup?.(g);
    let log = '';
    let box = '';
    // Everything said, the log's and the box's, as it was printed; and what the box was seen to show, page by page.
    let all = '';
    let shown = '';
    const gg = g as unknown as { remember: (t: string) => void };
    const remember = gg.remember.bind(g);
    gg.remember = (t: string) => {
      if (g.p.text.current === 2) log += t;
      if (g.p.text.current === 4) box += t;
      if (g.p.text.current === 2 || g.p.text.current === 4) all += t;
      remember(t);
    };
    const t = g.text;
    const showStaged = t.showStaged.bind(t);
    t.showStaged = (from, count, column, row, width) => {
      shown +=
        t
          .stagedLines()
          .slice(from, from + count)
          .join(process.env.SHOW ? '|' : ' ') + ' ';
      showStaged(from, count, column, row, width);
    };
    const offered: string[] = [];
    let boxes = 0;
    let menus = 0;
    let seen: unknown = null;
    let want = 0;
    fly(
      g,
      p,
      [
        (game) => {
          if (boxShown(game)) boxes++;
          // The box's arrow: on (the last menu is still the one shown, though it is gone).
          if (waitsForKey(game)) return Pad.A;
          const m = game.menuShown;
          // A wait for a key (the box's arrow, or 1988's): on.
          if (!m) return menus > 12 ? K.Escape : Pad.A;
          if (m !== seen) {
            seen = m;
            menus++;
            offered.push(`${m.title}: ${m.labels.join('|')}`);
            want = Math.max(0, pick(menus, m.labels.length, m.labels));
          }
          if (menus > 12) return Pad.B;
          return m.at === want ? Pad.A : m.at < want ? K.Down : K.Up;
        },
      ],
      200,
    );
    await merchant(g, 0x81 + kind).catch((e: unknown) => {
      if (!(e instanceof Landed)) throw e;
    });
    const held = {
      gold: s.gold,
      food: s.food,
      equipment: [...s.equipment],
      reagents: [...s.reagents],
      keys: s.keys,
      gems: s.gems,
      party: s.members.slice(0, 6).map((m) => [m.name, m.status]),
      size: s.partySize,
      actors: s.actors.map((a) => a.tile),
    };
    return { offered, held, log, box, boxes, after: boxShown(g), all, shown };
  };

  const picks: [string, (step: number, n: number) => number][] = [
    ['the first of each', () => 0],
    ['the last of each', (_, n) => n - 1],
    ['one after another', (step, n) => step % n],
  ];
  for (const [kind, name] of KINDS.entries())
    for (const [how, pick] of picks)
      it(`${name}, ${how}: as with Log, the merchant's words in the box and none in the log`, async () => {
        const play = await visit(kind, 'play', pick);
        const log = await visit(kind, 'log', pick);
        if (process.env.SHOW) console.log('SHOWN', name, how, JSON.stringify(play.shown));
        expect(play.offered).toEqual(log.offered);
        expect(play.held).toEqual(log.held);
        // The log's quotation marks are the merchants' alone: with Play there are none, and their words are the box's.
        expect(play.log).not.toContain('"');
        if (kind !== 2) expect(log.log).toContain('"');
        if (kind !== 2) expect(play.box.length).toBeGreaterThan(20); // (the stables shut at this hour)
        expect(play.after).toBeNull(); // put away as the visit ends
        // The merchant's words, all of them and nothing else: the box has what Log printed within quotation marks (boxed),
        // and showed all it was given, a page at a time.
        expect(words(play.box)).toEqual(words(boxedWords(log.log)));
        expect(words(play.shown)).toEqual(words(play.box));
        // With a controller the lists picked from by letter are the menus' alone: neither the log's nor the box's.
        expect(play.log).not.toMatch(/^\s*[A-Za-z][.)]\.{2,}/m);
      });
  it('with the keyboard as letters (Classic): as with Log, the letters typed answering as ever', async () => {
    const run = async (dialog: 'play' | 'log', kind: number, typed: string, setup?: (g: Game) => void) => {
      const { g, p } = newGame(7);
      g.options.input = 'letters';
      g.options.dialog = dialog;
      journeyOnward(g);
      const s = g.s;
      s.mapId = g.data.bytes(0x23ca + kind * 16, 16)[0];
      s.gold = 5000;
      s.hour = 10;
      s.townAir = 1;
      setup?.(g);
      let log = '';
      const gg = g as unknown as { remember: (t: string) => void };
      const remember = gg.remember.bind(g);
      gg.remember = (t: string) => {
        if (g.p.text.current === 2) log += t;
        remember(t);
      };
      // The answers typed, and a key for each of the box's pauses (its arrow).
      const answers = [...typed].map((c) => c.charCodeAt(0));
      // Typed out, No, Escape and Space by turns to leave, whatever is asked last (a key to go on, a yes or no, a member).
      let out = 0;
      fly(g, p, [() => (waitsForKey(g) ? K.Space : (answers.shift() ?? [0x4e, K.Escape, K.Space][out++ % 3]))], 80);
      g.options.input = 'letters'; // (which fly sets to the controller)
      await merchant(g, 0x81 + kind).catch((e: unknown) => {
        if (!(e instanceof Landed)) throw e;
      });
      return { log, held: { gold: s.gold, food: s.food, equipment: [...s.equipment], size: s.partySize }, after: boxShown(g) };
    };
    // Rooms free at the inn: nobody of the party's left there yet.
    const roomy = (g: Game): void => {
      for (const m of g.s.members.slice(g.s.partySize)) m.mapId = 0xff;
    };
    for (const [kind, typed, setup] of [
      // (The armoury's pause after its welcome: a key of the log's own, the box's arrow - answered by itself - with Play.)
      [0, 'BbY N ', undefined],
      [1, 'YFYAN', undefined],
      [6, 'YC2N', undefined],
      [7, 'YLN', roomy],
    ] as const) {
      const play = await run('play', kind, typed, setup);
      const log = await run('log', kind, kind === 0 ? ` ${typed}` : typed, setup);
      expect(play.held).toEqual(log.held);
      expect(play.log).not.toContain('"');
      expect(play.after).toBeNull();
    }
  });
  /** Choices by name, in order; the first of each where its name is not offered. */
  const byName =
    (...wanted: RegExp[]) =>
    (): ((step: number, n: number, labels: string[]) => number) => {
      const names = [...wanted];
      return (_, __, labels) => {
        const at = labels.findIndex((l) => names[0]?.test(l));
        if (at >= 0) names.shift();
        return Math.max(0, at);
      };
    };
  type Held = Awaited<ReturnType<typeof visit>>['held'];
  const scenes: [
    string,
    number,
    () => (step: number, n: number, labels: string[]) => number,
    (((g: Game) => void) | undefined)?,
    ((h: Held) => void)?,
  ][] = [
    ['an armoury, selling', 0, byName(/^Sell/, /./, /^Yes/, /^No/)],
    ['a pub, its lore', 1, byName(/^Yes/, /^Chat/, /^British/, /^No/)],
    ['a pub, wine', 1, byName(/^Yes/, /^Ale/, /^Yes/, /^Ale/, /^Yes/, /^Ale/, /^No/)],
    [
      'the stables, open',
      2,
      byName(/^Yes/, /^Yes/),
      (g) => {
        // Grass beside the party, where a horse bought is led out (shops.ts stables).
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ])
          setTileAt(g, g.s.x + dx, g.s.y + dy, T.Grass);
      },
      (h) => expect(h.gold).toBeLessThan(5000), // a horse bought
    ],
    [
      'an inn, picking up a companion left there',
      7,
      byName(/^Yes/, /^Pick/, /./, /^Yes/, /^No/),
      (g) => {
        // One of the party's left at this inn a while ago (shops.ts guests), the rest nowhere.
        const s = g.s;
        for (const m of s.members.slice(s.partySize)) m.mapId = 0xff;
        s.members[s.partySize].mapId = s.mapId;
      },
      // (Months owed for the room, more than the party has: the guards called, as in 1988.)
      (h) => expect(h.size).toBe(3),
    ],
    [
      'a healer, curing the poisoned',
      6,
      byName(/^Yes/, /^Cure/, /Shamino/, /^Yes/, /^No/),
      undefined,
      (h) => expect(h.party[1][1]).not.toBe(0x50),
    ],
  ];
  for (const [name, kind, pick, setup, check] of scenes)
    it(`${name}: as with Log, the words in the box, none lost`, async () => {
      const play = await visit(kind, 'play', pick(), setup);
      const log = await visit(kind, 'log', pick(), setup);
      expect(play.offered).toEqual(log.offered);
      expect(play.held).toEqual(log.held);
      check?.(play.held);
      expect(play.log).not.toContain('"');
      expect(words(play.box)).toEqual(words(boxedWords(log.log)));
      expect(words(play.shown)).toEqual(words(play.box));
      expect(play.after).toBeNull();
    });

  it('says what a merchant says on horseback in the box, read before it goes', async () => {
    const { g, p } = newGame(7);
    g.options.dialog = 'play';
    journeyOnward(g);
    const s = g.s;
    let box = '';
    let log = '';
    const gg = g as unknown as { remember: (t: string) => void };
    const remember = gg.remember.bind(g);
    gg.remember = (t: string) => {
      if (g.p.text.current === 2) log += t;
      if (g.p.text.current === 4) box += t;
      remember(t);
    };
    s.partyTile = 0x12; // on horseback
    p.keys.push(K.Space); // the box's last words read
    await merchant(g, 0x81);
    expect(p.keys).toEqual([]);
    expect(box.replace(/\s+/g, ' ')).toContain('GET THAT HORSE OUT OF HERE!');
    expect(log).toContain('A merchant says:');
    expect(log).not.toContain('"');
  });
});
