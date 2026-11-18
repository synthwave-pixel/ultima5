import { describe, expect, it } from 'vitest';
import { cardOf } from '../src/game/characterMenu.ts';
import { savedWhen } from '../src/game/storage.ts';
import { serialize } from '../src/game/ultima5Saves.ts';
import { newGame } from './helpers.ts';

/**
 * A character's card (characterMenu.ts cardOf), in Journey Onward's picker and Delete Character: the Avatar's name and
 * level, where they saved, and when, each read from the save (through the game's SaveCodec).
 */
describe('a character’s card', () => {
  it('names the Avatar and their level, where they saved and when', () => {
    const { g } = newGame();
    g.s.members[0].name = 'Shalom';
    g.s.members[0].level = 5;
    const card = cardOf(g, serialize(g));
    expect(card.map((i) => i.label)).toEqual(['Shalom, level 5', "Iolo's Hut", savedWhen(serialize(g).written)]);
    expect(card.map((i) => i.enabled)).toEqual([undefined, false, false]);
  });

  it('stands "The nameless" for a save with no name', () => {
    const { g } = newGame();
    g.s.members[0].name = '';
    expect(cardOf(g, serialize(g))[0].label).toMatch(/^The nameless, level \d+$/);
  });
});
