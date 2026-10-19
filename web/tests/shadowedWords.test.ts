import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { talkToNpc } from '../src/game/talk.ts';
import { analyse } from '../tools/talk/analysis.ts';
import { newGame } from './helpers.ts';

/**
 * The Say list offers a reply by a word that reaches it (menu.ts sayMenu): not one an earlier keyword of the
 * townsman's answers first with something else (talk.ts findKeyword takes the first that matches).
 */
describe('a word another keyword answers first', () => {
  it("is not offered for Camile's True Master: Master is, and asks after Lord British", async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    for (const w of analyse(g).learnable.keys()) g.words.add(w);
    Object.assign(g.options, { input: 'controller', dialog: 'log' });
    Object.assign(g.s, { mapId: 19 }); // West Britanny
    const npc = 1;
    g.s.npcs[npc].fa = 18; // Camile (CASTLE.TLK)
    let labels: string[] = [];
    let asked = false;
    p.next = () => {
      const m = g.menuShown;
      if (m?.title !== 'Say') return Pad.A;
      if (asked) return Pad.B;
      labels = m.labels;
      const want = m.labels.indexOf('Master');
      if (want < 0) return Pad.B;
      if (m.at !== want) return K.Down;
      asked = true;
      return Pad.A;
    };
    await talkToNpc(g, npc);
    expect(labels).toContain('Master');
    expect(labels).not.toContain('True'); // her crops' word first: "Indeed they do!"
    expect(g.said).toContain('rightful ruler?');
  });
});
