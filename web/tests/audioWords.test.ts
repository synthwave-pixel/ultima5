import { afterEach, describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/gameCore.ts';
import { audioLines } from '../src/game/menu.ts';
import { musicNote, soundNote, useAudioWords } from '../src/game/settings.ts';
import { FakePlatform } from './helpers.ts';

/**
 * The Audio lines in a game's own words (settings.ts useAudioWords), where they differ from Ultima V's: a Sound
 * choice's note and the Music level's. The other game's words here are invented.
 */

afterEach(() => useAudioWords(null));

/** The notes of the Sound line and the Music level line, with Sound set to `choice`. */
function notes(choice: 'classical' | 'upgrade'): [string, string] {
  const g = new GameCore(new FakePlatform());
  g.options.soundChoice = choice;
  const lines = audioLines(g);
  const note = (start: string): string => lines.find((l) => l.label.startsWith(start))?.note ?? '';
  return [note('Sound:'), note('Music level')];
}

describe('the Audio lines', () => {
  it('say Ultima V’s words unless a game gives its own', () => {
    expect(notes('upgrade')).toEqual([
      "Upgrade (2001): the Upgrade's MIDI and 1988's PC speaker.",
      "The Upgrade's music: Off, or 10% to 100%.",
    ]);
    expect(soundNote('upgrade')).toBeUndefined();
    expect(musicNote()).toBeUndefined();
  });

  it('say a game’s own where it gives them, Ultima V’s for the rest, and Ultima V’s again after', () => {
    useAudioWords({ sound: { upgrade: 'Upgrade (2001): a tin whistle.' }, music: 'The fan music: Off, or 10% to 100%.' });
    expect(notes('upgrade')).toEqual(['Upgrade (2001): a tin whistle.', 'The fan music: Off, or 10% to 100%.']);
    expect(notes('classical')[0]).toBe('Classical (2026): orchestra, consort, piano; effects to match.');
    useAudioWords(null);
    expect(notes('upgrade')[0]).toBe("Upgrade (2001): the Upgrade's MIDI and 1988's PC speaker.");
  });
});
