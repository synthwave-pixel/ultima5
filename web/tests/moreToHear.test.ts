import { describe, expect, it } from 'vitest';
import type { Game } from '../src/game/game.ts';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { talkToNpc } from '../src/game/talk.ts';
import { newGame, type FakePlatform } from './helpers.ts';

/**
 * A conversation: `ask` in turn from the Say list, the first answer to each question (or, `anon`, the Avatar's name
 * kept back), then leave. Each line of the first Say list, and whether it was grey.
 */
async function converse(g: Game, p: FakePlatform, npc: number, ask: RegExp[] = [], anon = false): Promise<Map<string, boolean>> {
  const shown = new Map<string, boolean>(); // each line of the first Say list, and whether it was grey
  const left = [...ask];
  let first = true;
  p.next = () => {
    const m = g.menuShown;
    if (!m) return Pad.A;
    if (m.title !== 'Say') {
      const nothing = m.labels.indexOf('Say nothing');
      if (!anon || nothing < 0) return Pad.A;
      return m.at === nothing ? Pad.A : K.Down;
    }
    if (first) m.labels.forEach((l, i) => shown.set(l, m.dim[i]));
    first = false;
    const want = left.length ? m.labels.findIndex((l) => left[0].test(l)) : m.labels.indexOf('Take leave');
    if (want < 0) return Pad.B;
    if (m.at !== want) return m.at < want ? K.Down : K.Up;
    left.shift();
    return Pad.A;
  };
  await talkToNpc(g, npc);
  return shown;
}

/**
 * A reply heard greys on the Say list, but comes back white where more of it can be heard now than was (talk.ts
 * moreToHear): a question the party's karma opens, or an answer its question listens for that is now known.
 */
describe('a reply with more to hear than was heard', () => {
  // Honor and Mantra are one reply (Gruman's mant/hono): labelled by the first heard.
  const honor = (m: Map<string, boolean>): boolean | undefined => m.get('Honor') ?? m.get('Mantra');

  it("comes back white once the party's karma opens Gruman's mantra of Honor, and greys once he tells it", async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    Object.assign(g.options, { input: 'controller', dialog: 'log', rules: 'classic' });
    Object.assign(g.s, { mapId: 6, karma: 10 }); // Trinsic
    const npc = 9;
    g.s.npcs[npc].fa = 34;
    g.words.add('honor');
    await converse(g, p, npc, [/^Honor$/]); // too little karma: "If only thou seemed honorable..."
    expect(honor(await converse(g, p, npc))).toBe(true); // grey: heard, and nothing more to hear yet
    g.s.karma = 99;
    expect(honor(await converse(g, p, npc, [/^(Honor|Mantra)$/]))).toBe(false); // white: the mantra waits
    expect(honor(await converse(g, p, npc))).toBe(true); // told: grey again
  });

  it("stays grey where the party declined what lay behind it: No to Gruman's mantra, whatever the karma", async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    Object.assign(g.options, { input: 'controller', dialog: 'log', rules: 'classic' });
    Object.assign(g.s, { mapId: 6, karma: 99 });
    const npc = 9;
    g.s.npcs[npc].fa = 34;
    g.words.add('honor');
    const left = [/^Honor$/];
    p.next = () => {
      const m = g.menuShown;
      if (!m) return Pad.A;
      if (m.title !== 'Say') return m.labels[m.at] === 'No' ? Pad.A : K.Down; // "Dost thou seek the Mantra?" No
      const want = left.length ? m.labels.findIndex((l) => left[0].test(l)) : m.labels.indexOf('Take leave');
      if (m.at !== want) return m.at < want ? K.Down : K.Up;
      left.shift();
      return Pad.A;
    };
    await talkToNpc(g, npc);
    expect(honor(await converse(g, p, npc))).toBe(true);
  });

  it('comes back white once Joshua knows the Avatar, whose question waits on it, and greys once it is asked', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    Object.assign(g.options, { input: 'controller', dialog: 'log' });
    Object.assign(g.s, { mapId: 20 }); // North Britanny
    const npc = 3;
    g.s.npcs[npc].fa = 22;
    g.words.add('dawn');
    await converse(g, p, npc, [/^Dawn$/], true); // the password, said back: his name asked, and kept from him
    expect((await converse(g, p, npc)).get('Dawn')).toBe(true);
    g.s.npcMet[(g.s.mapId - 1) * 4 + (npc >> 3)] |= 1 << (npc & 7); // the Avatar's name given him
    expect((await converse(g, p, npc, [/^Dawn$/])).get('Dawn')).toBe(false); // "Dost thou serve the Resistance?" waits
    expect((await converse(g, p, npc)).get('Dawn')).toBe(true);
  });

  it('comes back white once a word its question listens for is known, and greys once it is given', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    Object.assign(g.options, { input: 'controller', dialog: 'log' });
    Object.assign(g.s, { mapId: 20 });
    const npc = 3;
    g.s.npcs[npc].fa = 22;
    g.s.npcMet[(g.s.mapId - 1) * 4 + (npc >> 3)] |= 1 << (npc & 7);
    // Dawn heard of, said to him, and his "What didst thou say?" answered with what he does not listen for.
    g.words.add('dawn');
    let said = false;
    p.next = () => {
      const m = g.menuShown;
      if (!m) return Pad.A;
      if (m.title === 'Say') {
        if (said) return m.labels[m.at] === 'Take leave' ? Pad.A : K.Up;
        const want = m.labels.indexOf('Dawn');
        if (m.at !== want) return m.at < want ? K.Down : K.Up;
        said = true;
        return Pad.A;
      }
      return m.labels[m.at] === 'I know not' ? Pad.A : K.Down; // not the password
    };
    await talkToNpc(g, npc);
    expect((await converse(g, p, npc)).get('Dawn')).toBe(false); // the password unsaid: still to hear
  });
});
