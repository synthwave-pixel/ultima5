import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  readOptions,
  switchAndKeep,
  switchOption,
  writeOptions,
  type OptionEffects,
  type SteamOptions,
} from '../../desktop/steamOptions.cjs';

/** The Steam options kept per machine (desktop/steamOptions.cjs). */
describe('the Steam options', () => {
  const OFF = { playLine: false, compatTool: false, macPlay: false, cloud: {}, results: {}, lineOnAt: 0 };
  const withDir = (run: (dir: string, file: string) => void) => {
    const dir = mkdtempSync(join(tmpdir(), 'u5-options-'));
    try {
      run(dir, join(dir, 'steam-options.json'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('are all off with no file', () => withDir((_dir, file) => expect(readOptions(file)).toEqual(OFF)));

  it('are all off after a corrupt file, or one of the wrong shape', () =>
    withDir((_dir, file) => {
      for (const text of ['{"playLine": tr', '', '[1]', 'null', '7']) {
        writeFileSync(file, text);
        expect(readOptions(file)).toEqual(OFF);
      }
    }));

  it('survive a write, each field as written', () =>
    withDir((dir, file) => {
      const o = {
        playLine: true,
        compatTool: false,
        macPlay: true,
        cloud: { '12345': true },
        results: { playLine: 'on' },
        lineOnAt: 1_700_000_000_000,
      };
      writeOptions(file, o);
      expect(readOptions(file)).toEqual(o);
      expect(readdirSync(dir)).toEqual(['steam-options.json']);
    }));

  it('take a field only when it is as it should be', () =>
    withDir((_dir, file) => {
      writeFileSync(
        file,
        JSON.stringify({
          playLine: 'yes',
          compatTool: true,
          macPlay: 1,
          cloud: { a: true, b: 'on', c: false },
          results: { x: 'ok', y: 3 },
          lineOnAt: 'soon',
        }),
      );
      expect(readOptions(file)).toEqual({ ...OFF, compatTool: true, cloud: { a: true }, results: { x: 'ok' } });
    }));

  it('are not fatal to fail to write, and say whether they were written', () =>
    withDir((_dir, file) => {
      expect(writeOptions('/dev/null/steam-options.json', { ...OFF })).toBe(false);
      expect(writeOptions(file, { ...OFF })).toBe(true);
    }));
});

/** An option turned on or off (desktop/steamOptions.cjs switchOption): its effect here, its result kept, and what to say. */
describe('switching a Steam option', () => {
  const OFF: SteamOptions = { playLine: false, compatTool: false, macPlay: false, cloud: {}, results: {}, lineOnAt: 0 };
  const NOW = 1_800_000_000_000;
  /** Effects that only note what was asked, each answering as `as` says. */
  const effects = (calls: string[], as: Partial<OptionEffects> = {}): OptionEffects => ({
    line: () => (calls.push('line'), '"/opt/ultima5-sp-x86_64.AppImage" %command%'),
    installTool: () => (calls.push('install'), ['/home/u/.steam/root/compatibilitytools.d/ultima5_sp']),
    removeTool: () => void calls.push('remove'),
    macSetup: async () => (calls.push('macSetup'), 'done'),
    macRestore: async () => (calls.push('macRestore'), 'done'),
    ...as,
  });
  const turn = (name: string, on: boolean, more: Partial<Parameters<typeof switchOption>[0]> = {}, calls: string[] = []) =>
    switchOption({ options: OFF, name, on, system: 'linux', account: null, now: NOW, effects: effects(calls), ...more });
  const ascii = (s: string) => expect(s.match(/[^\x20-\x7e]/g) ?? []).toEqual([]);

  it('shows the launch line once its option is on, and notes when, for the line check', async () => {
    const calls: string[] = [];
    const r = (await turn('playLine', true, {}, calls))!;
    expect(r.on).toBe(true);
    expect(r.line).toBe('"/opt/ultima5-sp-x86_64.AppImage" %command%');
    expect(r.options).toMatchObject({ playLine: true, lineOnAt: NOW, results: { playLine: 'on: done' } });
    expect(r.message).toContain('Launch Options');
    expect(r.message).toContain('Proton'); // Linux: Proton chosen, for Steam to download the game
    expect(calls).toEqual(['line']);
  });

  it("tells the player to clear the line when it is turned off, Steam's files left alone", async () => {
    const calls: string[] = [];
    const r = (await turn('playLine', false, { options: { ...OFF, playLine: true, lineOnAt: NOW } }, calls))!;
    expect(r.on).toBe(false);
    expect(r.options).toMatchObject({ playLine: false, results: { playLine: 'off: done' } });
    expect(r.message).toContain('clear the line');
    expect(calls).toEqual([]);
  });

  it('stays off where this copy has no launch line (the portable .exe), and says so', async () => {
    const r = (await turn('playLine', true, { system: 'windows', effects: effects([], { line: () => null }) }))!;
    expect(r.on).toBe(false);
    expect(r.options.playLine).toBe(false);
    expect(r.options.results.playLine).toBe('on: no launch line');
    expect(r.message).toContain('installed Ultima V');
  });

  it('installs and removes the compatibility tool, saying to restart Steam', async () => {
    const calls: string[] = [];
    const on = (await turn('compatTool', true, {}, calls))!;
    expect(on.options).toMatchObject({ compatTool: true, results: { compatTool: 'on: done' } });
    expect(on.message).toContain('Restart Steam');
    const off = (await turn('compatTool', false, { options: on.options }, calls))!;
    expect(off.options).toMatchObject({ compatTool: false, results: { compatTool: 'off: done' } });
    expect(off.message).toContain('Restart Steam');
    expect(calls).toEqual(['install', 'remove']);
  });

  it('leaves the tool off where it could not be written, with the reason kept', async () => {
    const none = (await turn('compatTool', true, { effects: effects([], { installTool: () => [] }) }))!;
    expect(none.options.compatTool).toBe(false);
    expect(none.message).toContain("Steam isn't here");
    const cannot = (await turn('compatTool', true, { effects: effects([], { installTool: () => null }) }))!;
    expect(cannot.options.compatTool).toBe(false);
    expect(cannot.message).toContain('Flatpak or the AppImage');
    const calls: string[] = [];
    const broke = (await turn('compatTool', true, {
      effects: effects(calls, {
        installTool: () => {
          throw new Error('EACCES');
        },
      }),
    }))!;
    // What was written before it stopped is taken away again, so nothing is left with the option off.
    expect(calls).toEqual(['remove']);
    expect(broke.options.compatTool).toBe(false);
    expect(broke.options.results.compatTool).toBe('on: failed: EACCES');
    expect(broke.message).toBe("That didn't work: EACCES");
    // Where taking it away fails too, it is still the install's failure that is said.
    const worse = (await turn('compatTool', true, {
      effects: effects([], {
        installTool: () => {
          throw new Error('EACCES');
        },
        removeTool: () => {
          throw new Error('EBUSY');
        },
      }),
    }))!;
    expect(worse.message).toBe("That didn't work: EACCES");
  });

  it('sets a Mac up and takes it away, and stays as it was where Steam would not quit', async () => {
    const calls: string[] = [];
    const on = (await turn('macPlay', true, { system: 'mac' }, calls))!;
    expect(on.options).toMatchObject({ macPlay: true, results: { macPlay: 'on: done' } });
    const off = (await turn('macPlay', false, { system: 'mac', options: on.options }, calls))!;
    expect(off.options).toMatchObject({ macPlay: false, results: { macPlay: 'off: done' } });
    expect(calls).toEqual(['macSetup', 'macRestore']);
    const running = (await turn('macPlay', true, { system: 'mac', effects: effects([], { macSetup: async () => 'steam-running' }) }))!;
    expect(running.options.macPlay).toBe(false);
    expect(running.options.results.macPlay).toBe('on: steam-running');
    expect(running.message).toContain("Steam didn't quit");
    const stuck = (await turn('macPlay', false, {
      system: 'mac',
      options: { ...OFF, macPlay: true },
      effects: effects([], { macRestore: async () => 'steam-running' }),
    }))!;
    expect(stuck.options.macPlay).toBe(true);
  });

  it("refuses an option this system doesn't have, and leaves the options as they were", async () => {
    expect(await turn('macPlay', true, { system: 'linux' })).toBeNull();
    expect(await turn('compatTool', true, { system: 'windows' })).toBeNull();
    expect(await turn('playLine', true, { system: 'mac' })).toBeNull();
    expect(await turn('bogus', true)).toBeNull();
  });

  it("records Cloud saves for this launch's account only, and a failed copy without switching it", async () => {
    expect(await turn('cloud', true)).toBeNull(); // no account known
    const on = (await turn('cloud', true, { account: '42' }))!;
    expect(on.options).toMatchObject({ cloud: { '42': true }, results: { cloud: 'on: done' } });
    const failed = (await turn('cloud', false, { account: '42', options: on.options, failed: 'ENOSPC' }))!;
    expect(failed.on).toBe(true);
    expect(failed.options).toMatchObject({ cloud: { '42': true }, results: { cloud: 'off: failed: ENOSPC' } });
    const off = (await turn('cloud', false, { account: '42', options: on.options }))!;
    expect(off.options.cloud).toEqual({});
  });

  it('never changes the options it was given', async () => {
    const given = structuredClone(OFF);
    await turn('playLine', true, { options: given });
    expect(given).toEqual(OFF);
  });

  it('says everything in letters the game can draw', async () => {
    const fails = { macSetup: async () => 'not-owned' as const };
    for (const [name, system] of [
      ['playLine', 'windows'],
      ['playLine', 'linux'],
      ['compatTool', 'linux'],
      ['macPlay', 'mac'],
    ])
      for (const on of [true, false]) {
        ascii((await turn(name, on, { system }))!.message);
        ascii((await turn(name, on, { system, effects: effects([], { ...fails, line: () => null, installTool: () => [] }) }))!.message);
      }
  });
});

/** An option switched and kept (desktop/steamOptions.cjs switchAndKeep), as main.cjs answers the page. */
describe('keeping a Steam option switched', () => {
  const OFF: SteamOptions = { playLine: false, compatTool: false, macPlay: false, cloud: {}, results: {}, lineOnAt: 0 };
  const effects: OptionEffects = {
    line: () => 'x %command%',
    installTool: () => ['/s/compatibilitytools.d/ultima5_sp'],
    removeTool: () => undefined,
    macSetup: async () => 'done',
    macRestore: async () => 'done',
  };
  const args = (name: string, on: boolean, account: string | null = null) => ({
    options: OFF,
    name,
    on,
    system: 'linux',
    account,
    now: 1,
    effects,
  });
  const UNWRITABLE = '/dev/null/steam-options.json';

  it('writes the switch and tells the page how it went', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'u5-options-'));
    try {
      const file = join(dir, 'steam-options.json');
      const line = (await switchAndKeep(file, args('playLine', true)))!;
      expect(line).toMatchObject({ on: true, line: 'x %command%' });
      expect(line.message).toContain('Launch Options');
      expect(readOptions(file).playLine).toBe(true);
      expect(await switchAndKeep(file, args('cloud', true, '42'))).toEqual({ on: true, message: '' });
      expect(await switchAndKeep(file, args('macPlay', true))).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("tells the page a switch couldn't be kept, the option as it was, where the file can't be written", async () => {
    const cloud = (await switchAndKeep(UNWRITABLE, args('cloud', true, '42')))!;
    expect(cloud).toEqual({ on: false, message: "The app's settings couldn't be saved, so this can't change now." });
    const line = (await switchAndKeep(UNWRITABLE, args('playLine', true)))!;
    expect(line.on).toBe(false);
    expect(line.line).toBeUndefined();
    expect(line.message).toContain("But the app's settings couldn't be saved, so this shows as it was.");
    expect(line.message.match(/[^\x20-\x7e]/g) ?? []).toEqual([]);
  });
});
