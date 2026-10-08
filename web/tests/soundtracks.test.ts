import { describe, expect, it } from 'vitest';
import { ARRANGEMENTS, arrangementsFor, arrangementsOf, PICKS, pick, SOUNDTRACKS } from '../src/audio/soundtracks.ts';
import { mapOccasion, musicForMap, Tune, TUNE_FILES } from '../src/game/music.ts';
import { newGame } from './helpers.ts';

describe('the soundtracks', () => {
  it('give every tune, in Electronic and Classical, arrangements to play wherever it is heard', () => {
    for (const name of TUNE_FILES)
      for (const soundtrack of ['classical', 'electronic'] as const) {
        const choices = PICKS[name]?.[soundtrack];
        expect(choices?.usual.length, `${soundtrack} ${name}`).toBeGreaterThan(0);
        for (const list of Object.values(choices ?? {})) for (const a of list ?? []) expect(ARRANGEMENTS).toContain(a);
      }
    expect(Object.keys(PICKS).sort()).toEqual([...TUNE_FILES].sort());
  });

  it('play Original and Remastered in their own arrangement, whatever the occasion', () => {
    expect(arrangementsFor('original', 'BRITLAND.XMI', 'night')).toEqual(['original']);
    expect(arrangementsFor('remastered', 'STONES.XMI', 'shrine')).toEqual(['remastered']);
  });

  it('play the stories in fixed arrangements: the introduction a consort, the closing a piano (Electronic the Remastered)', () => {
    for (const name of ['STONES.XMI', 'HALLS.XMI', 'GREYSON.XMI']) {
      expect(arrangementsFor('classical', name, 'introduction')).toEqual(['consort']);
      expect(arrangementsFor('electronic', name, 'introduction')).toEqual(['remastered']);
    }
    for (const name of ['STONES.XMI', 'LADYNAN.XMI', 'REUNION.XMI']) {
      expect(arrangementsFor('classical', name, 'closing')).toEqual(['piano']);
      expect(arrangementsFor('electronic', name, 'closing')).toEqual(['remastered']);
    }
    expect(arrangementsFor('electronic', 'RULEBRIT.XMI')).toEqual(['upsidedown']);
  });

  it('play a camp, a shrine and the title each their own, and a tune with none of its own its usual ones', () => {
    expect(arrangementsFor('classical', 'STONES.XMI')).toEqual(['celtic', 'orchestra', 'strings']);
    expect(arrangementsFor('classical', 'STONES.XMI', 'shrine')).toEqual(['piano']);
    expect(arrangementsFor('electronic', 'STONES.XMI', 'shrine')).toEqual(['upsidedown']);
    expect(arrangementsFor('classical', 'U5THEME.XMI', 'title')).toEqual(['consort']);
    expect(arrangementsFor('electronic', 'U5THEME.XMI', 'title')).toEqual(['upsidedown']);
    expect(arrangementsFor('classical', 'TRNTLLA.XMI', 'night')).toEqual(arrangementsFor('classical', 'TRNTLLA.XMI'));
  });

  it('render every arrangement some soundtrack plays of a tune, Original and Remastered always', () => {
    expect(arrangementsOf('FANFARE.XMI')).toEqual(['original', 'remastered', 'piano', 'juno']);
    expect(arrangementsOf('AMIGA.XMI')).toEqual(['original', 'remastered']);
    expect(SOUNDTRACKS[0]).toBe('classical');
  });

  it('pick at random, never the one played last where there is another', () => {
    const choices = ['celtic', 'consort', 'orchestra'] as const;
    for (const r of [0, 0.3, 0.6, 0.99]) expect(pick([...choices], 'consort', () => r)).not.toBe('consort');
    expect(pick(['piano'], 'piano', () => 0.5)).toBe('piano');
    expect(pick([...choices], undefined, () => 0.99)).toBe('orchestra');
  });
});

describe("Britannia's music", () => {
  const at = (hour: number, minute = 0) => {
    const { g, p } = newGame();
    Object.assign(g.s, { mapId: 0, level: 0, hour, minute, partyTile: 0 });
    return { g, p };
  };

  it('is the day’s by day and the night’s by night, turning at the middle of the dusk and the dawn', () => {
    expect(mapOccasion(at(12).g, Tune.Britannia)).toBeUndefined();
    expect(mapOccasion(at(23).g, Tune.Britannia)).toBe('night');
    expect(mapOccasion(at(3).g, Tune.Britannia)).toBe('night');
    expect(mapOccasion(at(19, 0).g, Tune.Britannia)).toBeUndefined(); // the dusk begun
    expect(mapOccasion(at(20, 0).g, Tune.Britannia)).toBe('night'); // the dusk done
    expect(mapOccasion(at(6, 0).g, Tune.Britannia)).toBeUndefined(); // the dawn done
    expect(mapOccasion(at(23).g, Tune.Halls)).toBeUndefined(); // no other tune has a night of its own
  });

  it('is asked for on the night, from the map', () => {
    const { g, p } = at(23);
    const asked: [number, string | undefined][] = [];
    p.sound.music = (tune, occasion) => void asked.push([tune, occasion]);
    g.musicFollowsMap = true;
    musicForMap(g);
    expect(asked).toEqual([[Tune.Britannia, 'night']]);
  });
});
