import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { merchant } from '../src/game/shops.ts';
import { boxShown, waitsForKey } from '../src/game/speech.ts';
import { newGame } from './helpers.ts';
import { fly, Landed } from './pilot.ts';

/**
 * A merchant's words in the Dialog setting's box with Play (merchantSpeech.ts): the same visit as with Log - the same
 * menus offered, the same sales made - but what the merchant says between its quotation marks shown in the box, and
 * the log left with who says it, the party's answers, what comes of them and the lists of wares.
 */
describe("a merchant's words with the Dialog setting's Play", () => {
  const KINDS = ['armoury', 'pub', 'stables', 'shipwright', 'apothecary', 'guild', 'healer', 'inn'];

  /** A visit to the first shop of `kind`, every choice its `pick`'s; what was offered, done, logged and boxed. */
  const visit = async (kind: number, dialog: 'play' | 'log', pick: (step: number, n: number) => number) => {
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
    let log = '';
    let box = '';
    const gg = g as unknown as { remember: (t: string) => void };
    const remember = gg.remember.bind(g);
    gg.remember = (t: string) => {
      if (g.p.text.current === 2) log += t;
      if (g.p.text.current === 4) box += t;
      remember(t);
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
          const m = game.menuShown;
          // A wait for a key (the box's arrow, or 1988's): on.
          if (!m) return menus > 12 ? K.Escape : Pad.A;
          if (m !== seen) {
            seen = m;
            menus++;
            offered.push(`${m.title}: ${m.labels.join('|')}`);
            want = pick(menus, m.labels.length);
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
    const held = { gold: s.gold, food: s.food, equipment: [...s.equipment], reagents: [...s.reagents], keys: s.keys, gems: s.gems };
    return { offered, held, log, box, boxes, after: boxShown(g) };
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
        expect(play.offered).toEqual(log.offered);
        expect(play.held).toEqual(log.held);
        // The log's quotation marks are the merchants' alone: with Play there are none, and their words are the box's.
        expect(play.log).not.toContain('"');
        if (kind !== 2) expect(log.log).toContain('"');
        if (kind !== 2) expect(play.box.length).toBeGreaterThan(20); // (the stables shut at this hour)
        expect(play.after).toBeNull(); // put away as the visit ends
        // The lists picked from by letter stay in the log.
        for (const line of log.log.split('\n').filter((l) => /^[A-Za-z]\.{3}/.test(l.trim()))) expect(play.log).toContain(line.trim());
      });
  it('with the keyboard as letters (Classic): as with Log, the letters typed answering as ever', async () => {
    const run = async (dialog: 'play' | 'log', kind: number, typed: string) => {
      const { g, p } = newGame(7);
      g.options.input = 'letters';
      g.options.dialog = dialog;
      journeyOnward(g);
      const s = g.s;
      s.mapId = g.data.bytes(0x23ca + kind * 16, 16)[0];
      s.gold = 5000;
      s.hour = 10;
      s.townAir = 1;
      let log = '';
      const gg = g as unknown as { remember: (t: string) => void };
      const remember = gg.remember.bind(g);
      gg.remember = (t: string) => {
        if (g.p.text.current === 2) log += t;
        remember(t);
      };
      // The answers typed, and a key for each of the box's pauses (its arrow).
      const answers = [...typed].map((c) => c.charCodeAt(0));
      fly(g, p, [() => (waitsForKey(g) ? K.Space : (answers.shift() ?? K.Space))], 80);
      await merchant(g, 0x81 + kind).catch((e: unknown) => {
        if (!(e instanceof Landed)) throw e;
      });
      return { log, held: { gold: s.gold, food: s.food, equipment: [...s.equipment] }, after: boxShown(g) };
    };
    for (const [kind, typed] of [
      [0, ' BbY N '],
      [1, 'YFYAN'],
      [6, 'YCN'],
    ] as const) {
      const play = await run('play', kind, typed);
      const log = await run('log', kind, typed);
      expect(play.held).toEqual(log.held);
      expect(play.log).not.toContain('"');
      expect(play.after).toBeNull();
    }
  });
});
