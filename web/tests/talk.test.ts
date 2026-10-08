import { describe, expect, it } from 'vitest';
import { K } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { recite, talkToNpc } from '../src/game/talk.ts';
import { enterTown } from '../src/game/town.ts';
import { keys, newGame } from './helpers.ts';
import { RUNE_INK } from '../src/game/runeWords.ts';

describe('talk', () => {
  it('holds a conversation from the TLK script in Britain', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    g.s.mapId = 2;
    g.s.level = 0;
    g.s.hour = 12;
    await enterTown(g, true);
    const npc = [...g.s.npcs.keys()].find((i) => i > 0 && g.s.npcs[i].fa > 0 && g.s.npcs[i].fa < 0x80)!;
    p.log = '';
    p.keys.push(...keys('NAME', K.Enter, 'JOB', K.Enter, K.Enter), ...Array<number>(20).fill(K.Enter));
    await talkToNpc(g, npc);
    console.log(p.log);
    expect(p.log).toContain('You see');
    expect(p.log).toContain('Your interest?');
    expect(p.log).toMatch(/My name is/);
  });
});

describe('shops', () => {
  it('sells keys, gems and torches at the guild', async () => {
    const { merchant } = await import('../src/game/shops.ts');
    const { g, p } = newGame();
    journeyOnward(g);
    g.s.mapId = 2;
    g.s.hour = 12;
    await enterTown(g, true);
    // Find a guild (kind 0x86) whose town has one.
    const maps = g.data.bytes(0x23ca + 5 * 16, 16);
    g.s.mapId = maps[0];
    await enterTown(g, true);
    g.s.gold = 500;
    const keys0 = g.s.keys;
    p.log = '';
    p.keys.push(...keys('Y', 'A', 'Y', K.Space), ...Array<number>(10).fill(K.Space));
    await merchant(g, 0x86);
    console.log(p.log);
    expect(g.s.keys).toBe(keys0 + 3);
    expect(g.s.gold).toBeLessThan(500);
  });
});

describe('a line recited (the runes page)', () => {
  /** A TOWNE.TLK script, to where the next begins, and the start of its line with `word` said in runes. */
  const lineWith = (g: ReturnType<typeof newGame>['g'], word: string): { script: Uint8Array; at: number } => {
    const d = g.data.files.get('TOWNE.TLK');
    const count = d[0] | (d[1] << 8);
    const offsets = Array.from({ length: count }, (_, i) => d[4 + i * 4] | (d[5 + i * 4] << 8));
    const ends = [...offsets].sort((a, b) => a - b);
    // The word's letters (bit 7 set, as every letter of a script is) between the switches of runes on and off.
    const runes = [0x8e, ...[...word].map((c) => c.charCodeAt(0) | 0x80), 0x8e];
    for (const offset of offsets) {
      const script = d.subarray(offset, ends.find((e) => e > offset) ?? d.length);
      const hit = script.findIndex((_, i) => runes.every((b, j) => script[i + j] === b));
      if (hit < 0) continue;
      let at = hit;
      while (at > 0 && script[at - 1] !== 0) at--;
      return { script, at };
    }
    throw new Error(`no line says ${word}`);
  };

  it('says a line as the conversation would, its runes in the rune font, and stops at its end', async () => {
    const { g, p } = newGame();
    const { script, at } = lineWith(g, 'AHM');
    const fonts: number[] = [];
    const print = g.text.printChar.bind(g.text);
    g.text.printChar = (ch: number) => {
      if (ch > 0x20) fonts.push(g.text.font);
      print(ch);
    };
    p.log = '';
    await recite(g, script, at);
    expect(p.log).toContain('chanting');
    expect(p.log).toContain('AHM');
    expect(fonts).toContain(1);
    expect(fonts).toContain(0);
    expect(g.text.font).toBe(0);
  });

  it("reads a word said in runes in its kind's colour: a mantra blue, a dungeon's Word red, and none after", async () => {
    const { g, p } = newGame();
    const inks: (number | null)[] = [];
    p.fx.readInk = (rgb) => void inks.push(rgb);
    p.keys.push(...Array<number>(40).fill(0x20)); // for a line's waits
    for (const [word, kind] of [
      ['AHM', 'good'],
      ['FALLAX', 'evil'],
      ['DAWN', 'neutral'],
    ] as const) {
      inks.length = 0;
      const { script, at } = lineWith(g, word);
      await recite(g, script, at);
      expect(inks, word).toContain(RUNE_INK[kind]);
      expect(inks.at(-1), word).toBeNull();
    }
  });
});
