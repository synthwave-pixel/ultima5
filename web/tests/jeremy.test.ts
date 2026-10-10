import { describe, expect, it } from 'vitest';
import type { Game } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { stashWorldActors } from '../src/game/outdoors.ts';
import { journeyOnward } from '../src/game/run.ts';
import { enterTown, loadLevel, townLoop } from '../src/game/town.ts';
import { newGame, type FakePlatform } from './helpers.ts';

class Done extends Error {}

const TALK = 0x54;

/** Everything printed, its line breaks (where the narrow message column wrapped) made spaces. */
const heard = (p: FakePlatform): string => p.log.replace(/\s+/g, ' ');

/** In Yew's jail at ten in the morning, in the cell an arrest wakes the party in, at its door: Jeremy outside it. */
async function inCell(gold: number, keys: number): Promise<{ g: Game; p: FakePlatform }> {
  const { g, p } = newGame();
  journeyOnward(g);
  const s = g.s;
  stashWorldActors(g);
  Object.assign(s, { mapId: 4, level: 0, x: 15, y: 30, hour: 10 });
  await enterTown(g, true);
  Object.assign(s, { x: 25, y: 5, gold, keys });
  loadLevel(g, true);
  s.activeMember = 0;
  return { g, p };
}

/**
 * Played by the letters, as path-items.test.ts plays: a key, or a word typed whole; a pause in the talk ("press a
 * key") answered with Enter between them. Then the game is stopped.
 */
async function say(g: Game, p: FakePlatform, script: (number | string)[]): Promise<void> {
  const typed: number[] = [];
  let at = 0;
  p.next = () => {
    if (typed.length) return typed.shift();
    if (g.recording !== null && !/:\s*$/.test(p.log)) return K.Enter;
    if (at >= script.length) throw new Done();
    const step = script[at++];
    if (typeof step === 'number') return step;
    typed.push(...[...step].map((c) => c.charCodeAt(0)));
    return typed.shift();
  };
  try {
    await townLoop(g);
  } catch (e) {
    if (!(e instanceof Done)) throw e;
  }
}

/** Talk to Jeremy through the cell's door: KEY, answered `answer`, `times` over. */
const askKeys = (answer: 'Y' | 'N', times: number): (number | string)[] => [
  TALK,
  K.Down,
  ...Array.from({ length: times }, () => ['KEY\r', answer]).flat(),
  'BYE\r',
];

/**
 * Jeremy, Yew's chef (talk.ts JEREMY): "Have five!" - the keys given before he asks 50 gold for them. One who pays
 * gets five each time; one who cannot keeps no more than five of all held, however often asked (issue #4); one who
 * refuses keeps them, as 1988 has it, for karma.
 */
describe("Jeremy's keys", () => {
  it('gives a broke prisoner five, enough for the cell door, and no more however often asked', async () => {
    const { g, p } = await inCell(0, 0);
    await say(g, p, askKeys('Y', 25));
    expect(heard(p).match(/not enough gold/g)).toHaveLength(25);
    expect(g.s.keys).toBe(5);
    expect(g.s.gold).toBe(0);
  });

  it('tops up a broke one with fewer than five to five, and gives one with five or more none', async () => {
    const few = await inCell(10, 3);
    await say(few.g, few.p, askKeys('Y', 1));
    expect(few.g.s.keys).toBe(5);
    const many = await inCell(10, 7);
    await say(many.g, many.p, askKeys('Y', 2));
    expect(many.g.s.keys).toBe(7);
  });

  it('keeps the cap across conversations: talked to again, still five', async () => {
    const { g, p } = await inCell(0, 0);
    await say(g, p, [...askKeys('Y', 1), ...askKeys('Y', 1)]);
    expect(heard(p).match(/Have five/g)).toHaveLength(2);
    expect(g.s.keys).toBe(5);
  });

  it('sells five each time to one who pays', async () => {
    const { g, p } = await inCell(500, 0);
    await say(g, p, askKeys('Y', 2));
    expect(heard(p)).toMatch(/most gracious/);
    expect(g.s.keys).toBe(10);
    expect(g.s.gold).toBe(400);
  });

  it('lets one who refuses keep them, for karma, as 1988 has it', async () => {
    const { g, p } = await inCell(500, 0);
    const karma = g.s.karma;
    await say(g, p, askKeys('N', 1));
    expect(heard(p)).toMatch(/Scoundrel/);
    expect(g.s.keys).toBe(5);
    expect(g.s.karma).toBe(karma - 3);
    expect(g.s.gold).toBe(500);
  });
});
