import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { talkToNpc } from '../src/game/talk.ts';
import { analyse } from '../tools/talk/analysis.ts';
import { newGame } from './helpers.ts';

/**
 * Two townsmen's files that lost a word, put right (talk.ts SCRIPT_FIXES): Weblock's GORN and HASS share "He is a
 * prisoner in the dungeon!", and the keywords after them are his (a keyword that is no word, where another file has
 * one, keeps its place and is passed over: keywordsOf); Sir Arbuthnot's "Art thou the one true Avatar?" listens for
 * Yes again, which his honour answers (an answer that is no word leaves a question a yes or no: answerMenu).
 */
describe("a word lost from a townsman's file", () => {
  it("leaves the rest of Weblock's on the Say list, each answered as typed in 1988", async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    for (const w of analyse(g).learnable.keys()) g.words.add(w);
    Object.assign(g.options, { input: 'controller', dialog: 'log' });
    Object.assign(g.s, { mapId: 18 }); // Blackthorn's palace
    const npcs = g.data.files.get('CASTLE.NPC');
    const npc = [...Array(32).keys()].find((i) => npcs[0x240 + 0x220 + i] === 14)!;
    g.s.npcs[npc].fa = 14; // Weblock
    let labels: string[] = [];
    const asked = new Set<string>();
    let heard = ''; // what was said, as it was said (the log keeps only its last lines)
    p.next = () => {
      heard += g.said.replace(/\s+/g, ' ');
      const m = g.menuShown;
      if (m?.title !== 'Say') return Pad.A;
      if (!labels.length) labels = m.labels;
      let at = m.labels.findIndex((l) => !asked.has(l) && l !== 'Take leave');
      if (at < 0) at = m.labels.indexOf('Take leave');
      else if (m.at === at) asked.add(m.labels[at]);
      return m.at === at ? Pad.A : m.at < at ? K.Down : K.Up;
    };
    await talkToNpc(g, npc);
    for (const l of ['Kitchen', 'Foyer', 'Dungeon', 'Roof', 'Stables', 'Throne']) expect(labels).toContain(l);
    expect(heard).toContain(':gorn "He is a prisoner in the dungeon!"'); // not "hass"
    expect(heard).toContain('Go up the ladder in the main foyer.'); // the kitchen
    expect(heard).toContain('Take the ladder down.'); // the stables
  });

  it('answers Sir Arbuthnot\'s "Art thou the one true Avatar?" Yes, with his honour and the Avatar\'s name asked', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    for (const w of analyse(g).learnable.keys()) g.words.add(w);
    Object.assign(g.options, { input: 'controller', dialog: 'log' });
    // Greyhaven, among the dwellings (maps 9 to 16), and his place in it.
    const npcs = g.data.files.get('DWELLING.NPC');
    const at = [...Array(8 * 32).keys()].find((k) => npcs[(k >> 5) * 0x240 + 0x220 + (k & 31)] === 15)!;
    const npc = at & 31;
    Object.assign(g.s, { mapId: 9 + (at >> 5) });
    g.s.npcs[npc].fa = 15; // Sir Arbuthnot
    let offered: string[] | null = null;
    let heard = '';
    let said = false;
    p.next = () => {
      const m = g.menuShown;
      if (!m) return Pad.A;
      if (m.title === 'Say') {
        if (said) return m.labels[m.at] === 'Take leave' ? Pad.A : K.Up;
        const at = m.labels.indexOf('Avatar');
        if (m.at !== at) return m.at < at ? K.Down : K.Up;
        said = true;
        return Pad.A;
      }
      if (/Art thou the one true Avatar\?"?\s*You respond-\s*:\s*$/.test(g.said.replace(/\s+/g, ' ')) && offered === null)
        offered = m.labels;
      heard += g.said.replace(/\s+/g, ' ');
      if (m.labels.includes('Say nothing')) return Pad.A; // the Avatar's name, given
      return m.labels[m.at] === 'Yes' ? Pad.A : K.Down; // Yes: of the Avatar, and the Avatar
    };
    await talkToNpc(g, npc);
    expect(offered).toEqual(['Yes', 'No']);
    expect(heard).toContain(`"'Tis indeed an honor!" "What is thy name?"`);
    expect(g.s.npcMet[(g.s.mapId - 1) * 4 + (npc >> 3)] & (1 << (npc & 7))).not.toBe(0); // he knows the Avatar now
  });
});
