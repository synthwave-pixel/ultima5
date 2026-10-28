import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chooseCharacter } from '../src/game/characters.ts';
import { audioLines } from '../src/game/menu.ts';
import { DEFAULTS, effectsOf, loadOptions, SETTINGS_KEY, SOUND_CHOICES, soundtrackOf } from '../src/game/settings.ts';
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

describe('the one Sound setting', () => {
  it('is Classical to begin with, and the two settings it replaced are gone', () => {
    expect(DEFAULTS.soundChoice).toBe('classical');
    expect(DEFAULTS).not.toHaveProperty('soundSet');
    expect(DEFAULTS).not.toHaveProperty('musicVoice');
    expect(SOUND_CHOICES).toEqual(['classical', 'electronic', 'ambient', 'upgrade']);
  });

  it('plays each choice as its soundtrack and its effects', () => {
    expect(['classical', 'electronic', 'ambient', 'upgrade'].map((c) => soundtrackOf(c as never))).toEqual([
      'classical',
      'electronic',
      'remastered',
      'original',
    ]);
    expect(['classical', 'electronic', 'ambient', 'upgrade'].map((c) => effectsOf(c as never))).toEqual([
      'classical',
      'electronic',
      'ambient',
      'original',
    ]);
  });

  it('takes a player’s old soundtrack as their Sound, and drops the old effects set', () => {
    for (const [musicVoice, soundChoice] of [
      ['classical', 'classical'],
      ['electronic', 'electronic'],
      ['remastered', 'ambient'],
      ['original', 'upgrade'],
    ]) {
      store.set(SETTINGS_KEY, JSON.stringify({ musicVoice, soundSet: 'original' }));
      const o = loadOptions();
      expect(o.soundChoice, musicVoice).toBe(soundChoice);
      expect(o).not.toHaveProperty('soundSet');
      expect(o).not.toHaveProperty('musicVoice');
    }
    store.set(SETTINGS_KEY, JSON.stringify({}));
    expect(loadOptions().soundChoice).toBe('classical');
    store.set(SETTINGS_KEY, JSON.stringify({ soundChoice: 'kazoo' }));
    expect(loadOptions().soundChoice).toBe('classical');
  });

  it('is one line in Audio, cycling the four, each within the menu’s width; the levels stay', () => {
    const { g } = newGame();
    const labels = (): string[] => audioLines(g).map((l) => l.label);
    expect(labels()).toEqual(['Back', 'Sound: Classical', 'Music level: 60%', 'Sound FX level: 80%']);
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      const line = audioLines(g).find((l) => l.label.startsWith('Sound:'))!;
      seen.push(line.label);
      expect(line.label.length).toBeLessThanOrEqual(21);
      expect(line.note?.length ?? 0).toBeGreaterThan(0);
      void line.act?.();
    }
    expect(seen).toEqual(['Sound: Classical', 'Sound: Electronic', 'Sound: Ambient', 'Sound: Upgrade (2001)']);
    expect(labels()[1]).toBe('Sound: Classical');
  });
});
