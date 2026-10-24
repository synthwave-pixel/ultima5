import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { talkToNpc } from '../src/game/talk.ts';
import { newGame } from './helpers.ts';

/**
 * "Your interest?" with the Dialog setting's Play (talk.ts interest, the port's): once in the log, then its colon
 * alone before each word asked - the townsman's words being the box's, the log a list of what the party asked. With
 * Log, 1988's prompt every time; and the conversation heard, for the journal, has it every time either way.
 */
describe('"Your interest?"', () => {
  const talk = async (dialog: 'play' | 'log') => {
    const { g, p } = newGame();
    journeyOnward(g);
    Object.assign(g.options, { input: 'controller', dialog });
    g.s.mapId = 19; // West Britanny
    const npc = 1;
    g.s.npcs[npc].fa = 18; // Camile
    // The wind's rolls kept out of it, which Play's box, drawing the view more often, rolls more of: whether a stranger
    // gives their name is rolled too (talk.ts greet).
    const roll = g.random.bind(g);
    g.random = (low: number, high: number) => (/shiftWind/.test(new Error().stack ?? '') ? high : roll(low, high));
    let log = '';
    let heard = '';
    const gg = g as unknown as { remember: (t: string) => void };
    const remember = gg.remember.bind(g);
    gg.remember = (t: string) => {
      if (g.p.text.current === 2) log += t;
      remember(t);
      if (g.recording !== null) heard = g.recording;
    };
    // Four words asked from the Say list, one after another round it (never Take leave), then leave.
    let asked = 0;
    p.next = () => {
      const m = g.menuShown;
      if (m?.title !== 'Say') return Pad.A;
      if (asked >= 4) return Pad.B;
      const words = m.labels.map((_, n) => n).filter((n) => m.labels[n] !== 'Take leave');
      const want = words[(asked + 1) % words.length];
      if (m.at !== want) return m.at < want ? K.Down : K.Up;
      asked++;
      return Pad.A;
    };
    await talkToNpc(g, npc);
    return { log, heard, asked, notes: g.notes.map((n) => JSON.stringify(n)) };
  };

  it('is asked once in the log with Play, its colon alone after, and every time with Log', async () => {
    const play = await talk('play');
    const log = await talk('log');
    expect(play.asked).toBeGreaterThan(3);
    expect(play.log.match(/Your interest\?/g)).toHaveLength(1);
    expect(log.log.match(/Your interest\?/g)!.length).toBeGreaterThan(3);
    // What the party asked is in the log either way, after a colon of its own.
    const words = (t: string) => [...t.matchAll(/^:([A-Za-z][A-Za-z ]*)$/gm)].map((m) => m[1]);
    expect(words(play.log)).toEqual(words(log.log));
    expect(words(play.log).length).toBeGreaterThan(3);
    // With Play, one empty line between one word asked and the next - 1988's two being for the reply between them.
    expect(play.log).toMatch(/^:[A-Za-z ]+\n\n:/m);
    expect(play.log).not.toMatch(/\n\n\n/); // never two empty lines
    expect(play.log).not.toMatch(/^:[^\n]+\n(?!\n)/m); // and one after every word, the name too
    expect(log.log).toMatch(/^:[A-Za-z ]+\n\n\n/m);
    // The conversation heard (the journal's) has the prompt before every word, with Play as with Log.
    expect(play.heard.match(/Your interest\?/g)!.length).toBe(log.heard.match(/Your interest\?/g)!.length);
    // And the journal notes the same of it.
    expect(play.notes.length).toBeGreaterThan(0);
    expect(play.notes).toEqual(log.notes);
  });
});
