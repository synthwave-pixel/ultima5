import { describe, expect, it } from 'vitest';
import { Pad } from '../src/game/io.ts';
import { audioLines, pauseMenu, settingLines } from '../src/game/menu.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/** A line's name, without its state ("UX: Modern" is UX). */
const names = (labels: string[]): string[] => labels.map((l) => l.replace(/:.*$/, ''));

/**
 * The settings at the title and in play, kept in step (menu.ts): the same lines of how the game looks in Settings, and
 * Audio and Gameplay a list each - Settings' at the title, the Pause menu's in play - the music and sound in Audio alone.
 */
describe('the settings, at the title and in play', () => {
  it("show the same look in Settings, the title's with Audio and Gameplay, play's with the saved game's carrying", () => {
    const { g } = newGame();
    const title = names(settingLines(g, true).map((l) => l.label));
    const play = names(settingLines(g, false).map((l) => l.label));
    expect(title.filter((l) => l !== 'Audio' && l !== 'Gameplay')).toEqual(play.filter((l) => !/saved game/.test(l)));
    expect(title.slice(-2)).toEqual(['Audio', 'Gameplay']);
  });

  it('keep the music and sound in Audio: none of it in Settings, nor on the Pause menu, which opens Audio', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    expect(names(audioLines(g).map((l) => l.label))).toEqual(['Back', 'Music', 'Music level', 'Sound FX', 'Sound FX level']);
    for (const title of [true, false]) expect(settingLines(g, title).some((l) => /^(Music|Sound)/.test(l.label))).toBe(false);
    let pause: string[] = [];
    p.next = () => {
      pause = g.menuShown?.labels ?? pause;
      return Pad.B;
    };
    await pauseMenu(g);
    expect(pause).toContain('Audio');
    expect(pause).toContain('Gameplay');
    expect(pause.some((l) => /^(Music|Sound)/.test(l))).toBe(false);
  });
});
