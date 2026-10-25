/**
 * A merchant's visit as the player sees it with the Dialog setting's Play (merchantSpeech.ts): the box's pages, the log's
 * lines and the menus, in order - each read as a player would expect them.
 */
import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { merchant } from '../src/game/shops.ts';
import { waitsForKey } from '../src/game/speech.ts';
import { newGame } from './helpers.ts';
import { fly, Landed } from './pilot.ts';

/** A visit as the player sees it: each box page (its rows / parted), each log line, each menu, in order. */
const transcript = async (
  kind: number,
  shop: number,
  picks: RegExp[],
  setup?: (g: ReturnType<typeof newGame>['g']) => void,
  input: 'controller' | 'letters' = 'controller',
  typed = '',
) => {
  const { g, p } = newGame(3);
  g.options.dialog = 'play';
  journeyOnward(g);
  const s = g.s;
  s.mapId = g.data.bytes(0x23ca + kind * 16, 16)[shop];
  s.gold = 3000;
  s.hour = 10;
  s.townAir = 1;
  s.members[1].status = 0x50;
  for (const m of s.members.slice(s.partySize)) m.mapId = 0xff;
  setup?.(g);
  const ev: string[] = [];
  let logLine = '';
  const flushLog = () => {
    if (logLine.trim()) ev.push(`LOG   ${logLine.replace(/\s+$/, '')}`);
    logLine = '';
  };
  const gg = g as unknown as { remember: (t: string) => void };
  const remember = gg.remember.bind(g);
  gg.remember = (t: string) => {
    if (g.p.text.current === 2)
      for (const c of t) {
        if (c === '\n') flushLog();
        else logLine += c;
      }
    remember(t);
  };
  const t = g.text;
  const show = t.showStaged.bind(t);
  t.showStaged = (from, count, column, row, width) => {
    flushLog();
    ev.push(
      `BOX   ${t
        .stagedLines()
        .slice(from, from + count)
        .join(' / ')}`,
    );
    show(from, count, column, row, width);
  };
  let seen = '';
  const want = [...picks];
  const keys = [...typed].map((c) => c.charCodeAt(0));
  fly(
    g,
    p,
    [
      (game) => {
        if (waitsForKey(game)) {
          flushLog();
          ev.push('WAIT  ▼');
          return Pad.A;
        }
        if (input === 'letters') {
          flushLog();
          const k = keys.shift();
          ev.push(`TYPE  ${k === undefined ? '(Space)' : String.fromCharCode(k)}`);
          return k ?? K.Space;
        }
        const m = game.menuShown;
        if (!m) {
          flushLog();
          ev.push('KEY   (A)');
          return Pad.A;
        }
        const sig = m.title + m.labels.join('|');
        if (sig !== seen) {
          seen = sig;
          flushLog();
          ev.push(`MENU  ${m.title || '(untitled)'}: ${m.labels.join(' | ')}`);
        }
        // (A pattern that matches nothing backs out of the menu: B.)
        const at = want.length ? m.labels.findIndex((l) => want[0].test(l)) : -1;
        if (at < 0 && want.length) want.shift();
        if (at < 0) return Pad.B;
        if (m.at === at) {
          want.shift();
          ev.push(`PICK  ${m.labels[at]}`);
          seen = '';
          return Pad.A;
        }
        return m.at < at ? K.Down : K.Up;
      },
    ],
    400,
  );
  if (input === 'letters') g.options.input = 'letters';
  await merchant(g, 0x81 + kind).catch((e: unknown) => {
    if (!(e instanceof Landed)) ev.push('LANDED ' + String(e));
  });
  flushLog();
  return ev;
};

describe('a merchant with Play, as the player sees it', () => {
  it("North Star Armoury: the stock said with its question, Sold! the box's, the armour named in full", async () => {
    const ev = await transcript(0, 5, [/^Buy/, /^Tester/, /^Chain Mail/, /^Yes/, /^Tester/]);
    // "Excellent! We stock:" waits for its question, and is shown with it over the wares, not alone over the buyers.
    const stock = ev.findIndex((e) => /^BOX .*stock:/.test(e));
    expect(ev[stock]).toMatch(/stock: \/ .*\?"$/);
    expect(ev[stock + 1]).toMatch(/^MENU {2}Buy:/);
    expect(ev.some((e) => /^BOX {3}"Sold!"/.test(e))).toBe(true);
    expect(ev.some((e) => /^MENU {2}Ready it\?:.*Tester \(Chain Mail\)/.test(e))).toBe(true);
    // The log: the choices as the menus labelled them, no list, no lone letters.
    const log = ev.filter((e) => e.startsWith('LOG')).map((e) => e.slice(6));
    expect(log).toContain('Chain Mail');
    expect(log.some((l) => /^[A-Za-z]$/.test(l) || /^[A-Za-z]\.{3}/.test(l))).toBe(false);
  });

  it('pages a long speech whole sentences to a page: its question never left a line alone', async () => {
    const ev = await transcript(0, 5, [/^Buy/, /^Tester/, /^Plate/, /^No/], (g) => (g.s.gold = 20));
    const pages = ev.filter((e) => e.startsWith('BOX'));
    for (const [i, e] of ev.entries())
      if (e === 'WAIT  \u25bc' && ev[i + 1]?.startsWith('BOX')) expect(ev[i + 1].split(' / ').length, ev[i + 1]).toBeGreaterThan(1);
    expect(pages.some((p) => /Wouldst thou buy \/ one\?"|Wilt thou take \/ it\?"|Wish ye it\?"|thee\?"/.test(p))).toBe(true);
  });

  it('a pub: its choices echoed as its menus name them - Mutton, Ale, Rations, Chat, British', async () => {
    const ev = await transcript(1, 0, [/^Yes/, /^Mutton/, /^Yes/, /^Ale/, /^Yes/, /^Rations/, /./, /^Yes/, /^Chat/, /^British/, /^No/]);
    const log = ev.filter((e) => e.startsWith('LOG')).map((e) => e.slice(6));
    for (const w of ['Mutton', 'Ale', 'Rations', 'Chat', 'British']) expect(log).toContain(w);
    expect(log.some((l) => /^[A-Za-z]$/.test(l))).toBe(false);
  });

  it('an inn: the innkeeper\'s "Thy friends will not leave thee!" in the box', async () => {
    const ev = await transcript(7, 0, [/^Yes/, /^Leave/]);
    expect(ev.some((e) => /^BOX .*"Thy friends will not leave thee!"/.test(e.replace(/ \/ /g, ' ')))).toBe(true);
    expect(ev.some((e) => /^LOG .*leave thee/.test(e))).toBe(false);
  });
  it("North Star Armoury, choices backed out of: the merchant still in the box, the log still the party's", async () => {
    // Out of Who is buying?, and of the wares: 1988 asks again with its opening mark left out (shops.ts buyArmsList).
    for (const picks of [
      [/^Buy/, /^none/],
      [/^Buy/, /^Tester/, /^none/],
    ]) {
      const ev = await transcript(0, 5, picks);
      const log = ev.filter((e) => e.startsWith('LOG')).map((e) => e.slice(6));
      const box = ev.filter((e) => e.startsWith('BOX')).join(' ');
      const read = box.replace(/ \/ /g, ' '); // the box's rows as one
      // Nothing of Max's in the log: the party's answers and who said what alone.
      for (const l of log) expect(l, l).toMatch(/^(Buy|Max says,|says Max\.|Yes|No|Chain Coif|Sold!)$/);
      expect(box).not.toMatch(/\/ "( |$)/); // no closing mark alone on a row
      expect(read).toMatch(/"(Come back|Thanks for|What |Which |Anything|Mayhap|Have a|G'day|Come again|Fare)/);
    }
  });
});
