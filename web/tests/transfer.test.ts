import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chooseCharacter } from '../src/game/characters.ts';
import { K } from '../src/game/io';
import { wrap } from '../src/game/menu';
import { SAVE_KEY, saveKeys, serialize, unpackSave } from '../src/game/storage';
import { asciiJson, exportGame, exportName, exportText, importGame, mendImport, type Transfer } from '../src/game/transfer';
import { parseSave } from '../src/game/storage';
import { newGame } from './helpers';

/**
 * A game carried between browsers, devices and the apps (transfer.ts, the ultima3 port's Export and Import): out to
 * the clipboard or a file and back from either, chosen on the screen, and put in the saved game's place only when
 * the player says so.
 */

/** The browser's local storage, in memory. */
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  chooseCharacter(null); // no character of an earlier test's in play
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});
afterEach(() => delete (globalThis as { localStorage?: unknown }).localStorage);

/** A page's clipboard and files, remembering what went through them. */
function page(over: Partial<Transfer> = {}): Transfer & { copied: string[]; saved: [string, string][] } {
  const copied: string[] = [];
  const saved: [string, string][] = [];
  return {
    copied,
    saved,
    copy: async (text) => void copied.push(text),
    paste: async () => '',
    save: async (text, name) => {
      saved.push([text, name]);
      return name;
    },
    open: async () => '',
    ...over,
  };
}

/** A game at the title (none in play) with `keys` to press, and the page's clipboard and files. */
function title(transfer: Transfer, ...keys: number[]) {
  const made = newGame();
  made.g.hooks.transfer = transfer;
  made.p.keys.push(...keys);
  return made;
}

describe('exporting a game', () => {
  it('takes the game in play, or at the title the saved one, and names its file for the minute', () => {
    const { g } = newGame();
    expect(exportText(g)).toBeNull(); // at the title, nothing saved
    const saved = JSON.stringify(serialize(g));
    store.set(SAVE_KEY, saved);
    expect(exportText(g)).toBe(saved);
    g.inPlay = true;
    g.s.members[0].name = 'Shalom';
    expect((JSON.parse(exportText(g)!) as { save: string }).save).toBe(serialize(g).save);
    expect(exportName(new Date(2026, 8, 26, 14, 5))).toBe('ultima5-20260926-1405.json');
  });

  it('copies it to the clipboard, or saves it as a file, as the player chooses', async () => {
    const saved = JSON.stringify(serialize(newGame().g));
    store.set(SAVE_KEY, saved);
    const clip = page();
    await exportGame(title(clip, K.Enter, K.Enter).g);
    expect(clip.copied).toEqual([saved]);
    const file = page();
    await exportGame(title(file, K.Down, K.Enter, K.Enter).g);
    expect(file.saved[0][0]).toBe(saved);
    expect(file.saved[0][1]).toMatch(/^ultima5-([A-Za-z0-9]+-)?\d{8}-\d{4}\.json$/);
  });

  it('says nothing more where the player chose no place for the file, and tells the name they chose where they did', async () => {
    store.set(SAVE_KEY, JSON.stringify(serialize(newGame().g)));
    const none = title(page({ save: async () => null }), K.Down, K.Enter);
    await exportGame(none.g);
    expect(none.p.log).not.toContain('saved as');
    const renamed = title(page({ save: async () => 'mine.json' }), K.Down, K.Enter, K.Enter);
    await exportGame(renamed.g);
    expect(renamed.p.log.replace(/\s+/g, ' ')).toContain('saved as mine.json.');
  });

  it("saves the file by the Android app's own picker there, the web view downloading nothing", async () => {
    const { androidSave } = await import('../src/ui/pageHooks.ts');
    expect(androidSave(undefined)).toBeNull();
    const asked: { text: string; name: string }[] = [];
    let answer: { name: string } | { cancelled: true } = { name: 'ultima5-20260926-1405 (1).json' };
    const app = (platform: string, saveFile?: unknown) => ({ getPlatform: () => platform, Plugins: { GameFolder: { saveFile } } });
    const saveFile = async (o: { text: string; name: string }) => (asked.push(o), answer);
    expect(androidSave(app('ios', saveFile))).toBeNull();
    expect(androidSave(app('android'))).toBeNull(); // an app built before it could: the clipboard only
    const save = androidSave(app('android', saveFile))!;
    expect(await save('{"save":1}', 'ultima5-20260926-1405.json')).toBe('ultima5-20260926-1405 (1).json');
    expect(asked).toEqual([{ text: '{"save":1}', name: 'ultima5-20260926-1405.json' }]);
    answer = { cancelled: true };
    expect(await save('{"save":1}', 'ultima5-20260926-1405.json')).toBeNull();
  });

  it("tells the file's name whole, broken after a hyphen where the panel is too narrow for it", () => {
    expect(wrap('The game is saved as ultima5-20260926-1032.json.')).toEqual(['The game is saved as', 'ultima5-20260926-', '1032.json.']);
  });

  it('offers no file where none can be written (the Android app): the clipboard is the way out', async () => {
    store.set(SAVE_KEY, JSON.stringify(serialize(newGame().g)));
    const clip = page({ save: undefined });
    await exportGame(title(clip, K.Down, K.Enter, K.Enter).g);
    expect(clip.copied).toHaveLength(1); // the only line, however far down the bar was pressed
  });
});

describe('importing a game', () => {
  const game = (): string => JSON.stringify(serialize(newGame().g));

  it('takes one from the clipboard and keeps it as a character once the player says to', async () => {
    const text = game();
    const { g } = title(page({ paste: async () => text }), K.Enter, K.Up, K.Enter);
    expect(await importGame(g)).toBe(true);
    expect(unpackSave(store.get(saveKeys()!.last)!)).toBe(text);
  });

  it('keeps the saved game when the player keeps it - where the choice starts', async () => {
    store.set(SAVE_KEY, 'the old one');
    const { g } = title(page({ paste: async () => game() }), K.Enter, K.Enter);
    expect(await importGame(g)).toBe(false);
    expect(store.get(SAVE_KEY)).toBe('the old one');
  });

  it("offers the page's box where the clipboard cannot be read, and reads a file", async () => {
    const text = game();
    const boxed = title(
      page({
        paste: () => Promise.reject(new Error('denied')),
        pasteBox: async () => text,
      }),
      K.Enter,
      K.Up,
      K.Enter,
    );
    expect(await importGame(boxed.g)).toBe(true);
    store.clear();
    const filed = title(page({ open: async () => text }), K.Down, K.Enter, K.Up, K.Enter);
    expect(await importGame(filed.g)).toBe(true);
    expect(unpackSave(store.get(saveKeys()!.last)!)).toBe(text);
  });

  it('says why text is not a saved game, and asks nothing when no file is picked', async () => {
    const bad = title(page({ paste: async () => '{"game":"ultima3"}' }), K.Enter, K.Enter);
    expect(await importGame(bad.g)).toBe(false);
    expect(bad.p.log.replace(/\s+/g, '')).toContain('Thatwillnotdo:notanUltimaVsave.'); // as the screen wraps it
    expect(store.has(SAVE_KEY)).toBe(false);
    const none = title(page(), K.Down, K.Enter);
    expect(await importGame(none.g)).toBe(false);
  });
});

describe('a game carried through 7-bit ASCII', () => {
  /** A game in play whose journal has letters past ASCII in it, and settings of its own. */
  function abroad() {
    const made = newGame();
    made.g.inPlay = true;
    made.g.s.members[0].name = 'Shalom';
    made.g.notes = [{ who: 'Ültima’s scribe', where: 'Brïtannia', text: '“Seek the Codex” – the 🜂 rune ✦', date: '4-5-139' }];
    made.g.options.scanlines = true;
    return made;
  }

  /** What mail, chat and clipboards may do to a long line on the way: all of it at once. */
  function mangled(text: string): string {
    const wrapped = text.match(/.{1,76}/g)!.join('\r\n'); // broken into lines, mid-string too
    let q = 0;
    const curled = wrapped.replace(/"/g, () => (q++ % 2 ? '\u201d' : '\u201c')); // quotes made curly
    return '\ufeff' + curled.replace(/:/g, ':\u200b').replace(/, /g, ',\u00a0') + '\n'; // a BOM, zero-widths, NBSPs
  }

  it('is exported in 7-bit ASCII, whatever the journal says, and reads back the same', () => {
    const { g } = abroad();
    const text = exportText(g)!;
    expect(/^[\x20-\x7e]*$/.test(text)).toBe(true);
    const back = JSON.parse(text) as { notes: { text: string; who: string }[] };
    expect(back.notes[0]).toEqual(g.notes[0]);
    expect(asciiJson({ a: 'é' })).toBe('{"a":"\\u00e9"}');
  });

  it('comes back whole through lines broken, quotes curled, and a BOM, zero-width and unbreakable spaces put in', async () => {
    const { g } = abroad();
    const text = exportText(g)!;
    const sent = JSON.parse(text) as Record<string, unknown>;
    const mended = mendImport(mangled(text));
    expect(mended).toBe(text);
    const back = newGame();
    back.g.hooks.transfer = page({ paste: async () => mangled(text) });
    back.p.keys.push(K.Enter, K.Up, K.Enter); // the clipboard; Add Shalom
    expect(await importGame(back.g)).toBe(true);
    const { settings, ...save } = sent;
    expect(parseSave(unpackSave(store.get(saveKeys()!.last)!))).toEqual(save);
    expect((settings as { scanlines: boolean }).scanlines).toBe(true);
    const { loadOptions } = await import('../src/game/settings');
    expect(loadOptions().scanlines).toBe(true);
  });

  it('keeps the music and the sound effects Off of a game exported before the mixer', async () => {
    const { g } = abroad();
    const old = JSON.stringify({ ...serialize(g), settings: { music: false, soundSet: 'off', scanlines: true } });
    const back = newGame();
    back.g.hooks.transfer = page({ paste: async () => old });
    back.p.keys.push(K.Enter, K.Up, K.Enter);
    expect(await importGame(back.g)).toBe(true);
    const { loadOptions } = await import('../src/game/settings');
    expect(loadOptions()).toMatchObject({ musicLevel: 0, effectsLevel: 0, soundSet: 'standard', scanlines: true });
  });

  it('takes an older export, with letters past ASCII as they are, as before', async () => {
    const { g } = abroad();
    const old = JSON.stringify(serialize(g)); // as exports were made before: UTF-8, no settings
    expect(/[^\x20-\x7e]/.test(old)).toBe(true);
    const back = newGame();
    back.g.hooks.transfer = page({ paste: async () => old });
    back.p.keys.push(K.Enter, K.Up, K.Enter);
    expect(await importGame(back.g)).toBe(true);
    const kept = parseSave(unpackSave(store.get(saveKeys()!.last)!));
    expect(kept.save).toBe(serialize(g).save);
    expect(kept.notes![0].where).toBe('Brïtannia');
  });

  it('is named for its Avatar in plain letters, whatever the name', () => {
    expect(exportName(new Date(2026, 9, 3, 9, 5), 'Ültima Øne')).toBe('ultima5-ltimane-20261003-0905.json');
  });
});
