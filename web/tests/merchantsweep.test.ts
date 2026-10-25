/**
 * Every merchant of every kind, with the Dialog setting's Play (merchantSpeech.ts), against the same visit with Log:
 * the box has the merchant's words - what Log printed within quotation marks, the marks 1988 left out given them -
 * and nothing else; the log no quotation mark and no list of wares (a controller's menus have them).
 */
import { expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { merchant } from '../src/game/shops.ts';
import { waitsForKey } from '../src/game/speech.ts';
import { newGame } from './helpers.ts';
import { fly, Landed } from './pilot.ts';
import { boxedWords, words } from './merchantWords.ts';

const visit = async (kind: number, shop: number, seed: number, dialog: 'play' | 'log', pick: (n: number, labels: string[]) => number) => {
  const { g, p } = newGame(seed);
  g.options.input = 'controller';
  g.options.dialog = dialog;
  journeyOnward(g);
  const s = g.s;
  s.mapId = g.data.bytes(0x23ca + kind * 16, 16)[shop];
  s.gold = 5000;
  s.hour = 10;
  s.townAir = 1;
  s.members[1].status = 0x50;
  for (const m of s.members.slice(s.partySize)) m.mapId = 0xff;
  const roll = g.random.bind(g);
  g.random = (low: number, high: number) => (/shiftWind/.test(new Error().stack ?? '') ? high : roll(low, high));
  let log = '';
  let box = '';
  const gg = g as unknown as { remember: (t: string) => void };
  const remember = gg.remember.bind(g);
  gg.remember = (t: string) => {
    if (g.p.text.current === 2) log += t;
    if (g.p.text.current === 4) box += t;
    remember(t);
  };
  let menus = 0;
  let seen: unknown = null;
  let want = 0;
  fly(
    g,
    p,
    [
      (game) => {
        if (waitsForKey(game)) return Pad.A;
        const m = game.menuShown;
        if (!m) return menus > 14 ? K.Escape : Pad.A;
        if (m !== seen) {
          seen = m;
          menus++;
          want = pick(menus, m.labels);
        }
        if (menus > 14 || want < 0) return Pad.B; // (a choice backed out of)
        return m.at === want ? Pad.A : m.at < want ? K.Down : K.Up;
      },
    ],
    300,
  );
  await merchant(g, 0x81 + kind).catch((e: unknown) => {
    if (!(e instanceof Landed)) throw e;
  });
  return { log, box };
};

it("gives every merchant's words to the box, and only theirs", async () => {
  const picks: [string, (n: number, labels: string[]) => number][] = [
    ['the first of each', () => 0],
    ['one after another', (n, l) => n % l.length],
    // Backed out of the second choice, and of the third: a merchant's words left unclosed by the shop (who is buying?).
    ['the second backed out of', (n) => (n === 2 ? -1 : 0)],
    ['the third backed out of', (n) => (n === 3 ? -1 : 0)],
  ];
  const wrong: string[] = [];
  const g = newGame().g;
  for (let kind = 0; kind < 8; kind++)
    for (let shop = 0; shop < 16; shop++) {
      if (g.data.bytes(0x23ca + kind * 16, 16)[shop] === 0) continue;
      for (const seed of [1, 2])
        for (const [how, pick] of picks) {
          const play = await visit(kind, shop, seed, 'play', pick);
          const log = await visit(kind, shop, seed, 'log', pick);
          const leaked = play.log.includes('"') || /^\s*[A-Za-z][.)]\.{2,}/m.test(play.log);
          if (words(play.box) !== words(boxedWords(log.log)) || leaked) wrong.push(`kind ${kind}, shop ${shop}, seed ${seed}, ${how}`);
        }
    }
  expect(wrong).toEqual([]);
}, 300000);
