import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { CHARACTERS_KEY, characterIds, chooseCharacter, listText } from '../src/game/characters.ts';
import type { Game, SteamChoices, SteamHook, SteamStatus } from '../src/game/game.ts';
import { Intro } from '../src/game/intro.ts';
import { K, Pad } from '../src/game/io.ts';
import { cloudSaves, kept, useStore } from '../src/game/keyStore.ts';
import { settingLines } from '../src/game/menu.ts';
import { APPIMAGE_PAGE, ISSUES, steamMenu } from '../src/game/steamMenu.ts';
import { localSave, saveKeys, serialize, type SaveData } from '../src/game/storage.ts';
import { newGame, type FakePlatform } from './helpers.ts';

/**
 * The title's Steam (beta) menu (steamMenu.ts, cloudSwitch.ts): what was found of Steam, the options for this system,
 * each off until turned on through the desktop app, Cloud saves' copy with its clashes asked one by one, and the
 * tester's two buttons.
 */

type Keys = Record<string, string>;

/** A Steam hook for the menu, every call noted, its options switched as asked; the saves on each side in maps. */
function fake(status: Partial<SteamStatus> = {}, choices: Partial<SteamChoices> = {}) {
  const st: SteamStatus = {
    system: 'linux',
    flatpak: false,
    steam: '~/.steam/steam',
    game: 'ok',
    where: '~/.steam/steam/steamapps/common/Ultima V',
    account: true,
    launch: false,
    line: '"~/ultima5-sp-x86_64.AppImage" %command%',
    ...status,
  };
  const o: SteamChoices = { playLine: false, compatTool: false, macPlay: false, cloud: false, cloudAny: false, ...choices };
  const calls: string[] = [];
  const own = new Map<string, string>();
  const steam = new Map<string, string>();
  // `refuse`: every write refused, with that code; `failAt`: only the write of that number (from 1), with ENOSPC;
  // `unkept`: the switch not kept by the app (its settings file not written), with that to say.
  const state = {
    steamReadable: true,
    refuse: null as string | null,
    failAt: 0,
    writes: 0,
    used: null as boolean | null,
    unkept: null as string | null,
  };
  const recorded: [boolean, string | undefined][] = [];
  const side = (s: 'own' | 'steam') => (s === 'own' ? own : steam);
  const hook: SteamHook = {
    status: async () => st,
    launched: () => st.launch,
    options: () => ({ ...o, cloudAny: o.cloudAny || o.cloud }),
    setOption: async (name, on) => {
      calls.push(`${name} ${on ? 'on' : 'off'}`);
      o[name] = on;
      return { on, message: `Now ${name} is ${on ? 'on' : 'off'}.`, ...(name === 'playLine' && on && st.line ? { line: st.line } : {}) };
    },
    lineState: async () => (calls.push('lineState'), { state: 'missing', bothLinux: o.playLine && o.compatTool }),
    copyLine: async () => (calls.push('copyLine'), true),
    copyReport: async () => (calls.push('copyReport'), true),
    open: (url) => void calls.push(`open ${url}`),
    cloud: {
      own: () => Object.fromEntries(own),
      steam: () => (state.steamReadable ? Object.fromEntries(steam) : null),
      write: (s, k, v) => {
        if (state.refuse !== null) return state.refuse;
        if (++state.writes === state.failAt) return 'ENOSPC';
        side(s).set(k, v);
        return true;
      },
      remove: (s, k) => side(s).delete(k) || true,
      record: async (on, failed) => {
        recorded.push([on, failed]);
        if (state.unkept !== null) return { on: o.cloud, message: state.unkept };
        if (failed === undefined) o.cloud = on;
        return { on: o.cloud, message: '' };
      },
      use: (on) => void (state.used = on),
    },
  };
  return { hook, calls, own, steam, state, recorded, options: o };
}

/** Everything a box showed: its title, its lines and which could be chosen. */
interface Shown {
  title: string;
  labels: string[];
  enabled: boolean[];
}

/**
 * The Steam (beta) menu opened, and each box answered in turn: the lines named in `script` chosen in order (a line's
 * start will do; a function is run as it is reached), then out by Back (or OK, No, Cancel). A box of text is closed.
 */
async function drive(g: Game, p: FakePlatform, script: (string | (() => void))[] = []) {
  g.options.input = 'controller';
  const todo = [...script];
  const shown: Shown[] = [];
  let steps = 0;
  p.next = () => {
    if (++steps > 3000) throw new Error('lost in the menus');
    const m = g.menuShown;
    if (!m) return Pad.A;
    const now = { title: m.title, labels: [...m.labels], enabled: [...m.enabled] };
    if (JSON.stringify(shown.at(-1)) !== JSON.stringify(now)) shown.push(now);
    while (typeof todo[0] === 'function') (todo.shift() as () => void)();
    const want = (todo[0] as string | undefined) ?? ['Back', 'OK', 'No', 'Cancel'].find((l) => m.labels.includes(l))!;
    if (!m.labels[m.at].startsWith(want)) return K.Down;
    if (todo.length > 0) todo.shift();
    return Pad.A;
  };
  await steamMenu(g);
  // (What was printed, the spaces left out: a line the width of the box runs into the next with none between.)
  return { shown, said: sq(p.log), menus: shown.filter((s) => s.title === 'Steam (beta)') };
}

/** Text with its spaces left out, to find in what was printed. */
const sq = (text: string): string => text.replace(/\s+/g, '');

/** The menu's choosable lines, as last shown. */
const choosable = (s: Shown): string[] => s.labels.filter((_, i) => s.enabled[i]);

/** A save of `name` at `level`, written at `written`. */
function save(g: Game, name: string, level: number, written: number): SaveData {
  g.s.members[0].name = name;
  g.s.members[0].level = level;
  return { ...serialize(g), written };
}

/**
 * Character `id`'s keys: `saves` newest first, the first their last save, the rest their earlier ones, numbered down
 * from `top`.
 */
function character(id: string, saves: SaveData[], top = saves.length - 2): Keys {
  const { last, index } = saveKeys(id)!;
  const out: Keys = { [last]: JSON.stringify(saves[0]) };
  const keys = saves.slice(1).map((d, i) => {
    const key = `${last}.${top - i}`;
    out[key] = JSON.stringify(d);
    return key;
  });
  out[index] = JSON.stringify({ next: top + 1, keys });
  out[CHARACTERS_KEY] = listText([id]);
  return out;
}

const fill = (m: Map<string, string>, keys: Keys): void => Object.entries(keys).forEach(([k, v]) => m.set(k, v));

/** A Storage over a map. */
function mapStorage(m: Map<string, string>): Storage {
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
  };
}

describe('Steam (beta) on the title', () => {
  const storage = (): void => {
    const m = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      key: (i: number) => [...m.keys()][i] ?? null,
      get length() {
        return m.size;
      },
      clear: () => m.clear(),
    };
  };

  it('is a line of the title only where the page has a Steam hook', async () => {
    storage();
    const without = newGame();
    expect((new Intro(without.g) as unknown as { menuKeys(): string }).menuKeys()).not.toContain('T');
    const { g, p } = newGame();
    g.hooks.steam = fake().hook;
    expect((new Intro(g) as unknown as { menuKeys(): string }).menuKeys()).toBe('JCUARSMT');
    // No game saved: the bar on Create New Character; up past Journey Onward (grey) to the last line, Steam (beta).
    p.keys.push(K.Escape, K.Escape, K.Escape, K.Up, Pad.A);
    await expect(new Intro(g).run()).rejects.toThrow('script ran out of keys');
    expect(p.rows.map((r) => r.join('')).join('\n')).toContain('Steam (beta)');
    expect(g.menuShown?.title).toBe('Steam (beta)');
  });

  it('shows the edition and its version above the menu, in the desktop app and on the web', async () => {
    storage();
    /** What the title printed, up to Manage Saves (up from Create New Character), which waits for a key. */
    const printed = async (version?: string): Promise<string> => {
      const { g, p } = newGame();
      if (version) g.hooks.version = () => version;
      p.keys.push(K.Escape, K.Escape, K.Escape, K.Up, Pad.A);
      await expect(new Intro(g).run()).rejects.toThrow('script ran out of keys');
      return p.log;
    };
    expect(await printed('1.1.195')).toContain('Ultima V SP 1.1.195');
    const web = await printed();
    expect(web).toContain('Ultima V SP');
    expect(web).not.toContain('Ultima V SP 1.');
  });

  it('stands Launch From Steam in place of the lines that start a game, where Play from Steam is on outside Steam', () => {
    storage();
    const keys = (choices: Partial<SteamChoices>, status: Partial<SteamStatus> = {}): string => {
      const { g } = newGame();
      g.hooks.steam = fake(status, choices).hook;
      return (new Intro(g) as unknown as { menuKeys(): string }).menuKeys();
    };
    expect(keys({ playLine: true })).toBe('LUARMT');
    expect(keys({ compatTool: true })).toBe('LUARMT');
    expect(keys({ macPlay: true }, { system: 'mac' })).toBe('LUARMT');
    // Started by Steam, or with no Play from Steam on (Cloud saves alone starts nothing), the title is as ever.
    expect(keys({ playLine: true }, { launch: true })).toBe('JCUARSMT');
    expect(keys({ cloud: true })).toBe('JCUARSMT');
  });

  it('shows Launch From Steam grey, passed over by the bar, and takes no key for the lines it stands for', async () => {
    storage();
    const { g, p } = newGame();
    g.hooks.steam = fake({}, { playLine: true }).hook;
    // J, C, S and L do nothing; up from the first line the bar can take passes over it to the last, Steam (beta).
    p.keys.push(K.Escape, K.Escape, K.Escape, 0x4a, 0x43, 0x53, 0x4c, K.Up, Pad.A);
    await expect(new Intro(g).run()).rejects.toThrow('script ran out of keys');
    const rows = p.rows.map((r) => r.join('')).join('\n');
    expect(rows).toContain('Launch From Steam');
    expect(rows).not.toContain('Journey Onward');
    expect(g.menuShown?.title).toBe('Steam (beta)');
  });

  it('is no longer a line of Settings', () => {
    const { g } = newGame();
    g.hooks.steam = fake().hook;
    for (const title of [false, true])
      expect(
        settingLines(g, title)
          .map((l) => l.label)
          .filter((l) => /steam/i.test(l)),
      ).toEqual([]);
  });
});

describe('the Steam (beta) menu', () => {
  it('shows the same six lines on every system and in every state, with no paths in its body', async () => {
    const SIX = ['Back', 'Play from Steam: Off', 'Cloud Saves: Off', 'Copy report', 'Report an issue', 'Paths'];
    for (const system of ['linux', 'windows', 'mac'] as const)
      for (const status of [{}, { steam: null, game: 'none' as const }, { launch: true }]) {
        const { g, p } = newGame();
        g.hooks.steam = fake({ system, ...status }).hook;
        const { menus, said } = await drive(g, p);
        expect(menus[0].labels).toEqual(SIX);
        expect(said).not.toContain(sq('~/.steam/steam'));
      }
    const on = newGame();
    on.g.hooks.steam = fake({ system: 'mac', line: null }, { macPlay: true, cloudAny: true }).hook;
    expect((await drive(on.g, on.p)).menus[0].labels).toEqual([
      'Back',
      'Play from Steam: On',
      'Cloud Saves: On',
      'Copy report',
      'Report an issue',
      'Paths',
    ]);
  });

  it('shows the paths only when Paths is chosen', async () => {
    const { g, p } = newGame();
    g.hooks.steam = fake().hook;
    const { shown } = await drive(g, p, ['Paths']);
    const page = shown.find((s) => s.title === 'Paths');
    expect(page).toBeUndefined(); // a page of text, not a menu: what it printed is in the log
    expect(sq(p.log)).toContain(sq('~/.steam/steam/steamapps/common/Ultima V/ultima5-sp/<account>'));
    const short = newGame();
    short.g.hooks.steam = fake({ steam: '~/S', where: '~/S/U' }).hook;
    await drive(short.g, short.p, ['Paths']);
    expect(sq(short.p.log)).toContain(sq('Launch line: "~/ultima5-sp-x86_64.AppImage" %command%'));
  });

  it('greys the options that need Steam where it is missing, and where what Steam has could not be read', async () => {
    const { g, p } = newGame();
    g.hooks.steam = fake({ steam: null, game: 'none', where: '', account: false }).hook;
    expect(choosable((await drive(g, p)).menus[0])).toEqual(['Back', 'Copy report', 'Report an issue', 'Paths']);
    const unread = newGame();
    const f = fake();
    f.hook.status = () => Promise.reject(new Error('no'));
    unread.g.hooks.steam = f.hook;
    const { menus, said } = await drive(unread.g, unread.p, ['Paths']);
    expect(choosable(menus[0])).toEqual(['Back', 'Copy report', 'Report an issue', 'Paths']);
    expect(said).toContain(sq('What Steam has could not be read here.'));
  });

  it('says in the note of an option that is on how it stands', async () => {
    const notes = async (status: Partial<SteamStatus>, choices: Partial<SteamChoices>, script = ['Paths']) => {
      const { g, p } = newGame();
      g.hooks.steam = fake(status, choices).hook;
      return (await drive(g, p, script)).said;
    };
    expect(await notes({ system: 'mac', line: null }, { macPlay: true })).toContain(
      sq("If Steam says 'Invalid platform', open this app with Steam closed."),
    );
    expect(await notes({ system: 'windows' }, { playLine: true })).toContain(
      sq('Steam has no launch line yet: copy it, and paste it into Launch Options.'),
    );
    expect(await notes({ system: 'linux' }, { compatTool: true })).toContain(
      sq('Compat. tool on: in Steam, choose Ultima V SP under Compatibility.'),
    );
    const both = await notes({ system: 'linux' }, { playLine: true, compatTool: true }, ['Play from Steam', 'Compat. tool']);
    expect(both).toContain(sq('Unused: the launch line is on too, and Steam runs that.'));
  });

  it("opens Play from Steam's own menu on Windows and Linux, every option off until turned on", async () => {
    const lines = async (system: SteamStatus['system']) => {
      const { g, p } = newGame();
      g.hooks.steam = fake({ system, line: 'x %command%' }).hook;
      return (await drive(g, p, ['Play from Steam'])).shown.find((s) => s.title === 'Play from Steam')!;
    };
    const windows = await lines('windows');
    expect(windows.labels).toEqual(['Back', 'Launch line: Off', 'Copy launch line']);
    expect(choosable(windows)).toEqual(['Back', 'Launch line: Off']);
    expect((await lines('linux')).labels).toEqual(['Back', 'Launch line: Off', 'Copy launch line', 'Compat. tool: Off']);
  });

  it('names each option in full, in a note that fits at the foot', async () => {
    const notes = async (system: SteamStatus['system'], more: Partial<SteamStatus> = {}, script = ['Paths']) => {
      const { g, p } = newGame();
      g.hooks.steam = fake({ system, ...more }).hook;
      // The bar taken down every line to the last, each line's note drawn as it is reached.
      return (await drive(g, p, script)).said;
    };
    const linux = await notes('linux', {}, ['Play from Steam', 'Compat. tool', 'Back', 'Paths']);
    expect(linux).toContain(sq("Steam's Play starts this engine: a launch line or a compat. tool."));
    expect(linux).toContain(sq('Steam starts this engine by a line you paste into Launch Options.'));
    expect(linux).toContain(sq('Turn the launch line on first.'));
    expect(linux).toContain(sq('A compatibility tool, Ultima V SP, chosen in Steam.'));
    expect(linux).toContain(sq('Start Ultima V from Steam to change this.'));
    expect(linux).toContain(sq('Where the app found Steam, Ultima V and its Steam saves.'));
    expect(await notes('linux', { launch: true })).toContain(sq('Steam Cloud saves: saves made in Steam launches stay with Steam.'));
    expect(await notes('windows')).toContain(sq("Steam's Play starts this engine, by a line you paste. Choose to set it up."));
    expect(await notes('mac')).toContain(sq("Play from Steam (changes Steam's settings): Play starts this engine."));
    expect(await notes('windows', { line: null }, ['Play from Steam', 'Launch line'])).toContain(
      sq("The portable Ultima V can't be started by Steam. Use the installed one."),
    );
    expect(await notes('linux', { steam: null })).toContain(sq("Steam isn't here. Install Steam and start it once, then come back."));
  });

  it('turns the launch line on through the hook, shows it with Copy, and draws the menu again with it on', async () => {
    const { g, p } = newGame();
    const f = fake({ system: 'windows', line: '"C:\\Ultima V\\Ultima V.exe" %command%' });
    g.hooks.steam = f.hook;
    const { said, menus, shown } = await drive(g, p, ['Play from Steam', 'Launch line: Off', 'Copy launch line']);
    expect(f.calls).toContain('playLine on');
    expect(f.calls).toContain('copyLine');
    expect(shown.some((s) => s.labels.join(' ').includes('Ultima V.exe" %command%'))).toBe(true);
    expect(said).toContain(sq('Now playLine is on.'));
    expect(choosable(menus.at(-1)!)).toContain('Play from Steam: On');
    // With the line on, what Steam has saved of it is read back.
    expect(f.calls).toContain('lineState');
    expect(said).toContain(sq('Steam has no launch line yet: copy it, and paste it into Launch Options.'));
  });

  it('turns the compatibility tool on and off again', async () => {
    const { g, p } = newGame();
    const f = fake({ system: 'linux' });
    g.hooks.steam = f.hook;
    const { shown } = await drive(g, p, ['Play from Steam', 'Compat. tool: Off', 'Compat. tool: On']);
    expect(f.calls).toEqual(['compatTool on', 'compatTool off']);
    expect(choosable(shown.filter((m) => m.title === 'Play from Steam').at(-1)!)).toContain('Compat. tool: Off');
  });

  it("warns a Mac before changing Steam's settings, and does nothing on No", async () => {
    const no = newGame();
    const f = fake({ system: 'mac', line: null });
    no.g.hooks.steam = f.hook;
    const asked = await drive(no.g, no.p, ['Play from Steam: Off', 'No']);
    expect(asked.said).toContain(sq("This closes Steam and changes Steam's own settings for Ultima V"));
    expect(asked.said).toContain(sq('Turning this off puts'));
    expect(f.calls).toEqual([]);
    const yes = newGame();
    yes.g.hooks.steam = f.hook;
    await drive(yes.g, yes.p, ['Play from Steam: Off', 'Yes']);
    expect(f.calls).toEqual(['macPlay on']);
  });

  it('asks a Mac with Steam running to quit it before turning Play off', async () => {
    const { g, p } = newGame();
    const f = fake({ system: 'mac', line: null, steamRunning: true }, { macPlay: true });
    g.hooks.steam = f.hook;
    const { said } = await drive(g, p, ['Play from Steam: On', 'No']);
    expect(said).toContain(sq('Steam must be closed for this. Quit Steam now?'));
    expect(f.calls).toEqual([]);
  });

  it("greys a Mac's Play off in a Steam launch: quitting Steam would end this game", async () => {
    const { g, p } = newGame();
    const f = fake({ system: 'mac', line: null, launch: true }, { macPlay: true });
    g.hooks.steam = f.hook;
    const { menus, said } = await drive(g, p, ['Play from Steam: On']);
    const m = menus[0];
    expect(m.enabled[m.labels.indexOf('Play from Steam: On')]).toBe(false);
    expect(said).toContain(sq('Quit the game, then turn this off from outside Steam.'));
    expect(f.calls).toEqual([]);
  });

  it('asks before turning a Play option off while Cloud saves is on for an account here, and does nothing on No', async () => {
    const CLOUD_STAYS = sq(
      'Saves made from Steam stay with Steam until Cloud saves is turned off from a game Steam started. Turn this off anyway?',
    );
    for (const [system, name, label] of [
      ['windows', 'playLine', ['Play from Steam', 'Launch line: On']],
      ['linux', 'playLine', ['Play from Steam', 'Launch line: On']],
      ['linux', 'compatTool', ['Play from Steam', 'Compat. tool: On']],
      ['mac', 'macPlay', ['Play from Steam: On']],
    ] as const) {
      const no = newGame();
      const f = fake({ system, line: system === 'mac' ? null : 'x %command%' }, { [name]: true, cloudAny: true });
      no.g.hooks.steam = f.hook;
      expect((await drive(no.g, no.p, [...label, 'No'])).said).toContain(CLOUD_STAYS);
      expect(f.calls.filter((c) => c !== 'lineState')).toEqual([]);
      const yes = newGame();
      yes.g.hooks.steam = f.hook;
      await drive(yes.g, yes.p, [...label, 'Yes']);
      expect(f.calls.filter((c) => c !== 'lineState')).toEqual([`${name} off`]);
    }
    // With Cloud saves off for every account, it is turned off without asking.
    const { g, p } = newGame();
    const f = fake({ system: 'linux' }, { compatTool: true });
    g.hooks.steam = f.hook;
    expect((await drive(g, p, ['Play from Steam', 'Compat. tool: On'])).said).not.toContain(CLOUD_STAYS);
    expect(f.calls).toEqual(['compatTool off']);
  });

  it('says in a Steam launch that Play from Steam works, the line not read back', async () => {
    const { g, p } = newGame();
    const f = fake({ system: 'windows', launch: true, line: 'x %command%' }, { playLine: true });
    g.hooks.steam = f.hook;
    const { said } = await drive(g, p, ['Paths']);
    expect(said).toContain(sq('Steam started this game: Play from Steam works.'));
    expect(f.calls).not.toContain('lineState');
  });

  it('copies the report, and opens the issues page', async () => {
    const { g, p } = newGame();
    const f = fake();
    g.hooks.steam = f.hook;
    const { said } = await drive(g, p, ['Copy report', 'Report an issue']);
    expect(f.calls).toEqual(['copyReport', `open ${ISSUES}`]);
    expect(ISSUES).toBe('https://github.com/synthwave-pixel/ultima5/issues');
    expect(said).toContain(sq('Copied.'));
  });

  it("says on the Flatpak that the AppImage works better, and opens the AppImage's page", async () => {
    const { g, p } = newGame();
    const f = fake({ flatpak: true });
    g.hooks.steam = f.hook;
    const { said } = await drive(g, p, ['Play from Steam', 'Get the AppImage']);
    expect(said).toContain(sq('The AppImage works better with Steam: its download page.'));
    expect(f.calls).toEqual([`open ${APPIMAGE_PAGE}`]);
    const plain = newGame();
    plain.g.hooks.steam = fake().hook;
    expect((await drive(plain.g, plain.p, ['Play from Steam'])).said).not.toContain(sq('AppImage works better'));
  });
});

describe('Steam Cloud saves in the menu', () => {
  afterEach(() => useStore());

  it('is grey outside a Steam launch, On where it is on for an account here, and switched in a Steam launch', async () => {
    const outside = newGame();
    outside.g.hooks.steam = fake({}, { cloudAny: true }).hook;
    const m = (await drive(outside.g, outside.p)).menus[0];
    expect(m.enabled[m.labels.indexOf('Cloud Saves: On')]).toBe(false);
    const { g, p } = newGame();
    g.hooks.steam = fake({ launch: true }).hook;
    expect(choosable((await drive(g, p)).menus[0])).toContain('Cloud Saves: Off');
  });

  it('is grey in a Steam launch that has no game folder or no account', async () => {
    for (const [more, why] of [
      [{ game: 'missing' }, "Ultima V's folder in Steam isn't there"],
      [{ account: false }, "Steam didn't say which account is playing"],
    ] as const) {
      const { g, p } = newGame();
      g.hooks.steam = fake({ launch: true, ...more }).hook;
      const { menus, said } = await drive(g, p, ['Cloud Saves: Off']);
      expect(choosable(menus[0])).not.toContain('Cloud Saves: Off');
      expect(said).toContain(sq(why));
    }
  });

  it('is grey on a Mac until Play from Steam is on there', async () => {
    const { g, p } = newGame();
    g.hooks.steam = fake({ system: 'mac', line: null, launch: true }).hook;
    const { menus, said } = await drive(g, p, ['Cloud Saves: Off']);
    const m = menus[0];
    expect(m.enabled[m.labels.indexOf('Cloud Saves: Off')]).toBe(false);
    expect(said).toContain(sq('Turn Play from Steam on first'));
    const on = newGame();
    on.g.hooks.steam = fake({ system: 'mac', line: null, launch: true }, { macPlay: true }).hook;
    expect(choosable((await drive(on.g, on.p)).menus[0])).toContain('Cloud Saves: Off');
  });

  it('may always be turned off on a Mac in a Steam launch, Play on or not', async () => {
    const { g, p } = newGame();
    const f = fake({ system: 'mac', line: null, launch: true }, { cloud: true });
    g.hooks.steam = f.hook;
    fill(f.steam, character('a', [save(g, 'Iolo', 3, 2000)]));
    const { menus } = await drive(g, p, ['Cloud Saves: On']);
    expect(choosable(menus[0])).toContain('Cloud Saves: On');
    expect(f.recorded).toEqual([[false, undefined]]);
    expect(f.own.get(saveKeys('a')!.last)).toBe(f.steam.get(saveKeys('a')!.last));
  });

  it("says it can't be used, not Off, in a Steam launch that knows no account while it is on for one here", async () => {
    const { g, p } = newGame();
    g.hooks.steam = fake({ launch: true, account: false }, { cloudAny: true }).hook;
    const { menus, said } = await drive(g, p, ['Cloud Saves: Unknown']);
    const m = menus[0];
    expect(m.labels).not.toContain('Cloud Saves: Off');
    expect(m.enabled[m.labels.indexOf('Cloud Saves: Unknown')]).toBe(false);
    expect(said).toContain(sq("Steam didn't say which account is playing, so its Cloud saves can't be used"));
  });

  it("switches nothing where the app couldn't keep the switch, and says why", async () => {
    const { g, p } = newGame();
    const f = fake({ launch: true });
    g.hooks.steam = f.hook;
    fill(f.own, character('a', [save(g, 'Iolo', 3, 2000)]));
    f.state.unkept = "The app's settings couldn't be saved, so this can't change now.";
    const { said, menus } = await drive(g, p, ['Cloud Saves: Off']);
    expect(said).toContain(sq("The app's settings couldn't be saved, so this can't change now."));
    expect(said).toContain(sq('Steam Cloud saves stays off.'));
    expect(f.state.used).toBeNull();
    expect(choosable(menus.at(-1)!)).toContain('Cloud Saves: Off');
  });

  it("copies this computer's saves into Steam's folder, then keeps the game's saves there", async () => {
    const { g, p } = newGame();
    const f = fake({ launch: true });
    g.hooks.steam = f.hook;
    fill(f.own, character('a', [save(g, 'Iolo', 3, 2000)]));
    const before = new Map(f.own);
    const { menus } = await drive(g, p, ['Cloud Saves: Off']);
    expect(f.steam.get(saveKeys('a')!.last)).toBe(f.own.get(saveKeys('a')!.last));
    expect(f.own).toEqual(before); // the side copied from, untouched
    expect(f.recorded).toEqual([[true, undefined]]);
    expect(f.state.used).toBe(true);
    expect(choosable(menus.at(-1)!)).toContain('Cloud Saves: On');
  });

  it("copies Steam's saves back when turned off, and the game's saves stay here from then on", async () => {
    const { g, p } = newGame();
    const f = fake({ launch: true }, { cloud: true });
    g.hooks.steam = f.hook;
    fill(f.steam, character('a', [save(g, 'Iolo', 3, 2000)]));
    const before = new Map(f.steam);
    await drive(g, p, ['Cloud Saves: On']);
    expect(f.own.get(saveKeys('a')!.last)).toBe(f.steam.get(saveKeys('a')!.last));
    expect(f.steam).toEqual(before);
    expect(f.recorded).toEqual([[false, undefined]]);
    expect(f.state.used).toBe(false);
  });

  /** Iolo played on both sides apart: level 3 here, level 5 with Steam, from the same first save. */
  const clashing = (g: Game, f: ReturnType<typeof fake>): void => {
    const first = save(g, 'Iolo', 1, 1000);
    fill(f.own, character('a', [save(g, 'Iolo', 3, 2000), first]));
    fill(f.steam, character('a', [save(g, 'Iolo', 5, 3000), first]));
  };

  it('shows a clash with both versions, and Cancel copies nothing and leaves the option off', async () => {
    const { g, p } = newGame();
    const f = fake({ launch: true });
    g.hooks.steam = f.hook;
    clashing(g, f);
    const own = new Map(f.own);
    const steam = new Map(f.steam);
    const { shown, menus } = await drive(g, p, ['Cloud Saves: Off', 'Cancel']);
    const dialog = shown.find((s) => s.title === 'Keep which?')!;
    expect(dialog.labels).toContain('Iolo, level 3');
    expect(dialog.labels).toContain('Iolo, level 5');
    expect(dialog.labels.join(' ')).toContain('On this computer');
    expect(dialog.labels.join(' ')).toContain('In Steam');
    expect(f.own).toEqual(own);
    expect(f.steam).toEqual(steam);
    expect(f.recorded).toEqual([]);
    expect(f.state.used).toBeNull();
    expect(choosable(menus.at(-1)!)).toContain('Cloud Saves: Off');
  });

  it('keeps the version chosen as the latest save on the receiving side', async () => {
    const { g, p } = newGame();
    const f = fake({ launch: true });
    g.hooks.steam = f.hook;
    clashing(g, f);
    const mine = f.own.get(saveKeys('a')!.last);
    await drive(g, p, ['Cloud Saves: Off', 'Iolo, level 3']);
    expect(f.steam.get(saveKeys('a')!.last)).toBe(mine);
    expect(f.recorded).toEqual([[true, undefined]]);
  });

  it('copies nothing where a side changed while the player chose', async () => {
    const { g, p } = newGame();
    const f = fake({ launch: true });
    g.hooks.steam = f.hook;
    clashing(g, f);
    const { said } = await drive(g, p, ['Cloud Saves: Off', () => f.steam.set(`${saveKeys('a')!.last}.9`, '{}'), 'Iolo, level 3']);
    expect(said).toContain(sq('The saves changed while you chose, so nothing was copied.'));
    expect(f.steam.get(saveKeys('a')!.last)).not.toBe(f.own.get(saveKeys('a')!.last));
    expect(f.recorded).toEqual([]);
  });

  it('leaves the option off where a write fails, keeping why, and says so', async () => {
    const { g, p } = newGame();
    const f = fake({ launch: true });
    g.hooks.steam = f.hook;
    fill(f.own, character('a', [save(g, 'Iolo', 3, 2000)]));
    f.state.refuse = 'ENOSPC';
    const { said, menus } = await drive(g, p, ['Cloud Saves: Off']);
    expect(f.recorded).toEqual([[true, 'ENOSPC']]);
    expect(f.state.used).toBeNull();
    expect(said).toContain(sq('could not be copied (ENOSPC)'));
    expect(said).toContain(sq('Steam Cloud saves stays off.'));
    expect(choosable(menus.at(-1)!)).toContain('Cloud Saves: Off');
  });

  /** Every save the game reads from `side` through its indexes (storage.ts), each character's in turn. */
  const readable = (side: Map<string, string>): SaveData[] => {
    useStore(mapStorage(new Map(side)));
    try {
      return characterIds().flatMap((id) => {
        chooseCharacter(id);
        return localSave.all().map((k) => k.data);
      });
    } finally {
      chooseCharacter(null);
      useStore();
    }
  };
  const holds = (saves: SaveData[], d: SaveData): boolean => saves.some((s) => s.written === d.written && s.save === d.save);

  it("keeps every save of the receiving side's readable through its index, wherever a clash's copy stops", async () => {
    for (const keep of ['Iolo, level 3', 'Iolo, level 5'])
      for (let failAt = 1; failAt <= 5; failAt++) {
        const { g, p } = newGame();
        const f = fake({ launch: true });
        g.hooks.steam = f.hook;
        clashing(g, f);
        const before = readable(f.steam);
        f.state.failAt = failAt;
        await drive(g, p, ['Cloud Saves: Off', keep]);
        const after = readable(f.steam);
        for (const d of before) expect(holds(after, d), `${keep}, write ${failAt} failing`).toBe(true);
      }
  });

  it("keeps the receiving side's last save readable through its index, wherever a copy over it stops", async () => {
    for (let failAt = 1; failAt <= 5; failAt++) {
      const { g, p } = newGame();
      const f = fake({ launch: true });
      g.hooks.steam = f.hook;
      // Played on here from Steam's last save, which this computer keeps as an earlier one in a slot Steam has not.
      const s1 = save(g, 'Iolo', 1, 1000);
      fill(f.own, character('a', [save(g, 'Iolo', 3, 3000), s1], 4));
      fill(f.steam, character('a', [s1]));
      f.state.failAt = failAt;
      await drive(g, p, ['Cloud Saves: Off']);
      expect(holds(readable(f.steam), s1), `write ${failAt} failing`).toBe(true);
    }
  });

  it('lets go of no save where a write failed', async () => {
    const { g, p } = newGame();
    const f = fake({ launch: true });
    g.hooks.steam = f.hook;
    // Steam's last save is among this computer's (played on here since): this computer's copied over, and the
    // earlier save only Steam's index named would be let go - but a write fails first.
    const s1 = save(g, 'Iolo', 1, 1000);
    const s2 = save(g, 'Iolo', 2, 2000);
    fill(f.own, character('a', [save(g, 'Iolo', 3, 3000), s2], 0));
    fill(f.steam, character('a', [s2, s1], 5));
    const earlier = `${saveKeys('a')!.last}.5`;
    f.state.failAt = 1;
    await drive(g, p, ['Cloud Saves: Off']);
    expect(f.recorded).toEqual([[true, 'ENOSPC']]);
    expect(f.steam.get(earlier)).toBe(JSON.stringify(s1));
  });

  it("copies nothing where Steam's folder can't be read", async () => {
    const { g, p } = newGame();
    const f = fake({ launch: true });
    g.hooks.steam = f.hook;
    fill(f.own, character('a', [save(g, 'Iolo', 3, 2000)]));
    f.state.steamReadable = false;
    const { said } = await drive(g, p, ['Cloud Saves: Off']);
    expect(said).toContain(sq("Steam's saves can't be reached"));
    expect(f.recorded).toEqual([[true, 'unreadable']]);
  });
});

describe('the two sides of Cloud saves, through the app', () => {
  afterEach(() => useStore());

  it("writes this computer's side to local storage, Steam's through the app, and keeps the game's saves where told", async () => {
    const local = new Map<string, string>([['ultima5.characters', 'here']]);
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => local.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (k === 'full') throw new DOMException('full', 'QuotaExceededError');
        local.set(k, v);
      },
      removeItem: (k: string) => void local.delete(k),
      key: (i: number) => [...local.keys()][i] ?? null,
      get length() {
        return local.size;
      },
      clear: () => local.clear(),
    };
    const folder = new Map<string, string>([['ultima5.characters', 'steam']]);
    const asked: [boolean, string | undefined][] = [];
    const sides = cloudSaves({
      saves: {
        all: () => Object.fromEntries(folder),
        set: (k, v) => (k === 'bad' ? 'EACCES' : (folder.set(k, v), true)),
        remove: (k) => folder.delete(k),
      },
      setOption: async (_name, on, failed) => (asked.push([on, failed]), { on, message: '' }),
      options: () => ({ account: '42' }),
    });
    expect(sides.own()).toEqual({ 'ultima5.characters': 'here' });
    expect(sides.steam()).toEqual({ 'ultima5.characters': 'steam' });
    expect(sides.write('own', 'x', '1')).toBe(true);
    expect(sides.write('own', 'full', '1')).toBe('QuotaExceededError');
    expect(sides.write('steam', 'y', '2')).toBe(true);
    expect(sides.write('steam', 'bad', '2')).toBe('EACCES');
    expect(folder.get('y')).toBe('2');
    await sides.record(true);
    expect(asked).toEqual([[true, undefined]]);
    sides.use(true);
    expect(kept().getItem('ultima5.characters')).toBe('steam');
    sides.use(false);
    expect(kept().getItem('ultima5.characters')).toBe('here');
  });
});

describe('the Steam (beta) menu in the game font', () => {
  it('shows only letters the game can draw (0x20-0x7e), on every system and in every state', async () => {
    for (const system of ['linux', 'windows', 'mac'] as const)
      for (const status of [{}, { steam: null, game: 'none' as const }, { launch: true }, { flatpak: true }])
        for (const on of [false, true]) {
          const { g, p } = newGame();
          const f = fake({ system, ...status }, { playLine: on, compatTool: on, macPlay: on, cloud: on });
          g.hooks.steam = f.hook;
          const { shown } = await drive(g, p);
          expect(
            shown
              .flatMap((s) => [s.title, ...s.labels])
              .join('')
              .match(/[^\x20-\x7e]/g) ?? [],
          ).toEqual([]);
        }
  });

  it('keeps its own words, and the desktop app’s, to the same letters', () => {
    const outside = (path: string): string[] => {
      const text = readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
      return text.split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l) && /[^\t -~]/.test(l));
    };
    for (const path of [
      '../src/game/steamMenu.ts',
      '../src/game/cloudSwitch.ts',
      '../../desktop/main.cjs',
      '../../desktop/steamOptions.cjs',
    ])
      expect(outside(path)).toEqual([]);
  });
});
