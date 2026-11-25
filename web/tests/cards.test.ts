import { describe, expect, it } from 'vitest';
import { cardOf, cardsOf } from '../src/game/characterMenu.ts';
import { saveCodec, useSaves, type StoredSave } from '../src/game/saveCodec.ts';
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

  it('shows a detail word before where the save was made, where the game gives one, and none where it gives none', () => {
    const { g } = newGame();
    g.s.members[0].name = 'Shalom';
    g.s.members[0].level = 5;
    const u5 = saveCodec();
    expect('cardDetail' in u5).toBe(false); // Ultima V's cards are as they were
    const where = cardOf(g, serialize(g))[1].label;
    useSaves({ ...u5, cardDetail: () => 'Bard' });
    const card = cardOf(g, serialize(g));
    expect(card[0].label).toBe('Shalom, level 5');
    expect(card[1].label).toBe(`Bard, ${where}`);
    useSaves({ ...u5, cardDetail: () => undefined });
    expect(
      cardOf(g, serialize(g))
        .map((c) => c.label)
        .slice(0, 2),
    ).toEqual(['Shalom, level 5', where]);
    useSaves(u5);
  });

  it('leaves the detail off where it would run past the box, the place kept whole', () => {
    const { g } = newGame();
    const u5 = saveCodec();
    useSaves({ ...u5, cardDetail: () => 'Shepherd', where: () => "Serpent's Hold" }); // 24 letters with the detail
    expect(cardOf(g, serialize(g))[1].label).toBe("Serpent's Hold");
    useSaves({ ...u5, cardDetail: () => 'Bard', where: () => "Serpent's Hold" }); // 20
    expect(cardOf(g, serialize(g))[1].label).toBe("Bard, Serpent's Hold");
    useSaves(u5);
  });
});

describe('cards that would read the same', () => {
  /** A save of `name` at `level`, written at the same minute as the others. */
  const save = (name: string, level = 2, detail?: string): StoredSave => {
    const { g } = newGame();
    g.s.members[0].name = name;
    g.s.members[0].level = level;
    return { ...serialize(g), written: 1_764_000_000_000, ...(detail ? { detail } : {}) };
  };
  const names = (cards: { label: string }[]): string[] => cards.filter((_, i) => i % 3 === 0).map((c) => c.label);

  it('are told apart by a (2), a (3), the first as it was', () => {
    const { g } = newGame();
    expect(names(cardsOf(g, [save('Kestrel'), save('Wren'), save('Kestrel'), save('Kestrel')]))).toEqual([
      'Kestrel, level 2',
      'Wren, level 2',
      'Kestrel, level 2 (2)',
      'Kestrel, level 2 (3)',
    ]);
  });

  it('are not tagged where the detail tells them apart', () => {
    const saves = [save('Kestrel', 2, 'Bard'), save('Kestrel', 2, 'Mage'), save('Kestrel', 2, 'Bard')];
    const { g } = newGame();
    const u5 = saveCodec();
    useSaves({ ...u5, cardDetail: (d) => (d as StoredSave & { detail?: string }).detail });
    expect(names(cardsOf(g, saves))).toEqual(['Kestrel, level 2', 'Kestrel, level 2', 'Kestrel, level 2 (2)']);
    useSaves(u5);
  });

  it("fit the box with the tag on Ultima V's longest: an eight-letter name at level 8", () => {
    const { g } = newGame();
    const [, second] = names(cardsOf(g, [save('Lysander', 8), save('Lysander', 8)]));
    expect(second).toBe('Lysander, level 8 (2)');
    expect(second.length).toBeLessThanOrEqual(21); // the menus' width (menu.ts WIDTH)
  });
});
