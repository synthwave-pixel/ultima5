import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chooseCharacter } from '../src/game/characters.ts';
import { K, Pad } from '../src/game/io.ts';
import { amount } from '../src/game/menu.ts';
import { DEFAULTS, levelGain, loadOptions, normaliseOptions, SETTINGS_KEY } from '../src/game/settings.ts';
import { effectsGain, musicGain } from '../src/ui/sound.ts';
import { newGame } from './helpers.ts';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  chooseCharacter(null);
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});
afterEach(() => delete (globalThis as { localStorage?: unknown }).localStorage);

describe('the mixer’s settings', () => {
  it('begin at Music 60% and Sound FX 80%, the Classical soundtrack', () => {
    expect(DEFAULTS).toMatchObject({ musicLevel: 6, effectsLevel: 8, musicVoice: 'classical', soundSet: 'standard' });
    expect('music' in DEFAULTS).toBe(false);
  });

  it('carry over the settings from before: music off is Music 0%, Sound FX off is 0% of the Standard set', () => {
    store.set(SETTINGS_KEY, JSON.stringify({ music: false, soundSet: 'off' }));
    const o = loadOptions();
    expect(o).toMatchObject({ musicLevel: 0, effectsLevel: 0, soundSet: 'standard' });
    expect('music' in o).toBe(false);
    store.set(SETTINGS_KEY, JSON.stringify({ music: true, soundSet: 'original' }));
    expect(loadOptions()).toMatchObject({ musicLevel: 6, effectsLevel: 8, soundSet: 'original' });
  });

  it('carry over a game played with the sound off, as a level of 0', () => {
    store.set(SETTINGS_KEY, JSON.stringify({ sound: false }));
    expect(loadOptions()).toMatchObject({ effectsLevel: 0, musicLevel: 6 });
    expect('sound' in loadOptions()).toBe(false);
  });

  it('keep a level that was dialled, whatever the old Music Off says beside it', () => {
    store.set(SETTINGS_KEY, JSON.stringify({ music: false, musicLevel: 4 }));
    expect(loadOptions().musicLevel).toBe(4);
  });

  it('take a sound set that is not one the game has as the Standard', () => {
    store.set(SETTINGS_KEY, JSON.stringify({ soundSet: 'kazoo' }));
    expect(loadOptions().soundSet).toBe('standard');
    store.set(SETTINGS_KEY, JSON.stringify({ soundSet: 7 }));
    expect(loadOptions().soundSet).toBe('standard');
  });

  it('are normalised on their own, for settings from a file: what is not there stays not there', () => {
    expect(normaliseOptions({ music: false, soundSet: 'off' } as never)).toEqual({ musicLevel: 0, effectsLevel: 0, soundSet: 'standard' });
    expect(normaliseOptions({ scanlines: true })).toEqual({ scanlines: true });
  });

  it('keep the soundtrack a game chose, and give one that chose none the Classical', () => {
    for (const voice of ['original', 'remastered', 'electronic', 'classical']) {
      store.set(SETTINGS_KEY, JSON.stringify({ musicVoice: voice }));
      expect(loadOptions().musicVoice).toBe(voice);
    }
    store.set(SETTINGS_KEY, JSON.stringify({ musicLevel: 5 }));
    expect(loadOptions().musicVoice).toBe('classical');
  });

  it('begin on the Modern rules, keep rules only where they are some, and drop the six settings they replaced', () => {
    expect(DEFAULTS.rules).toBe('modern');
    store.set(SETTINGS_KEY, JSON.stringify({ rules: 'classic' }));
    expect(loadOptions().rules).toBe('classic');
    store.set(SETTINGS_KEY, JSON.stringify({ rules: 'nightmare' }));
    expect(loadOptions().rules).toBe('modern');
    // An earlier build's settings: no crash, the defaults' rules, and none of the old keys carried on.
    const old = { combat: 'hard', effects: 'classic', poison: 'deadly', starvation: 'off', balancedXp: false, throwing: 'all' };
    store.set(SETTINGS_KEY, JSON.stringify(old));
    const o = loadOptions() as unknown as Record<string, unknown>;
    expect(o.rules).toBe('modern');
    for (const key of Object.keys(old)) expect(o[key]).toBeUndefined();
  });

  it('keep a level within 0 to 10, whole, and a music voice that is one', () => {
    store.set(SETTINGS_KEY, JSON.stringify({ musicLevel: 14, effectsLevel: -2.5, musicVoice: 'kazoo' }));
    expect(loadOptions()).toMatchObject({ musicLevel: 10, effectsLevel: 0, musicVoice: 'classical' });
    store.set(SETTINGS_KEY, JSON.stringify({ musicLevel: 3.6 }));
    expect(loadOptions().musicLevel).toBe(4);
  });

  it('turn a level into a gain on a curve, each step a step to the ear', () => {
    expect(levelGain(0)).toBe(0);
    expect(levelGain(10)).toBe(1);
    expect(levelGain(5)).toBeCloseTo(0.25);
    for (let n = 1; n <= 10; n++) expect(levelGain(n)).toBeGreaterThan(levelGain(n - 1));
  });
});

describe('the dial', () => {
  const percent = (n: number): string => (n === 0 ? 'Off' : `${n * 10}%`);

  it('shows a label for its number, and says each change as it is dialled', async () => {
    const { g, p } = newGame();
    const heard: number[] = [];
    p.keys.push(K.Up, K.Up, K.Down, Pad.A);
    const n = await amount(g, 0, 10, 6, { title: 'Music level', shown: percent, onChange: (v) => heard.push(v) });
    expect(n).toBe(7);
    expect(heard).toEqual([7, 8, 7]);
    expect(p.log).toContain('60%');
    expect(p.log).toContain('80%');
  });

  it('goes back to where it was on B, and says so', async () => {
    const { g, p } = newGame();
    const heard: number[] = [];
    p.keys.push(K.Down, K.Down, Pad.B);
    expect(await amount(g, 0, 10, 6, { shown: percent, onChange: (v) => heard.push(v) })).toBe(-1);
    expect(heard).toEqual([5, 4, 6]);
  });

  it('shows Off at none, and stops at the ends', async () => {
    const { g, p } = newGame();
    p.keys.push(K.Down, K.Left, K.Down, Pad.A);
    expect(await amount(g, 0, 10, 1, { shown: percent })).toBe(0);
    expect(p.log).toContain('Off');
  });
});

describe('the levels heard', () => {
  it('are the effects’ loudness of before at the defaults, none at Off, and the music’s own at 100%', () => {
    expect(musicGain(10)).toBeCloseTo(1); // the rendered music's own level, its peaks under full scale
    expect(musicGain(6)).toBeCloseTo(0.36);
    expect(musicGain(0)).toBe(0);
    expect(musicGain(10)).toBeGreaterThan(musicGain(6));
    expect(effectsGain('standard', 8)).toBeCloseTo(1);
    expect(effectsGain('original', 8)).toBeCloseTo(0.3);
    expect(effectsGain('standard', 0)).toBe(0);
  });

  it('never give the audio a gain of NaN, which throws: an unknown set sounds as the Standard, no level as none', () => {
    expect(effectsGain('off' as never, 8)).toBeCloseTo(1); // a setting from before the mixer, written by a script
    expect(effectsGain('standard', Number.NaN)).toBe(0);
  });
});
