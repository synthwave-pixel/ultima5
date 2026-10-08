import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { sayMenu } from '../src/game/menu.ts';
import { keywordsOf, loadScript } from '../src/game/talk.ts';
import { newGame } from './helpers.ts';

/** Chuckles, the jester of Lord British's castle: his words and the Say menu a player who knows `words` is shown. */
async function chuckles(words: string): Promise<{ stubs: string[]; dests: string[]; labels: string[] }> {
  const { g, p } = newGame();
  g.options.input = 'controller';
  g.s.mapId = 17; // Lord British's castle
  g.talk.npc = 5;
  loadScript(g, 9);
  const keywords = keywordsOf({ g, t: g.talk });
  g.words.learn(g, words);
  let labels: string[] = [];
  p.next = () => {
    const m = g.menuShown;
    if (m && !labels.length) labels = [...m.labels];
    return m ? Pad.B : K.Escape;
  };
  await sayMenu(g, keywords);
  return { stubs: keywords.map((k) => k.stub.toLowerCase()), dests: keywords.map((k) => k.dest), labels };
}

/** Several words that lead to the same reply are offered once: the first of them the player knows. */
describe('the Say menu, words that say the same', () => {
  it("follows Chuckles' run of words that pass their answer on to the next", async () => {
    const { stubs, dests } = await chuckles('');
    const at = (stub: string): string => dests[stubs.indexOf(stub)];
    // royal, majesty ... cant all pass their answer on to british's; castle has its own.
    for (const stub of ['roya', 'maje', 'emin', 'immo', 'miss', 'dead', 'cant']) expect(at(stub)).toBe(at('brit'));
    expect(at('cast')).not.toBe(at('brit'));
  });

  it('offers only the first of them', async () => {
    const { labels } = await chuckles('His Royal Majesty, His Eminence, Lord British, in his castle.');
    expect(labels).toContain('Royal');
    expect(labels).toContain('Castle');
    for (const same of ['Majesty', 'Eminence', 'British']) expect(labels).not.toContain(same);
  });

  it('offers the first the player knows, where they do not know the first', async () => {
    const { labels } = await chuckles('His Majesty, Lord British.');
    expect(labels).toContain('Majesty');
    for (const same of ['Royal', 'British']) expect(labels).not.toContain(same);
  });
});

describe('the Say menu, nothing typed', () => {
  it('offers the words known and Take leave - no letters to guess with (a word from a guide is added in Cheats)', async () => {
    const { labels } = await chuckles('');
    expect(labels).not.toContain('Other word');
    expect(labels.at(-1)).toBe('Take leave');
  });
});

describe('a menu, and the buttons', () => {
  it("takes no controller button for an item's own key: X is no Journal, Y no Map, Select no sign read", async () => {
    const { choose } = await import('../src/game/menu.ts');
    const { g, p } = newGame();
    g.options.input = 'controller';
    p.keys.push(Pad.X, Pad.Y, Pad.B);
    const items = [
      { label: 'Journal', key: Pad.X },
      { label: 'Map', key: Pad.Y },
      { label: 'Read sign', key: Pad.Select },
    ];
    expect(await choose(g, 'Commands', items)).toBe(-1);
    p.keys.push(Pad.Select);
    expect(await choose(g, 'Commands', items)).toBe(-1); // Select backs out of a menu, as Start does
  });
});
