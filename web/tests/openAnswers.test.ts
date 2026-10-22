import { describe, expect, it } from 'vitest';
import { saysWord } from '../src/game/cmds.ts';
import { Pad } from '../src/game/io.ts';
import { OPEN_ANSWERS } from '../src/game/openAnswers.ts';
import { journeyOnward } from '../src/game/run.ts';
import { talkToNpc } from '../src/game/talk.ts';
import { townsfolk } from '../tools/talk/reach.ts';
import { newGame } from './helpers.ts';

/**
 * The answers written for a question that listens for nothing and reads as no yes or no (openAnswers.ts, menu.ts
 * answerMenu): each such a question, each answer one a player could have typed and that says nothing else.
 */
describe('the answers written for an open question', () => {
  const { g } = newGame();
  const folk = townsfolk(g);

  it('are each for a question that listens for nothing, every answer going on the same way', () => {
    for (const key of Object.keys(OPEN_ANSWERS)) {
      const [file, talk, label] = key.split(':');
      const t = folk.find((x) => x.key === `${file}:${talk}`);
      expect(t, `${key}: a conversation`).toBeDefined();
      const b = t!.blocks.get(parseInt(label, 16));
      expect(b, `${key}: a question of ${t!.name}'s`).toBeDefined();
      expect(b!.text, `${key}: asks`).toMatch(/\?\W*$/);
      expect(b!.replies, `${key}: listens for nothing`).toEqual([]);
    }
  });

  it('say nothing the game answers itself - a name, a job, a farewell, swearing - and fit what 1988 let be typed', () => {
    const standard = g.data.table(0x4aa8, 0x22);
    for (const [key, answers] of Object.entries(OPEN_ANSWERS))
      for (const a of answers) {
        expect(a.length, `${key} ${a}`).toBeLessThanOrEqual(15);
        for (const w of standard) expect(saysWord(w, a.toUpperCase()), `${key} "${a}" says ${w}`).toBe(false);
      }
  });

  it("offers Camile's answers in place of Yes and No, and her talk goes on as it did", async () => {
    const { g: game, p } = newGame();
    journeyOnward(game);
    Object.assign(game.options, { input: 'controller', dialog: 'log' });
    Object.assign(game.s, { mapId: 19 }); // West Britanny
    const npc = 1;
    game.s.npcs[npc].fa = 18; // Camile
    game.s.npcMet[(19 - 1) * 4 + (npc >> 3)] |= 1 << (npc & 7); // she knows the Avatar: her greeting asks
    const offered: string[][] = [];
    let heard = '';
    p.next = () => {
      heard += game.said.replace(/\s+/g, ' ');
      const m = game.menuShown;
      if (m?.title === 'Answer') offered.push(m.labels);
      return m?.title === 'Say' ? Pad.B : Pad.A;
    };
    await talkToNpc(game, npc);
    heard += game.said.replace(/\s+/g, ' ');
    expect(offered.slice(0, 2)).toEqual([
      ['Well', 'Poorly'],
      ['Well enough', 'Hard going'],
    ]);
    expect(heard).toContain(':WELL "Hmmm... How hath thy journeys fared?"');
    expect(heard).toContain(':WELL ENOUGH "I see, what canst I do for thee today?"');
  });
});
