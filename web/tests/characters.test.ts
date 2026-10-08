import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { characterIds, chooseCharacter, CHARACTERS_KEY, charKey, MAX_CHARACTERS, newCharacter } from '../src/game/characters.ts';
import { Relocate } from '../src/game/cheats.ts';
import type { Game } from '../src/game/game.ts';
import { Intro } from '../src/game/intro.ts';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { Save } from '../src/game/save.ts';
import { loadOptions, saveOptions, SETTINGS_KEY, type Options } from '../src/game/settings.ts';
import {
  avatarName,
  characters,
  currentCharacter,
  deleteCharacter,
  EARLIER,
  fromBase64,
  localSave,
  restore,
  SAVE_KEY,
  SAVES_KEY,
  saveKeys,
  serialize,
  packSave,
  unpackSave,
  type SaveData,
} from '../src/game/storage.ts';
import { readLocations, TOWN_SIZE } from '../src/data/maps.ts';
import { placeKey } from '../src/game/fog.ts';
import { Vocabulary } from '../src/game/words.ts';
import { analyse } from '../tools/talk/analysis.ts';
import { exportGame, exportText, importGame, mendImport, type Transfer } from '../src/game/transfer.ts';
import { newGame } from './helpers.ts';

/**
 * Several characters on one machine (characters.ts, storage.ts): each with their own saves and settings, chosen at
 * the title, deleted there, carried out and in one at a time, and the saves from before them split among their
 * Avatars.
 */

/** The browser's local storage, in memory: `room` characters of it, and a `fault` to throw on a write. */
const store = new Map<string, string>();
let room = Infinity;
let fault: ((key: string) => void) | null = null;
beforeEach(() => {
  store.clear();
  room = Infinity;
  fault = null;
  chooseCharacter(null);
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      fault?.(k);
      let used = k.length + v.length;
      for (const [key, value] of store) if (key !== k) used += key.length + value.length;
      if (used > room) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      store.set(k, v);
    },
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
});
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
  vi.useRealTimers();
});

/** A game in play out in Britannia, its Avatar named `name`, with `gold`. */
function game(name: string, gold = 100): Game {
  const { g } = newGame();
  journeyOnward(g);
  g.s.mapId = 0;
  g.s.members[0].name = name;
  g.s.gold = gold;
  return g;
}

/** A character made and saved: `name`, with saves of each of `golds` in turn. Their id. */
function make(name: string, ...golds: number[]): string {
  const id = newCharacter();
  chooseCharacter(id);
  const g = game(name, golds[0]);
  for (const gold of golds) {
    g.s.gold = gold;
    expect(localSave.write(g)).toBe(true);
  }
  return id;
}

const goldOf = (d: SaveData | null | undefined): number => new Save(fromBase64(d!.save)).gold;
const names = (): string[] => characters().map((c) => avatarName(c.data));

describe('characters', () => {
  it('keep their own saves: one character’s play never pushes another’s out', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 3, 10));
    const iolo = make('Iolo', 1, 2, 3);
    vi.setSystemTime(new Date(2026, 9, 3, 11));
    const dupre = make('Dupre', ...Array.from({ length: 15 }, (_, i) => 100 + i));
    chooseCharacter(iolo);
    expect(localSave.all().map((k) => goldOf(k.data))).toEqual([3, 2, 1]);
    chooseCharacter(dupre);
    expect(localSave.all()).toHaveLength(EARLIER + 1);
    expect(goldOf(localSave.read())).toBe(114);
    expect(names()).toEqual(['Dupre', 'Iolo']); // the newest last save first
  });

  it('are the latest when none is chosen, and none at all on a fresh machine', () => {
    expect(currentCharacter()).toBeNull();
    expect(localSave.read()).toBeNull();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 3, 10));
    make('Iolo', 1);
    vi.setSystemTime(new Date(2026, 9, 3, 12));
    const dupre = make('Dupre', 2);
    vi.setSystemTime(new Date(2026, 9, 3, 14));
    make('Iolo', 3); // another of the same name: a character of their own
    chooseCharacter(null);
    expect(currentCharacter()).not.toBe(dupre);
    expect(goldOf(localSave.read())).toBe(3);
    expect(characters()).toHaveLength(3);
  });

  it('make one of their own for a game saved with none chosen', () => {
    const g = game('Shamino');
    expect(localSave.write(g)).toBe(true);
    expect(characterIds()).toHaveLength(1);
    expect(names()).toEqual(['Shamino']);
  });

  it('give up the oldest earlier save of anyone’s for room, never a last save', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 3, 10));
    const iolo = make('Iolo', 1, 2, 3); // the oldest earlier saves: 1, 2
    vi.setSystemTime(new Date(2026, 9, 3, 11));
    const dupre = make('Dupre', 10, 11, 12);
    const used = [...store].reduce((n, [k, v]) => n + k.length + v.length, 0);
    room = used + 100; // no room for another save without letting one go
    const evicted = localSave.evicted;
    vi.setSystemTime(new Date(2026, 9, 3, 12));
    const g = game('Dupre', 13);
    expect(localSave.write(g)).toBe(true);
    expect(localSave.evicted).toBeGreaterThan(evicted);
    chooseCharacter(iolo);
    const left = localSave.all().map((k) => goldOf(k.data));
    expect(left[0]).toBe(3); // Iolo's last save stands
    expect(left).not.toContain(1); // the oldest of all went first
    chooseCharacter(dupre);
    expect(goldOf(localSave.read())).toBe(13);
  });

  it('are deleted with all their saves and settings; the last one’s settings stay the machine’s', () => {
    const iolo = make('Iolo', 1, 2);
    saveOptions({ ...loadOptions(), musicLevel: 0 });
    const dupre = make('Dupre', 3);
    saveOptions({ ...loadOptions(), musicLevel: 6, scanlines: true });
    deleteCharacter(iolo);
    expect([...store.keys()].filter((k) => k.includes(iolo))).toEqual([]);
    expect(names()).toEqual(['Dupre']);
    expect(store.has(SETTINGS_KEY)).toBe(false);
    deleteCharacter(dupre);
    expect(characters()).toEqual([]);
    expect(currentCharacter()).toBeNull();
    expect(loadOptions().scanlines).toBe(true); // the machine's now: as they were
  });
});

describe('settings', () => {
  it('are each character’s own, the machine’s standing in for one with none yet', () => {
    store.set(SETTINGS_KEY, JSON.stringify({ music: false }));
    const iolo = make('Iolo', 1);
    expect(loadOptions().musicLevel).toBe(0); // none of Iolo's own yet: the machine's
    saveOptions({ ...loadOptions(), musicLevel: 6, tileSet: 'original' });
    const dupre = make('Dupre', 2);
    saveOptions({ ...loadOptions(), tileSet: 'standard' });
    chooseCharacter(iolo);
    expect(loadOptions()).toMatchObject({ musicLevel: 6, tileSet: 'original' });
    chooseCharacter(dupre);
    expect(loadOptions().tileSet).toBe('standard');
    expect(JSON.parse(store.get(SETTINGS_KEY)!)).toEqual({ music: false }); // the machine's untouched
    expect(store.has(charKey(iolo, 'settings'))).toBe(true);
  });
});

describe('the saves from before characters', () => {
  /** The old keys: the last save and the earlier ones, as the version before characters kept them. */
  function before(...saves: [string, number, number][]): string[] {
    const texts = saves.map(([name, gold, at]) => {
      vi.setSystemTime(at);
      return JSON.stringify(serialize(game(name, gold)));
    });
    store.set(SAVE_KEY, texts[0]);
    const keys = texts.slice(1).map((t, i) => {
      store.set(`${SAVE_KEY}.${i + 1}`, t);
      return `${SAVE_KEY}.${i + 1}`;
    });
    store.set(SAVES_KEY, JSON.stringify({ next: keys.length + 1, keys }));
    return texts;
  }

  it('are split among their Avatars, the last save’s first, each with the settings then in use', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    store.set(SETTINGS_KEY, JSON.stringify({ music: false }));
    before(['Iolo', 5, 5000], ['Iolo', 4, 4000], ['Dupre', 3, 3000], ['Iolo', 2, 2000], ['Dupre', 1, 1000]);
    const all = characters();
    expect(all.map((c) => avatarName(c.data))).toEqual(['Iolo', 'Dupre']);
    chooseCharacter(all[0].id);
    expect(localSave.all().map((k) => goldOf(k.data))).toEqual([5, 4, 2]);
    expect(loadOptions().musicLevel).toBe(0);
    chooseCharacter(all[1].id);
    expect(localSave.all().map((k) => goldOf(k.data))).toEqual([3, 1]);
    // The old keys gone.
    expect([...store.keys()].filter((k) => k === SAVES_KEY || k.startsWith(SAVE_KEY))).toEqual([]);
  });

  it('are left as they were where the moving fails part way, and moved the next time', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const texts = before(['Iolo', 5, 5000], ['Dupre', 3, 3000]);
    let writes = 0;
    fault = (k) => {
      if (k.startsWith('ultima5.char.') && ++writes === 4) throw new DOMException('denied', 'SecurityError');
    };
    expect(characters()).toEqual([]);
    expect(store.get(SAVE_KEY)).toBe(texts[0]);
    expect([...store.keys()].filter((k) => k.startsWith('ultima5.char.') || k === CHARACTERS_KEY)).toEqual([]);
    fault = null;
    expect(names()).toEqual(['Iolo', 'Dupre']);
  });

  it('keep the newest eight of one Avatar’s ten, the two oldest let go', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    before(...Array.from({ length: 10 }, (_, i): [string, number, number] => ['Iolo', 10 - i, (10 - i) * 1000]));
    expect(localSave.all().map((k) => goldOf(k.data))).toEqual([10, 9, 8, 7, 6, 5, 4, 3]);
    expect([...store.keys()].filter((k) => k.startsWith(SAVE_KEY))).toEqual([]);
  });

  it('leave nothing to do on a machine with none', () => {
    expect(characters()).toEqual([]);
    expect(store.has(CHARACTERS_KEY)).toBe(false);
  });
});

describe('a character taken up from the title', () => {
  it('knows nothing of another’s maps or words', () => {
    const iolo = game('Iolo');
    iolo.words.learn(iolo, 'MANTRA');
    const dupre = game('Dupre');
    const { g } = newGame();
    restore(g, serialize(iolo), true);
    expect(g.words.size).toBeGreaterThan(0);
    restore(g, serialize(dupre), true);
    expect(g.words.size).toBe(dupre.words.size);
  });
});

/** The title, with `keys` pressed after its scenes are passed over. */
async function atTitle(...keys: number[]) {
  return atTitleWith(() => undefined, ...keys);
}

/** The title as atTitle, `setup` given its game first (the page's hooks, say). */
async function atTitleWith(setup: (g: Game) => void, ...keys: number[]) {
  const made = newGame();
  setup(made.g);
  made.p.keys.push(K.Escape, K.Escape, K.Escape, ...keys);
  const intro = new Intro(made.g);
  const done = await intro.run().then(
    () => true,
    (e: Error) => {
      if (e.message !== 'script ran out of keys') throw e;
      return false;
    },
  );
  const lines = (intro as unknown as { menuKeys(): string }).menuKeys();
  return { ...made, done, lines };
}

/** Three characters, saved an hour apart: Iolo, then Dupre, then Jaana, the latest; none chosen. */
function three(): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 3, 10));
  make('Iolo', 1);
  vi.setSystemTime(new Date(2026, 9, 3, 11));
  make('Dupre', 2);
  vi.setSystemTime(new Date(2026, 9, 3, 12));
  make('Jaana', 3);
  chooseCharacter(null);
  vi.useRealTimers(); // the title's ticks go by the clock
}

describe('Journey Onward', () => {
  it('takes the one character straight in', async () => {
    make('Iolo', 7);
    const { g, done } = await atTitle(Pad.A);
    expect(done).toBe(true);
    expect(g.s.gold).toBe(7);
  });

  it('asks whose journey where there are more, the newest last save first, and takes up the one chosen', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 3, 10));
    make('Iolo', 7);
    vi.setSystemTime(new Date(2026, 9, 3, 11));
    make('Dupre', 8);
    chooseCharacter(null);
    vi.useRealTimers(); // the title's ticks go by the clock
    const asked = await atTitle(Pad.A);
    expect(asked.g.menuShown?.title).toBe('Whose journey?');
    expect(asked.g.menuShown?.labels[0]).toMatch(/^Dupre, level \d+$/);
    // The second character's line: three down.
    const { g, done } = await atTitle(Pad.A, K.Down, Pad.A);
    expect(done).toBe(true);
    expect(g.s.gold).toBe(7);
    expect(avatarName(localSave.read()!)).toBe('Iolo'); // the one in play now
  });

  it('deletes a character there, asked twice, and goes back to the title once one is left', async () => {
    make('Iolo', 7);
    make('Dupre', 8);
    chooseCharacter(null);
    // Delete a character... (the list's last line), the first in its list, Yes; then, one left, straight in.
    const { done } = await atTitle(Pad.A, K.Up, Pad.A, Pad.A, K.Down, Pad.A, Pad.A);
    expect(names()).toHaveLength(1);
    expect(done).toBe(true);
  });
});

describe('Create New Character', () => {
  it('adds one beside those kept, with the settings in use, asking nothing first', async () => {
    const iolo = make('Iolo', 7);
    // (The PC (1988) look: no Appearance screen to pass.)
    saveOptions({ ...loadOptions(), scanlines: true, tileSet: 'original', input: 'controller' });
    chooseCharacter(null);
    const { g, p } = newGame();
    currentCharacter(); // as the page starts: the latest's settings in use (main.ts)
    g.options = loadOptions();
    const intro = new Intro(g) as unknown as { createCharacter(): Promise<boolean> };
    p.keys.push(K.Down, Pad.A, K.Left, Pad.A, Pad.A, K.Enter, ...Array<number>(7).fill(0x41), K.Enter);
    expect(await intro.createCharacter()).toBe(true);
    expect(characters()).toHaveLength(2);
    const made = currentCharacter()!;
    expect(made).not.toBe(iolo);
    expect(loadOptions().scanlines).toBe(true);
    chooseCharacter(iolo);
    expect(goldOf(localSave.read())).toBe(7); // Iolo's game as it was
  });
});

describe('export and import', () => {
  const page = (over: Partial<Transfer>): Transfer => ({
    copy: async () => undefined,
    paste: async () => '',
    open: async () => '',
    ...over,
  });

  it('carry a character’s settings with their game', () => {
    const iolo = make('Iolo', 7);
    saveOptions({ ...loadOptions(), scanlines: true });
    const { g } = newGame();
    const text = exportText(g, iolo)!;
    expect((JSON.parse(text) as { settings: { scanlines: boolean } }).settings.scanlines).toBe(true);
  });

  it('add an imported game as a character with its settings, or put it in a namesake’s place', async () => {
    make('Iolo', 7);
    const file = JSON.stringify({ ...serialize(game('Dupre', 9)), settings: { scanlines: true } });
    const added = newGame();
    added.g.hooks.transfer = page({ paste: async () => file });
    added.p.keys.push(Pad.A, K.Up, Pad.A); // the clipboard; Add Dupre
    expect(await importGame(added.g)).toBe(true);
    expect(names().sort()).toEqual(['Dupre', 'Iolo']);
    expect(loadOptions().scanlines).toBe(true);
    // Iolo again: replace the one kept.
    const again = JSON.stringify(serialize(game('Iolo', 11)));
    const replaced = newGame();
    replaced.g.hooks.transfer = page({ paste: async () => again });
    replaced.p.keys.push(Pad.A, K.Up, K.Up, Pad.A); // the clipboard; Replace Iolo's game
    expect(await importGame(replaced.g)).toBe(true);
    expect(characters()).toHaveLength(2);
    expect(goldOf(characters().find((c) => avatarName(c.data) === 'Iolo')!.data)).toBe(11);
    expect(saveKeys()).not.toBeNull();
  });
});

describe('the picker’s edges', () => {
  it('goes back to the title on B, nothing changed', async () => {
    three();
    const { g, done } = await atTitle(Pad.A, Pad.B, Pad.A); // whose; back; whose again (and the keys run out)
    expect(done).toBe(false);
    expect(g.menuShown?.title).toBe('Whose journey?');
    expect(names()).toEqual(['Jaana', 'Dupre', 'Iolo']);
  });

  it('deletes nobody on No', async () => {
    three();
    const { g } = await atTitle(Pad.A, K.Up, Pad.A, Pad.A, Pad.A); // Delete a character...; Jaana; No
    expect(names()).toHaveLength(3);
    expect(g.menuShown?.title).toBe('Whose journey?'); // the list again
  });

  it('stays up with two left of three, the one deleted gone from it', async () => {
    three();
    const { g } = await atTitle(Pad.A, K.Up, Pad.A, K.Down, Pad.A, K.Down, Pad.A); // ...; Dupre; Yes
    expect(names()).toEqual(['Jaana', 'Iolo']);
    expect(g.menuShown?.title).toBe('Whose journey?');
    expect(g.menuShown?.labels.join('|')).not.toContain('Dupre');
  });

  it('passes over a character whose first save never came to be', async () => {
    make('Iolo', 7);
    newCharacter(); // made, but its save failed
    chooseCharacter(null);
    expect(names()).toEqual(['Iolo']);
    const { g, done } = await atTitle(Pad.A); // one to take up: straight in
    expect(done).toBe(true);
    expect(g.s.gold).toBe(7);
  });
});

describe('the title’s Delete Character', () => {
  // (A keyboard read as a controller takes the letters as WASD's or as nothing: the line is reached as the title's
  // last, up from Journey Onward; and each run ends at a menu waiting for keys, or taking up a game.)
  it('is a line of the title whenever a character is kept, and not without', async () => {
    expect((await atTitle(Pad.A)).lines).not.toContain('D'); // none kept (A: Create New Character, to end there)
    make('Iolo', 7);
    chooseCharacter(null);
    expect((await atTitle(Pad.A)).lines).toMatch(/D$/); // (A: Journey Onward, straight in)
  });

  it('deletes the only character, after which Journey Onward is grey and the line gone, the settings as they were', async () => {
    make('Iolo', 7);
    saveOptions({ ...loadOptions(), scanlines: true });
    chooseCharacter(null);
    // Delete Character; Iolo; Yes; then up from Create New Character (Journey Onward grey) to Settings, to end there.
    const { g, lines } = await atTitle(K.Up, Pad.A, Pad.A, K.Down, Pad.A, K.Up, Pad.A);
    expect(g.menuShown?.title).toBe('Settings');
    expect(characters()).toEqual([]);
    expect(characterIds()).toEqual([]);
    expect([...store.keys()].filter((k) => k.startsWith('ultima5.char.'))).toEqual([]);
    expect(lines).not.toContain('D');
    expect(g.options.scanlines).toBe(true); // the machine's now: as Iolo's were
    expect(loadOptions().scanlines).toBe(true);
  });

  it('takes up the next one’s settings when the latest is deleted', async () => {
    three();
    chooseCharacter(null);
    currentCharacter(); // Jaana's: the latest
    saveOptions({ ...loadOptions(), musicLevel: 6 });
    chooseCharacter(characters().find((c) => avatarName(c.data) === 'Dupre')!.id);
    saveOptions({ ...loadOptions(), musicLevel: 0 });
    chooseCharacter(null);
    // Delete Character; Jaana (first); Yes; Journey Onward, the picker (to end there).
    const { g } = await atTitle(K.Up, Pad.A, Pad.A, K.Down, Pad.A, Pad.A);
    expect(g.menuShown?.title).toBe('Whose journey?');
    expect(names()).toEqual(['Dupre', 'Iolo']);
    expect(g.options.musicLevel).toBe(0); // Dupre's, the latest now
  });

  it('keeps everyone on B or No', async () => {
    make('Iolo', 7);
    chooseCharacter(null);
    // Delete Character, back; again, Iolo, No; then Journey Onward, straight in.
    const { done, p } = await atTitle(K.Up, Pad.A, Pad.B, K.Up, Pad.A, Pad.A, Pad.A, Pad.A);
    expect(p.log.split('Delete whom?')).toHaveLength(3); // asked whom, both times
    expect(p.log).toContain('Delete Iolo and all');
    expect(names()).toEqual(['Iolo']);
    expect(done).toBe(true);
  });
});

describe('storage’s edges', () => {
  it('fails a save with no earlier one of anyone’s left to let go, every last save kept', () => {
    const iolo = make('Iolo', 1);
    const dupre = make('Dupre', 2);
    room = [...store].reduce((n, [k, v]) => n + k.length + v.length, 0) + 50;
    chooseCharacter(iolo);
    expect(localSave.write(game('Iolo', 3))).toBe(false);
    expect(goldOf(localSave.read())).toBe(1);
    chooseCharacter(dupre);
    expect(goldOf(localSave.read())).toBe(2);
  });

  it('settings changed at the title are the latest character’s, not the machine’s', () => {
    make('Iolo', 1);
    chooseCharacter(null);
    currentCharacter();
    saveOptions({ ...loadOptions(), scanlines: true });
    expect(store.has(SETTINGS_KEY)).toBe(false);
    expect(loadOptions().scanlines).toBe(true);
  });
});

describe('the saves from before characters, at their edges', () => {
  it('pass over a save that will not read, and an index naming one that is gone - and let them all go after', () => {
    const good = JSON.stringify(serialize(game('Iolo', 5)));
    store.set(SAVE_KEY, '{"game":"ultima5","version":1,"save":"AAA'); // cut short
    store.set(`${SAVE_KEY}.1`, good);
    store.set(SAVES_KEY, JSON.stringify({ next: 3, keys: [`${SAVE_KEY}.2`, `${SAVE_KEY}.1`] })); // .2 is gone
    expect(names()).toEqual(['Iolo']);
    expect([...store.keys()].filter((k) => k === SAVES_KEY || k.startsWith(SAVE_KEY))).toEqual([]);
  });

  it('wait for room where there is too little to move them, nothing lost', () => {
    const text = JSON.stringify(serialize(game('Iolo', 5)));
    store.set(SAVE_KEY, text);
    room = [...store].reduce((n, [k, v]) => n + k.length + v.length, 0) + 100;
    expect(characters()).toEqual([]);
    expect(store.get(SAVE_KEY)).toBe(text);
    expect([...store.keys()].filter((k) => k.startsWith('ultima5.char.'))).toEqual([]);
    room = Infinity;
    expect(names()).toEqual(['Iolo']);
  });
});

describe('export and import, at their edges', () => {
  const page = (over: Partial<Transfer>): Transfer & { copied: string[] } => {
    const copied: string[] = [];
    return { copied, copy: async (t) => void copied.push(t), paste: async () => '', open: async () => '', ...over };
  };

  it('ask whose game at the title where there are more, B exporting nothing', async () => {
    three();
    const chosen = newGame();
    const clip = page({});
    chosen.g.hooks.transfer = clip;
    chosen.p.keys.push(K.Down, Pad.A, Pad.A, Pad.A); // Dupre; to the clipboard; (the message read)
    await exportGame(chosen.g);
    expect(chosen.p.log).toContain('Export whose game?');
    expect(avatarName(JSON.parse(clip.copied[0]) as SaveData)).toBe('Dupre');
    const none = newGame();
    const nothing = page({});
    none.g.hooks.transfer = nothing;
    none.p.keys.push(Pad.B);
    await exportGame(none.g);
    expect(nothing.copied).toEqual([]);
  });

  it('let go of a character an import could not store, the one before chosen again', async () => {
    const iolo = make('Iolo', 7);
    room = [...store].reduce((n, [k, v]) => n + k.length + v.length, 0) + 400; // the list and settings, not a save
    const file = JSON.stringify(serialize(game('Dupre', 9)));
    const { g, p } = newGame();
    g.hooks.transfer = page({ paste: async () => file });
    p.keys.push(Pad.A, K.Up, Pad.A, Pad.A); // the clipboard; Add Dupre; (the message read)
    expect(await importGame(g)).toBe(false);
    expect(characterIds()).toEqual([iolo]);
    expect(currentCharacter()).toBe(iolo);
    expect(names()).toEqual(['Iolo']);
  });
});

describe('the most characters kept', () => {
  /** MAX_CHARACTERS characters, Avatars 'C1'... ; none chosen. */
  function full(): void {
    for (let i = 1; i <= MAX_CHARACTERS; i++) make(`C${i}`, i);
    chooseCharacter(null);
    vi.useRealTimers();
  }

  it('is eight', () => {
    expect(MAX_CHARACTERS).toBe(8);
  });

  it('makes Create New Character offer a deletion instead, and Back makes nothing', async () => {
    full();
    // Create New Character; Back; then Journey Onward, the picker (to end there).
    const { g, p } = await atTitle(K.Down, Pad.A, K.Down, Pad.A, Pad.A);
    expect(p.log.replace(/\s+/g, ' ')).toContain('8 characters are kept, all there is room for. Delete one');
    expect(characters()).toHaveLength(MAX_CHARACTERS);
    expect(g.menuShown?.title).toBe('Whose journey?');
  });

  it('lets one be deleted from there, which makes room', async () => {
    full();
    // Create New Character; Delete a character...; the first; Yes; then Journey Onward, the picker.
    await atTitle(K.Down, Pad.A, Pad.A, Pad.A, K.Down, Pad.A, Pad.A);
    expect(characters()).toHaveLength(MAX_CHARACTERS - 1);
  });

  it('refuses an import of a new name, but lets a namesake’s game be replaced (Keep both not offered)', async () => {
    full();
    const page = (text: string): Transfer => ({ copy: async () => undefined, paste: async () => text, open: async () => '' });
    const stranger = newGame();
    stranger.g.hooks.transfer = page(JSON.stringify(serialize(game('Dupre', 9))));
    stranger.p.keys.push(Pad.A, Pad.A); // the clipboard; (the message read)
    expect(await importGame(stranger.g)).toBe(false);
    expect(stranger.p.log.replace(/\s+/g, ' ')).toContain('all there is room for');
    expect(characters()).toHaveLength(MAX_CHARACTERS);
    const namesake = newGame();
    namesake.g.hooks.transfer = page(JSON.stringify(serialize(game('C3', 99))));
    const seen: string[][] = [];
    namesake.p.next = () => {
      if (namesake.g.menuShown?.title === 'Import?') seen.push(namesake.g.menuShown.labels);
      return seen.length ? (namesake.g.menuShown?.at === 0 ? Pad.A : K.Up) : Pad.A;
    };
    expect(await importGame(namesake.g)).toBe(true);
    expect(seen[0]).toEqual(["Replace C3's game", 'Cancel']);
    expect(characters()).toHaveLength(MAX_CHARACTERS);
    expect(goldOf(characters().find((c) => avatarName(c.data) === 'C3')!.data)).toBe(99);
  });

  it('does not hold back the saves from before characters, however many Avatars they were', () => {
    const texts = Array.from({ length: 10 }, (_, i) => JSON.stringify(serialize(game(`Old${i}`, i))));
    store.set(SAVE_KEY, texts[0]);
    const keys = texts.slice(1).map((t, i) => (store.set(`${SAVE_KEY}.${i + 1}`, t), `${SAVE_KEY}.${i + 1}`));
    store.set(SAVES_KEY, JSON.stringify({ next: 10, keys }));
    expect(characters()).toHaveLength(10);
  });
});

describe('a character list that fails', () => {
  it('damaged, loses nobody: every character is found by their saves', () => {
    make('Iolo', 1);
    make('Dupre', 2);
    store.set(CHARACTERS_KEY, '{"version":1,"ids":[tr'); // cut short
    chooseCharacter(null);
    expect(names().sort()).toEqual(['Dupre', 'Iolo']);
  });

  it('gone, loses nobody either', () => {
    make('Iolo', 1);
    store.delete(CHARACTERS_KEY);
    chooseCharacter(null);
    expect(names()).toEqual(['Iolo']);
  });

  it('not written as a character is made, still keeps their first save as theirs - never in the latest’s place', () => {
    const iolo = make('Iolo', 7);
    fault = (k) => {
      if (k === CHARACTERS_KEY) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    };
    const id = newCharacter();
    chooseCharacter(id);
    expect(localSave.write(game('Dupre', 9))).toBe(true);
    fault = null;
    chooseCharacter(iolo);
    expect(localSave.all().map((k) => goldOf(k.data))).toEqual([7]); // Iolo's untouched
    chooseCharacter(null);
    expect(names().sort()).toEqual(['Dupre', 'Iolo']); // and Dupre found by their save
  });
});

describe('going back to a save, with several characters', () => {
  /** Iolo saved at 1, 2, 3 gold; Dupre since, at 10, 20; Iolo in play, lying dead. */
  async function wipedIolo() {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 3, 10));
    const iolo = make('Iolo', 1, 2, 3);
    vi.setSystemTime(new Date(2026, 9, 3, 11));
    make('Dupre', 10, 20);
    vi.useRealTimers();
    chooseCharacter(iolo);
    const { g, p } = newGame();
    restore(g, localSave.read()!, true);
    g.inPlay = true;
    g.s.gold = 9999;
    for (const m of g.s.members.slice(0, g.s.partySize)) m.hp = 0;
    const { death } = await import('../src/game/story.ts');
    return { g, p, death };
  }

  it('All is lost’s last save is the one in play’s - not the newest of anyone’s', async () => {
    const { g, p, death } = await wipedIolo();
    p.next = () => Pad.A;
    await expect(death(g)).rejects.toBeInstanceOf(Relocate);
    expect(g.s.gold).toBe(3);
    expect(g.s.members[0].name).toBe('Iolo');
  });

  it('All is lost’s earlier saves are theirs alone', async () => {
    const { g, p, death } = await wipedIolo();
    let list: string[] = [];
    const script = [K.Down, Pad.A, K.Down, Pad.A]; // the earlier saves; the second (1 gold), past the grey line
    p.next = () => {
      if (g.menuShown?.title === 'Earlier saves') list = g.menuShown.labels;
      return script.shift() ?? Pad.A;
    };
    await expect(death(g)).rejects.toBeInstanceOf(Relocate);
    expect(list).toHaveLength(4); // two earlier saves, two lines each: Dupre's are not there
    expect(g.s.gold).toBe(1);
  });

  it('the Pause menu’s Load a save lists the one in play’s saves alone, and takes one up', async () => {
    const { g, p } = await wipedIolo();
    for (const m of g.s.members.slice(0, g.s.partySize)) m.hp = 100;
    g.s.mapId = 0;
    let listed: string[] = [];
    p.next = () => {
      const m = g.menuShown;
      if (!m) return Pad.A;
      if (m.title === 'Paused') return m.labels[m.at] === 'Load a save' ? Pad.A : K.Down;
      if (m.title === 'Load a save') {
        listed = m.labels;
        return m.at === 4 ? Pad.A : K.Down; // the oldest
      }
      return m.labels[m.at] === 'Yes' ? Pad.A : K.Down;
    };
    const { pauseMenu } = await import('../src/game/menu.ts');
    await expect(pauseMenu(g)).rejects.toBeInstanceOf(Relocate);
    expect(listed).toHaveLength(6); // Iolo's three
    expect(g.s.gold).toBe(1);
  });

  it('a save made in play goes to the one in play, though another saved since', () => {
    const iolo = make('Iolo', 1);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 60_000);
    const dupre = make('Dupre', 10);
    chooseCharacter(iolo);
    expect(localSave.write(game('Iolo', 2))).toBe(true);
    expect(localSave.all().map((k) => goldOf(k.data))).toEqual([2, 1]);
    chooseCharacter(dupre);
    expect(localSave.all().map((k) => goldOf(k.data))).toEqual([10]);
  });
});

describe('saves kept packed', () => {
  /**
   * A heavy game, as a long one leaves it: every map walked with the ragged edges sight leaves, the game's whole
   * vocabulary heard and every keyword answered, and two hundred clues in the journal, in the game's own words.
   */
  function heavy(name: string): Game {
    const g = game(name);
    let seed = 7;
    const rnd = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const real = [...analyse(g).learnable.keys()];
    const pick = (): string => real[Math.floor(rnd() * real.length)];
    g.words = Vocabulary.decode({
      known: real,
      heard: Array.from({ length: 1900 }, () => `${Math.floor(rnd() * 64)}.${Math.floor(rnd() * 32)}.${Math.floor(rnd() * 20)}`),
      labels: real.slice(0, 1300).map((w) => [w.slice(0, 4).toUpperCase(), w]),
    });
    g.notes = Array.from({ length: 200 }, () => ({
      who: pick(),
      where: pick(),
      text: Array.from({ length: 16 }, pick).join(' '),
      date: '4-5-139',
    }));
    const blobs = Array.from({ length: 400 }, () => [rnd() * 256, rnd() * 256, 4 + rnd() * 14]);
    for (const map of [g.fog.brit, g.fog.under])
      for (let i = 0; i < map.length; i++) {
        const [x, y] = [i % 256, i >> 8];
        map[i] = blobs.some(([bx, by, r]) => (x - bx) ** 2 + (y - by) ** 2 < r * r) && rnd() < 0.9 ? 1 : 0;
      }
    for (const [i, l] of readLocations(g.data.ovl).entries())
      for (const level of l.levels ?? [0])
        g.fog.places.set(
          placeKey(i + 1, level),
          new Uint8Array(TOWN_SIZE * TOWN_SIZE).map(() => (rnd() < 0.85 ? 1 : 0)),
        );
    return g;
  }

  it('give back the very text they were made from, any letters at all', () => {
    const g = game('Iolo');
    g.notes = [{ who: 'Ültima', where: 'Brïtannia', text: 'é – 🜂 ✦', date: '1-1-139' }];
    const text = JSON.stringify(serialize(g));
    expect(packSave(text).startsWith('z1:')).toBe(true);
    expect(/^[\x20-\x7e]+$/.test(packSave(text))).toBe(true); // ASCII alone: kept as it is everywhere
    expect(unpackSave(packSave(text))).toBe(text);
    expect(unpackSave(text)).toBe(text); // a save kept as text before, as it is
  });

  it('keep a heavy save in well under half its text, though this one is made hard to pack', () => {
    // (Its journal is words drawn at random, its keywords heard and its maps' edges noise: a real game's pack tighter.)
    const text = JSON.stringify(serialize(heavy('Iolo')));
    expect(text.length).toBeGreaterThan(100_000);
    expect(packSave(text).length).toBeLessThan(text.length / 2);
  });

  // (Eighty heavy saves written: some seconds.)
  it('let eight heavy characters keep all eight saves each in a browser’s five million characters', { timeout: 60_000 }, () => {
    const id = (): string => {
      const made = newCharacter();
      chooseCharacter(made);
      return made;
    };
    room = 5_000_000;
    const evicted = localSave.evicted;
    for (let c = 1; c <= MAX_CHARACTERS; c++) {
      id();
      const g = heavy(`C${c}`);
      for (let n = 0; n <= EARLIER; n++) {
        g.s.gold = n;
        expect(localSave.write(g)).toBe(true);
      }
    }
    expect(localSave.evicted).toBe(evicted);
    for (const c of characters()) {
      chooseCharacter(c.id);
      expect(localSave.all()).toHaveLength(EARLIER + 1);
    }
  });

  it('carry a heavy game out and in again through 7-bit ASCII and a mangling channel, whole', async () => {
    const g = heavy('Iolo');
    g.inPlay = true;
    const text = exportText(g)!;
    expect(/^[\x20-\x7e]*$/.test(text)).toBe(true);
    // Lines broken at 76, quotes curled, a BOM put in front.
    let q = 0;
    const sent =
      '\ufeff' +
      text
        .match(/.{1,76}/g)!
        .join('\r\n')
        .replace(/"/g, () => (q++ % 2 ? '\u201d' : '\u201c'));
    expect(mendImport(sent)).toBe(text);
    const back = newGame();
    back.g.hooks.transfer = { copy: async () => undefined, paste: async () => sent, open: async () => '' };
    back.p.keys.push(Pad.A, K.Up, Pad.A); // the clipboard; Add Iolo
    expect(await importGame(back.g)).toBe(true);
    const { settings: _settings, ...save } = JSON.parse(text) as Record<string, unknown>;
    expect(JSON.parse(unpackSave(store.get(saveKeys()!.last)!))).toEqual(save);
  });

  it('read a damaged packed save as no save, the one before it taken up instead', () => {
    const iolo = make('Iolo', 1, 2);
    chooseCharacter(iolo);
    const key = saveKeys()!.last;
    store.set(key, 'z1:' + store.get(key)!.slice(3, 40)); // cut short
    expect(goldOf(localSave.read())).toBe(1);
    store.set(key, 'z1:not base64 at all!');
    expect(goldOf(localSave.read())).toBe(1);
  });

  it('read saves kept as text before they were packed, and keep them among the earlier ones as they are', () => {
    const iolo = make('Iolo', 1);
    chooseCharacter(iolo);
    const key = saveKeys()!.last;
    const plain = unpackSave(store.get(key)!);
    store.set(key, plain); // as a save kept before packing was
    expect(goldOf(localSave.read())).toBe(1);
    expect(localSave.write(game('Iolo', 2))).toBe(true);
    expect(localSave.all().map((k) => goldOf(k.data))).toEqual([2, 1]);
  });
});

describe('a character’s settings, put to use', () => {
  /** Iolo in the PC (1988) look with scanlines and no music, then Dupre in the Modern look; none chosen. */
  function two(): { iolo: string; dupre: string } {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 3, 10));
    const iolo = make('Iolo', 7);
    saveOptions({ ...loadOptions(), tileSet: 'original', pcScanlines: true, musicLevel: 0, soundSet: 'original' });
    vi.setSystemTime(new Date(2026, 9, 3, 11));
    const dupre = make('Dupre', 8);
    saveOptions({ ...loadOptions(), tileSet: 'standard', musicLevel: 6, soundSet: 'standard' });
    chooseCharacter(null);
    vi.useRealTimers();
    return { iolo, dupre };
  }

  it('changes the look, the sound and the music to the character chosen at the title, and plays on in them', async () => {
    two();
    const applied: Options[] = [];
    // Journey Onward; the second line of the list (Iolo).
    const { g, done } = await atTitleWith((game) => (game.hooks.applyOptions = (o) => void applied.push({ ...o })), Pad.A, K.Down, Pad.A);
    expect(done).toBe(true);
    expect(applied.at(-1)).toMatchObject({ tileSet: 'original', pcScanlines: true, musicLevel: 0, soundSet: 'original' });
    expect(g.options).toMatchObject({ tileSet: 'original', musicLevel: 0 });
    // Changed in play, they are Iolo's: Dupre's untouched.
    saveOptions({ ...g.options, musicLevel: 6 });
    chooseCharacter(characters().find((c) => avatarName(c.data) === 'Dupre')!.id);
    expect(loadOptions()).toMatchObject({ tileSet: 'standard', soundSet: 'standard' });
  });

  it('puts the latest character’s back when the list is backed out of', async () => {
    two();
    const applied: Options[] = [];
    // Journey Onward; back; Journey Onward again (to end there).
    const { g } = await atTitleWith((game) => (game.hooks.applyOptions = (o) => void applied.push({ ...o })), Pad.A, Pad.B, Pad.A);
    expect(applied.at(-1)).toMatchObject({ tileSet: 'standard', musicLevel: 6 }); // Dupre's, the latest
    expect(g.options.tileSet).toBe('standard');
  });
});
