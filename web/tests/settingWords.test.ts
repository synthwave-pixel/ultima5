import { afterEach, describe, expect, it } from 'vitest';
import { appearanceLines, gameplayLines } from '../src/game/menu.ts';
import { settingWords, useSettingWords, type FontChoice, type Rules } from '../src/game/settings.ts';
import { newGame } from './helpers.ts';

/** Ultima V's own notes, as the Gameplay and Appearance lines say them with no game's words set. */
const RULES: Record<Rules, string> = {
  story: 'As Modern, never hungry, fights eased more.',
  modern: 'Poison, hunger never kill; XP shared; fights eased; a deeper Path.',
  classic: 'As in 1988, as the Apple II has it: deadly.',
};
const INTERFACE = {
  standard: "Enhanced: smooth motion, combat aids. Retro: 1988's.",
  original: "Retro: 1988's. Enhanced: smooth motion, combat aids.",
};
const STATUS = "P, S, D or C on the frame beside a member, as well as their name's colour.";
const FONT: Record<FontChoice, string> = {
  sixtyfour: "SixtyFour: the Modern look's own letters.",
  legible: 'Legible: Atkinson Hyperlegible Mono. Story pages too.',
  dyslexic: 'Dyslexic: OpenDyslexic Mono. Story pages too.',
  dos: "DOS: the 1988 game's own letters, 8 by 8.",
};

/** The notes the Rules, Interface, Status letters and Font lines say now, by the options set. */
function notes(g: ReturnType<typeof newGame>['g']): { rules: string; interface: string; status: string; font: string } {
  const note = (lines: { label: string; note?: string }[], start: string): string =>
    lines.find((l) => l.label.startsWith(start))?.note ?? '';
  return {
    rules: note(gameplayLines(g), 'Rules:'),
    interface: note(gameplayLines(g), 'Interface:'),
    status: note(appearanceLines(g), 'Status letters:'),
    font: note(appearanceLines(g), 'Font:'),
  };
}

/** The Settings notes a game words its own way (settings.ts useSettingWords), Ultima V's where it gives none. */
describe("a game's own words for the settings' notes", () => {
  afterEach(() => useSettingWords(null));

  it("are Ultima V's own with none set", () => {
    const { g } = newGame();
    expect(settingWords()).toEqual({});
    for (const rules of ['story', 'modern', 'classic'] as const)
      for (const tileSet of ['standard', 'original'] as const)
        for (const font of ['sixtyfour', 'legible', 'dyslexic', 'dos'] as const) {
          Object.assign(g.options, { rules, tileSet, font });
          expect(notes(g)).toEqual({ rules: RULES[rules], interface: INTERFACE[tileSet], status: STATUS, font: FONT[font] });
        }
  });

  it("are the game's where it gives them, Ultima V's where it does not, and Ultima V's again once set back", () => {
    const { g } = newGame();
    useSettingWords({
      rules: { classic: 'As in 1066.' },
      interface: { original: 'Retro: 1066.' },
      statusLetters: 'P or Z.',
      font: { dos: 'DOS: 1066.' },
    });
    Object.assign(g.options, { rules: 'classic', tileSet: 'original', font: 'dos' });
    expect(notes(g)).toEqual({ rules: 'As in 1066.', interface: 'Retro: 1066.', status: 'P or Z.', font: 'DOS: 1066.' });
    Object.assign(g.options, { rules: 'modern', tileSet: 'standard', font: 'legible' });
    expect(notes(g)).toEqual({ rules: RULES.modern, interface: INTERFACE.standard, status: 'P or Z.', font: FONT.legible });
    useSettingWords(null);
    Object.assign(g.options, { rules: 'classic', tileSet: 'original', font: 'dos' });
    expect(notes(g)).toEqual({ rules: RULES.classic, interface: INTERFACE.original, status: STATUS, font: FONT.dos });
  });
});
