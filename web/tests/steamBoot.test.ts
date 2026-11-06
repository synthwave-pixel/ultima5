// web/tests/steamBoot.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FoundCopy } from '../src/install/scan.ts';
import type { SteamFind, SteamLaunch } from '../src/install/sources.ts';
import { gameFiles as checkedIn } from './helpers.ts';

const runInstaller = vi.fn<(notice?: string) => Promise<string>>();
const saveInstalled = vi.fn<(files: unknown) => Promise<void>>();
let installed: { files: unknown; damaged: string[] } | null = null;
vi.mock('../src/install/installer.ts', () => ({ runInstaller: (n?: string) => runInstaller(n) }));
vi.mock('../src/install/store.ts', () => ({
  saveInstalled: (f: unknown) => saveInstalled(f),
  loadInstalled: () => Promise.resolve(installed),
}));

/** A stand-in for localStorage. */
function memory(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

const wholeCopy = (): FoundCopy => {
  const files = checkedIn();
  return { where: '/steam/Ultima V', files: files.names().map((n) => ({ path: n, data: files.get(n) })) };
};

/** The desktop app's bridge as a Steam launch gives it (or, without `launch`, no Steam part at all). */
function bridge(launch: SteamLaunch | null, saves: Record<string, string> | null = {}, find?: SteamFind) {
  const written = new Map<string, string>();
  const found: SteamFind =
    find ?? (launch && launch.steam ? { steam: true, game: launch.game, where: launch.where } : { steam: false, game: 'none', where: '' });
  (globalThis as { u5native?: unknown }).u5native = {
    scanForGameFiles: () => Promise.resolve([]),
    ...(launch && {
      steam: {
        launch: () => launch,
        find: () => found,
        gameFiles: vi.fn(() => Promise.resolve(wholeCopy())),
        saves: {
          all: () => saves,
          set: (k: string, v: string) => (written.set(k, v), true),
          remove: (k: string) => written.delete(k),
        },
      },
    }),
  };
  return written;
}

const FOUND_NOTE = 'Found Ultima V in your Steam library.';
const steamOf = () => (globalThis as unknown as { u5native: { steam: { gameFiles: ReturnType<typeof vi.fn> } } }).u5native.steam;

describe('finding the game in Steam on any start', () => {
  let was: PropertyDescriptor | undefined;
  beforeEach(() => {
    was = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { value: memory(), configurable: true });
    runInstaller.mockReset();
    saveInstalled.mockReset().mockResolvedValue(undefined);
    installed = null;
    vi.resetModules();
  });
  afterEach(() => {
    delete (globalThis as { u5native?: unknown }).u5native;
    if (was) Object.defineProperty(globalThis, 'localStorage', was);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  });
  const notSteam: SteamLaunch = { steam: false };
  const there: SteamFind = { steam: true, game: 'ok', where: '/steam/Ultima V' };

  it("with no copy of its own, keeps Steam's once and says so once", async () => {
    bridge(notSteam, {}, there);
    const { gameFiles, steamNote } = await import('../src/boot.ts');
    const files = await gameFiles();
    expect(files.names()).toContain('DATA.OVL');
    expect(saveInstalled).toHaveBeenCalledTimes(1);
    expect(runInstaller).not.toHaveBeenCalled();
    const note = steamNote();
    expect(note?.text).toBe(FOUND_NOTE);
    note?.seen();
    expect(steamNote()).toBeNull();
    expect(localStorage.getItem('ultima5.steamFoundNoted')).not.toBeNull();
  });

  it('does not say it again once it has been seen', async () => {
    localStorage.setItem('ultima5.steamFoundNoted', '1');
    bridge(notSteam, {}, there);
    const { gameFiles, steamNote } = await import('../src/boot.ts');
    await gameFiles();
    expect(saveInstalled).toHaveBeenCalledTimes(1);
    expect(steamNote()).toBeNull();
  });

  it('does not ask Steam for files when it has a copy', async () => {
    installed = { files: checkedIn(), damaged: [] };
    bridge(notSteam, {}, there);
    const { gameFiles, steamNote } = await import('../src/boot.ts');
    await gameFiles();
    expect(steamOf().gameFiles).not.toHaveBeenCalled();
    expect(saveInstalled).not.toHaveBeenCalled();
    expect(runInstaller).not.toHaveBeenCalled();
    expect(steamNote()).toBeNull();
  });

  it('goes to the installer when Steam’s copy lacks files', async () => {
    bridge(notSteam, {}, there);
    steamOf().gameFiles.mockResolvedValue({ where: '/steam/Ultima V', files: [{ path: 'DATA.OVL', data: new Uint8Array(4) }] });
    runInstaller.mockResolvedValue('files');
    const { gameFiles } = await import('../src/boot.ts');
    await gameFiles();
    expect(saveInstalled).not.toHaveBeenCalled();
    expect(runInstaller).toHaveBeenCalledTimes(1);
  });

  it('goes to the installer, plainly, when nothing is found', async () => {
    bridge(notSteam, {}, { steam: true, game: 'none', where: '' });
    runInstaller.mockResolvedValue('files');
    const { gameFiles } = await import('../src/boot.ts');
    await gameFiles();
    expect(runInstaller).toHaveBeenCalledWith(undefined);
  });

  it('keeps the Steam launch’s own notice when nothing is found', async () => {
    bridge({ steam: true, game: 'none', where: '', account: true });
    runInstaller.mockResolvedValue('files');
    const { gameFiles } = await import('../src/boot.ts');
    await gameFiles();
    expect(runInstaller).toHaveBeenCalledWith('Steam launched the game, but no Steam library holds Ultima V.');
  });

  it('says the found note first and lets the first-launch Steam note wait', async () => {
    bridge({ steam: true, game: 'ok', where: 'x', account: true }, {});
    const { chooseStore, gameFiles, steamNote } = await import('../src/boot.ts');
    chooseStore();
    await gameFiles();
    const note = steamNote();
    expect(note?.text).toBe(FOUND_NOTE);
    note?.seen();
    expect(steamNote()).toBeNull();
    vi.resetModules();
    installed = { files: checkedIn(), damaged: [] };
    const again = await import('../src/boot.ts');
    again.chooseStore();
    await again.gameFiles();
    expect(again.steamNote()?.text).toMatch(/^Playing through Steam/);
  });

  it('asks the app to find Steam once a page', async () => {
    const find = vi.fn(() => there);
    bridge(notSteam, {}, there);
    (globalThis as unknown as { u5native: { steam: { find: unknown } } }).u5native.steam.find = find;
    const { gameFiles } = await import('../src/boot.ts');
    await gameFiles();
    const { steamFind } = await import('../src/install/sources.ts');
    steamFind();
    steamFind();
    expect(find).toHaveBeenCalledTimes(1);
  });
});

describe('a launch from Steam', () => {
  let was: PropertyDescriptor | undefined;
  beforeEach(() => {
    was = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { value: memory(), configurable: true });
    runInstaller.mockReset();
    saveInstalled.mockReset().mockResolvedValue(undefined);
    installed = null;
    vi.resetModules();
  });
  afterEach(() => {
    delete (globalThis as { u5native?: unknown }).u5native;
    if (was) Object.defineProperty(globalThis, 'localStorage', was);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("takes Steam's copy once, as the installer would", async () => {
    bridge({ steam: true, game: 'ok', where: '/steam/Ultima V', account: true });
    const { gameFiles } = await import('../src/boot.ts');
    const files = await gameFiles();
    expect(files.names()).toContain('DATA.OVL');
    expect(runInstaller).not.toHaveBeenCalled();
    expect(saveInstalled).toHaveBeenCalledTimes(1);
  });

  it('names the library when its folder is not there', async () => {
    bridge({ steam: true, game: 'missing', where: '/Volumes/Games/SteamLibrary', account: true });
    runInstaller.mockResolvedValue('files');
    const { gameFiles } = await import('../src/boot.ts');
    await gameFiles();
    expect(runInstaller).toHaveBeenCalledWith(
      'Steam lists Ultima V in /Volumes/Games/SteamLibrary, but its folder is not there. Install it in Steam, then press Play again.',
    );
  });

  it('says no library holds it', async () => {
    bridge({ steam: true, game: 'none', where: '', account: true });
    runInstaller.mockResolvedValue('files');
    const { gameFiles } = await import('../src/boot.ts');
    await gameFiles();
    expect(runInstaller).toHaveBeenCalledWith('Steam launched the game, but no Steam library holds Ultima V.');
  });

  it('keeps today’s path without the Steam bridge', async () => {
    bridge(null);
    runInstaller.mockResolvedValue('files');
    const { gameFiles } = await import('../src/boot.ts');
    await gameFiles();
    expect(runInstaller).toHaveBeenCalledWith(undefined);
  });

  it('keeps the saves with Steam, seeded from its files', async () => {
    const written = bridge({ steam: true, game: 'ok', where: 'x', account: true }, { 'ultima5.saves': 'old' });
    const { chooseStore } = await import('../src/boot.ts');
    const { kept } = await import('../src/game/keyStore.ts');
    chooseStore();
    expect(kept().getItem('ultima5.saves')).toBe('old');
    kept().setItem('ultima5.save', 'new');
    expect(written.get('ultima5.save')).toBe('new');
    expect(localStorage.getItem('ultima5.save')).toBeNull();
  });

  it('refuses every save where no account is known, never falling back to the browser’s', async () => {
    bridge({ steam: true, game: 'ok', where: 'x', account: false }, null);
    const { chooseStore } = await import('../src/boot.ts');
    const { kept } = await import('../src/game/keyStore.ts');
    chooseStore();
    expect(() => kept().setItem('ultima5.save', 'new')).toThrow();
    expect(localStorage.getItem('ultima5.save')).toBeNull();
  });

  it('refuses saves where the game has no folder', async () => {
    bridge({ steam: true, game: 'missing', where: 'x', account: false }, null);
    const { chooseStore } = await import('../src/boot.ts');
    const { kept } = await import('../src/game/keyStore.ts');
    chooseStore();
    expect(() => kept().setItem('ultima5.save', 'new')).toThrow();
  });

  it('leaves the browser’s storage to any other launch', async () => {
    bridge({ steam: false });
    const { chooseStore } = await import('../src/boot.ts');
    const { kept } = await import('../src/game/keyStore.ts');
    chooseStore();
    kept().setItem('ultima5.save', 'new');
    expect(localStorage.getItem('ultima5.save')).toBe('new');
  });

  it('says how saves are kept once, when there are none yet', async () => {
    bridge({ steam: true, game: 'ok', where: 'x', account: true }, {});
    const { chooseStore, steamNote } = await import('../src/boot.ts');
    chooseStore();
    const note = steamNote();
    expect(note?.text).toMatch(/^Playing through Steam: your saves here are kept with Steam, apart from any made outside it\./);
    note?.seen();
    expect(steamNote()).toBeNull();
    // On a later launch too: the flag is the machine's.
    vi.resetModules();
    const again = await import('../src/boot.ts');
    again.chooseStore();
    expect(again.steamNote()).toBeNull();
    expect(localStorage.getItem('ultima5.steamNoted')).not.toBeNull();
  });

  it('says nothing of it to a player who already has saves, or outside Steam', async () => {
    bridge({ steam: true, game: 'ok', where: 'x', account: true }, { 'ultima5.saves': 'old' });
    const first = await import('../src/boot.ts');
    first.chooseStore();
    expect(first.steamNote()).toBeNull();
    bridge(null);
    vi.resetModules();
    expect((await import('../src/boot.ts')).steamNote()).toBeNull();
  });

  it('asks the app how it was launched once a page, however often the title looks for its note', async () => {
    bridge({ steam: true, game: 'ok', where: 'x', account: true }, { 'ultima5.saves': 'old' });
    const steam = (globalThis as unknown as { u5native: { steam: { launch: () => SteamLaunch } } }).u5native.steam;
    const launch = vi.fn(steam.launch);
    steam.launch = launch;
    const { chooseStore, steamNote } = await import('../src/boot.ts');
    chooseStore();
    const { kept } = await import('../src/game/keyStore.ts');
    const walk = vi.spyOn(kept(), 'key');
    for (let i = 0; i < 100; i++) expect(steamNote()).toBeNull();
    expect(launch).toHaveBeenCalledTimes(1);
    expect(walk.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('keeps saying the first-launch note until it is seen, then says it no more', async () => {
    bridge({ steam: true, game: 'ok', where: 'x', account: true }, {});
    const { chooseStore, steamNote } = await import('../src/boot.ts');
    chooseStore();
    expect(steamNote()?.text).toMatch(/^Playing through Steam/);
    const note = steamNote();
    expect(note?.text).toMatch(/^Playing through Steam/);
    note?.seen();
    expect(steamNote()).toBeNull();
  });

  it('says when no account is known', async () => {
    bridge({ steam: true, game: 'ok', where: 'x', account: false }, null);
    const { steamNote } = await import('../src/boot.ts');
    expect(steamNote()?.text).toBe('Steam launched the game, but which Steam account did is unknown, so nothing can be saved.');
  });
});
