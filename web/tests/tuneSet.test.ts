import { afterEach, describe, expect, it } from 'vitest';
import { arrangementsFor, arrangementsOf, PICKS } from '../src/audio/soundtracks.ts';
import { heardOnce, tuneSet, tuneSource, useTunes, type TuneSet } from '../src/audio/tuneSet.ts';
import { HEARD_ONCE, TUNE_FILES, ULTIMA5_TUNES } from '../src/game/music.ts';
import { MUSIC } from '../src/ui/music.ts';
import { renderJobs } from '../tools/music/render.ts';

/**
 * A game's own tunes (audio/tuneSet.ts): Ultima V's unless its entry sets its own - their names, where their notes
 * are, which are heard once, the soundtracks' picks, the render's manifest and the folder they lie in - read by the
 * player (ui/sound.ts) and the render (tools/music/render.ts).
 */

/** Another game's two tunes, invented: the second the second sequence of a file holding both. */
const OTHER: TuneSet = {
  names: ['ONE', 'TWO'],
  sources: { TWO: { file: 'BOTH.XMI', sequence: 1 } },
  heardOnce: ['TWO'],
  picks: { ONE: { classical: { usual: ['piano'] }, electronic: { usual: ['grid'] } } },
  manifest: {},
  folder: 'other',
  manifestFile: 'src/other.json',
};

afterEach(() => useTunes(null));

describe('a game’s tunes', () => {
  it('are Ultima V’s unless a game sets its own', () => {
    expect(tuneSet()).toBe(ULTIMA5_TUNES);
    expect(ULTIMA5_TUNES.names).toEqual(TUNE_FILES);
    expect(ULTIMA5_TUNES.heardOnce).toEqual(HEARD_ONCE);
    expect(ULTIMA5_TUNES.picks).toBe(PICKS);
    expect(ULTIMA5_TUNES.manifest).toBe(MUSIC);
    expect(ULTIMA5_TUNES.folder).toBe('music');
    expect(ULTIMA5_TUNES.manifestFile).toBe('src/audio/musicManifest.json');
    expect(heardOnce('REUNION.XMI')).toBe(true);
    expect(heardOnce('BRITLAND.XMI')).toBe(false);
  });

  it('are a second game’s once it sets them, and Ultima V’s again after', () => {
    useTunes(OTHER);
    expect(tuneSet()).toBe(OTHER);
    expect(heardOnce('TWO')).toBe(true);
    expect(heardOnce('ONE')).toBe(false);
    expect(heardOnce('REUNION.XMI')).toBe(false);
    expect(tuneSource(OTHER, 'ONE')).toEqual({ file: 'ONE', sequence: 0 });
    expect(tuneSource(OTHER, 'TWO')).toEqual({ file: 'BOTH.XMI', sequence: 1 });
    expect(arrangementsFor('classical', 'ONE', undefined, OTHER.picks)).toEqual(['piano']);
    expect(arrangementsFor('electronic', 'ONE', 'title', OTHER.picks)).toEqual(['grid']);
    expect(arrangementsFor('classical', 'TWO', undefined, OTHER.picks)).toEqual(['remastered']);
    expect(arrangementsOf('ONE', OTHER.picks)).toEqual(['original', 'remastered', 'piano', 'grid']);
    useTunes(null);
    expect(tuneSet()).toBe(ULTIMA5_TUNES);
  });
});

describe('the render', () => {
  it('makes Ultima V’s tunes as before: each in every arrangement a soundtrack plays, from its own file', () => {
    expect(renderJobs(ULTIMA5_TUNES, [])).toEqual(
      TUNE_FILES.flatMap((tune) =>
        arrangementsOf(tune).map((arrangement) => ({
          tune,
          arrangement,
          source: { file: tune, sequence: 0 },
          rest: HEARD_ONCE.includes(tune) ? 5 : 0,
        })),
      ),
    );
    expect(renderJobs(ULTIMA5_TUNES, ['original', 'BRITLAND.XMI'])).toEqual([
      { tune: 'BRITLAND.XMI', arrangement: 'original', source: { file: 'BRITLAND.XMI', sequence: 0 }, rest: 0 },
    ]);
  });

  it('makes a second game’s from where its set says, by its picks', () => {
    expect(renderJobs(OTHER, ['TWO'])).toEqual([
      { tune: 'TWO', arrangement: 'original', source: { file: 'BOTH.XMI', sequence: 1 }, rest: 5 },
      { tune: 'TWO', arrangement: 'remastered', source: { file: 'BOTH.XMI', sequence: 1 }, rest: 5 },
    ]);
    expect(renderJobs(OTHER, ['piano']).map((j) => j.tune)).toEqual(['ONE']);
  });

  it('refuses a word that is no arrangement or tune of the set', () => {
    expect(() => renderJobs(OTHER, ['BRITLAND.XMI'])).toThrow('Not an arrangement or a tune');
  });
});
