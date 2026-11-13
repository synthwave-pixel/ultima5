// web/tests/steamBoot.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FoundCopy } from '../src/install/scan.ts';
import type { SteamFind, SteamLaunch, SyncState } from '../src/install/sources.ts';
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
function bridge(
  launch: SteamLaunch | null,
  saves: Record<string, string> | null = {},
  find?: SteamFind,
  options: { cloud?: Record<string, boolean>; account?: string | null } = {},
  sync?: SyncState,
) {
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
        options: () => ({
          playLine: false,
          compatTool: false,
          macPlay: false,
          results: {},
          lineOnAt: 0,
          cloud: {},
          account: null,
          ...options,
        }),
        saves: {
          all: () => saves,
          set: (k: string, v: string) => (written.set(k, v), true),
          remove: (k: string) => written.delete(k),
        },
        ...(sync && { sync: () => sync, fixCloud: vi.fn(() => Promise.resolve('Fixed.')) }),
      },
    }),
  };
  return written;
}

/** Cloud saves on for the account `me`, the launch's own. */
const ON = { cloud: { me: true }, account: 'me' };
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
    expect(localStorage.getItem('ultima5.filesFrom')).toBe('steam');
    const { reportArgs } = await import('../src/install/sources.ts');
    expect(reportArgs().filesFrom).toBe('steam');
    expect(reportArgs().required).toContain('DATA.OVL');
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
    bridge({ steam: true, game: 'ok', where: 'x', account: true }, {}, undefined, ON);
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
    expect(again.steamNote()?.text).toMatch(/^Saves made while playing from Steam/);
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

  it('keeps the saves with Steam, seeded from its files, where Cloud saves is on', async () => {
    const written = bridge({ steam: true, game: 'ok', where: 'x', account: true }, { 'ultima5.saves': 'old' }, undefined, ON);
    const { chooseStore } = await import('../src/boot.ts');
    const { kept } = await import('../src/game/keyStore.ts');
    chooseStore();
    expect(kept().getItem('ultima5.saves')).toBe('old');
    kept().setItem('ultima5.save', 'new');
    expect(written.get('ultima5.save')).toBe('new');
    expect(localStorage.getItem('ultima5.save')).toBeNull();
  });

  it('keeps the saves in the app, writing nothing to the folder, where Cloud saves is off', async () => {
    const written = bridge({ steam: true, game: 'ok', where: 'x', account: true }, { 'ultima5.saves': 'old' }, undefined, {
      account: 'me',
    });
    const { chooseStore, steamNote } = await import('../src/boot.ts');
    const { kept } = await import('../src/game/keyStore.ts');
    chooseStore();
    expect(kept().getItem('ultima5.saves')).toBeNull();
    kept().setItem('ultima5.save', 'new');
    expect(written.size).toBe(0);
    expect(localStorage.getItem('ultima5.save')).toBe('new');
    expect(steamNote()).toBeNull();
  });

  it('keeps Cloud saves to the account it was turned on for', async () => {
    const written = bridge({ steam: true, game: 'ok', where: 'x', account: true }, {}, undefined, {
      cloud: { other: true },
      account: 'me',
    });
    const { chooseStore, steamNote } = await import('../src/boot.ts');
    const { kept } = await import('../src/game/keyStore.ts');
    chooseStore();
    kept().setItem('ultima5.save', 'new');
    expect(written.size).toBe(0);
    expect(steamNote()).toBeNull();
  });

  it('uses the app’s saves and says so each launch where Cloud saves is on but no account is known', async () => {
    const written = bridge({ steam: true, game: 'ok', where: 'x', account: false }, null, undefined, {
      cloud: { me: true },
      account: null,
    });
    const { chooseStore, steamNote } = await import('../src/boot.ts');
    const { kept } = await import('../src/game/keyStore.ts');
    chooseStore();
    kept().setItem('ultima5.save', 'new');
    expect(written.size).toBe(0);
    expect(localStorage.getItem('ultima5.save')).toBe('new');
    const note = steamNote();
    expect(note?.text).toBe("Steam's saves can't be reached; using this computer's saves.");
    note?.seen();
    expect(steamNote()).toBeNull();
    vi.resetModules();
    const again = await import('../src/boot.ts');
    again.chooseStore();
    expect(again.steamNote()?.text).toBe("Steam's saves can't be reached; using this computer's saves.");
  });

  it('uses the app’s saves and says so where Cloud saves is on but the folder will not load', async () => {
    bridge({ steam: true, game: 'ok', where: 'x', account: true }, null, undefined, ON);
    const { chooseStore, steamNote } = await import('../src/boot.ts');
    const { kept } = await import('../src/game/keyStore.ts');
    chooseStore();
    kept().setItem('ultima5.save', 'new');
    expect(localStorage.getItem('ultima5.save')).toBe('new');
    expect(steamNote()?.text).toBe("Steam's saves can't be reached; using this computer's saves.");
  });

  it('puts the can’t-be-reached note before the first-launch one, which waits', async () => {
    bridge({ steam: true, game: 'ok', where: 'x', account: true }, null, undefined, ON);
    const { chooseStore, steamNote } = await import('../src/boot.ts');
    chooseStore();
    steamNote()?.seen();
    expect(localStorage.getItem('ultima5.steamNoted.me')).toBeNull();
  });

  it('leaves the browser’s storage to any other launch', async () => {
    bridge({ steam: false });
    const { chooseStore } = await import('../src/boot.ts');
    const { kept } = await import('../src/game/keyStore.ts');
    chooseStore();
    kept().setItem('ultima5.save', 'new');
    expect(localStorage.getItem('ultima5.save')).toBe('new');
  });

  it('says how saves are kept once for an account whose Cloud saves is on', async () => {
    bridge({ steam: true, game: 'ok', where: 'x', account: true }, {}, undefined, ON);
    const { chooseStore, steamNote } = await import('../src/boot.ts');
    chooseStore();
    const note = steamNote();
    expect(note?.text).toBe('Saves made while playing from Steam stay with Steam. Turning Steam Cloud saves off copies them back.');
    note?.seen();
    expect(steamNote()).toBeNull();
    // On a later launch too: the flag is the account's, on this machine.
    vi.resetModules();
    const again = await import('../src/boot.ts');
    again.chooseStore();
    expect(again.steamNote()).toBeNull();
    expect(localStorage.getItem('ultima5.steamNoted.me')).not.toBeNull();
    // Another account has its own.
    bridge({ steam: true, game: 'ok', where: 'x', account: true }, {}, undefined, { cloud: { you: true }, account: 'you' });
    vi.resetModules();
    const other = await import('../src/boot.ts');
    other.chooseStore();
    expect(other.steamNote()).not.toBeNull();
  });

  it('says nothing of it on the next launch where Cloud saves was turned on in a session, which said as much', async () => {
    bridge({ steam: true, game: 'ok', where: 'x', account: true }, {}, undefined, { account: 'me' });
    const { cloudSaves } = await import('../src/game/keyStore.ts');
    const native = (globalThis as unknown as { u5native: { steam: Parameters<typeof cloudSaves>[0] } }).u5native.steam;
    const sides = cloudSaves({ ...native, setOption: async (_name, on, failed) => ({ on: failed === undefined && on, message: '' }) });
    await sides.record(true, 'ENOSPC');
    expect(localStorage.getItem('ultima5.steamNoted.me')).toBeNull();
    await sides.record(true);
    bridge({ steam: true, game: 'ok', where: 'x', account: true }, {}, undefined, ON);
    vi.resetModules();
    const next = await import('../src/boot.ts');
    next.chooseStore();
    expect(next.steamNote()).toBeNull();
  });

  it('says nothing of it outside Steam', async () => {
    bridge(null);
    expect((await import('../src/boot.ts')).steamNote()).toBeNull();
  });

  it('asks the app how it was launched once a page, however often the title looks for its note', async () => {
    bridge({ steam: true, game: 'ok', where: 'x', account: true }, { 'ultima5.saves': 'old' }, undefined, ON);
    localStorage.setItem('ultima5.steamNoted.me', '1');
    const steam = (globalThis as unknown as { u5native: { steam: { launch: () => SteamLaunch } } }).u5native.steam;
    const launch = vi.fn(steam.launch);
    steam.launch = launch;
    const { chooseStore, steamNote } = await import('../src/boot.ts');
    chooseStore();
    const { kept } = await import('../src/game/keyStore.ts');
    const walk = vi.spyOn(kept(), 'key');
    for (let i = 0; i < 100; i++) expect(steamNote()).toBeNull();
    expect(launch).toHaveBeenCalledTimes(1);
    expect(walk.mock.calls.length).toBe(0);
  });

  it('keeps saying the first-launch note until it is seen, then says it no more', async () => {
    bridge({ steam: true, game: 'ok', where: 'x', account: true }, {}, undefined, ON);
    const { chooseStore, steamNote } = await import('../src/boot.ts');
    chooseStore();
    expect(steamNote()?.text).toMatch(/^Saves made while playing from Steam/);
    const note = steamNote();
    expect(note?.text).toMatch(/^Saves made while playing from Steam/);
    note?.seen();
    expect(steamNote()).toBeNull();
  });
});

describe("a Steam Deck's controller, under Steam's keyboard layout", () => {
  const PAD_NOTE = "Buttons do nothing? In Steam's controller settings for Ultima V, choose the Gamepad template.";
  let was: PropertyDescriptor | undefined;
  beforeEach(() => {
    was = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { value: memory(), configurable: true });
    vi.resetModules();
  });
  afterEach(() => {
    delete (globalThis as { u5native?: unknown }).u5native;
    if (was) Object.defineProperty(globalThis, 'localStorage', was);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  });
  const deck: SteamLaunch = { steam: true, game: 'ok', where: 'x', account: true, deck: true };

  it('says once, on a Deck that Steam started and no gamepad has yet reached, which layout to choose', async () => {
    bridge(deck, {}, undefined, { account: 'me' });
    const { chooseStore, steamNote } = await import('../src/boot.ts');
    chooseStore();
    const note = steamNote();
    expect(note?.text).toBe(PAD_NOTE);
    note?.seen();
    expect(steamNote()).toBeNull();
    vi.resetModules();
    const again = await import('../src/boot.ts');
    again.chooseStore();
    expect(again.steamNote()).toBeNull();
  });

  it('says nothing once a gamepad has reached the game, off a Deck, or outside Steam', async () => {
    const { PAD_SEEN_KEY, notePadSeen } = await import('../src/game/keyStore.ts');
    notePadSeen();
    expect(localStorage.getItem(PAD_SEEN_KEY)).not.toBeNull();
    bridge(deck, {}, undefined, { account: 'me' });
    let boot = await import('../src/boot.ts');
    boot.chooseStore();
    expect(boot.steamNote()).toBeNull();
    for (const launch of [{ ...deck, deck: false }, { steam: false } as SteamLaunch]) {
      localStorage.clear();
      vi.resetModules();
      bridge(launch, {}, undefined, { account: 'me' });
      boot = await import('../src/boot.ts');
      boot.chooseStore();
      expect(boot.steamNote()).toBeNull();
    }
  });

  it("lets the Cloud saves note go first, and says the controller's after", async () => {
    bridge(deck, {}, undefined, ON);
    const { chooseStore, steamNote } = await import('../src/boot.ts');
    chooseStore();
    const first = steamNote();
    expect(first?.text).toMatch(/^Saves made while playing from Steam/);
    first?.seen();
    vi.resetModules();
    const again = await import('../src/boot.ts');
    again.chooseStore();
    expect(again.steamNote()?.text).toBe(PAD_NOTE);
  });
});

describe('macOS Sync at the title', () => {
  let was: PropertyDescriptor | undefined;
  beforeEach(() => {
    was = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { value: memory(), configurable: true });
    vi.resetModules();
  });
  afterEach(() => {
    delete (globalThis as { u5native?: unknown }).u5native;
    if (was) Object.defineProperty(globalThis, 'localStorage', was);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  });
  /** macOS Sync's state (desktop/main.cjs syncState): Linux in a Steam launch, on, its rules lacking MacOS, not fixable there. */
  const SYNC = (over: Partial<SyncState> = {}): SyncState => ({
    system: 'linux',
    flatpak: false,
    deck: true,
    launch: true,
    on: true,
    rules: 'needed',
    why: null,
    ruleList: [],
    stuck: 0,
    canFix: false,
    steamRunning: false,
    ...over,
  });
  const IN_STEAM: SteamLaunch = { steam: true, game: 'ok', where: 'x', account: true };
  /** A launch's note, the first-launch Cloud note already seen. */
  async function noteFor(
    sync: SyncState,
    launch: SteamLaunch = IN_STEAM,
    options: { cloud: Record<string, boolean>; account: string } = ON,
  ) {
    localStorage.setItem(`ultima5.steamNoted.${options.account}`, '1');
    vi.resetModules();
    bridge(launch, {}, undefined, options, sync);
    const boot = await import('../src/boot.ts');
    boot.chooseStore();
    return boot.steamNote();
  }

  it('says every launch, with Cloud saves on, where to fix it: never once and forgotten', async () => {
    const note = await noteFor(SYNC());
    expect(note?.text).toContain("Cloud saves made here don't reach a Mac");
    expect(note?.text).toContain('Desktop Mode');
    expect(note?.action).toBeUndefined();
    note?.seen();
    // The next launch, the same: until it is fixed, or macOS Sync turned off.
    expect((await noteFor(SYNC()))?.text).toContain("don't reach a Mac");
  });

  it('offers Fix now where the fix can be made: outside Steam, or only saves to send again', async () => {
    const outside = await noteFor(SYNC({ launch: false, deck: false, canFix: true, steamRunning: true }), { steam: false });
    expect(outside?.action?.label).toBe('Fix now (restarts Steam)');
    expect(await outside?.action?.run()).toBe('Fixed.');
    const resend = await noteFor(SYNC({ rules: 'ready', stuck: 3 }));
    expect(resend?.text).toContain('3 Cloud saves made here were sent to Windows alone');
    expect(resend?.action?.label).toBe('Fix now');
  });

  it("tells a Mac of saves made elsewhere that can't reach it, with nothing to fix there", async () => {
    const note = await noteFor(SYNC({ system: 'mac', rules: 'ready', stuck: 2, deck: false }));
    expect(note?.text).toContain("2 Cloud saves can't reach this Mac");
    expect(note?.action).toBeUndefined();
  });

  it('says nothing with macOS Sync off, all well, Cloud saves off, or outside Steam where it cannot be fixed', async () => {
    expect(await noteFor(SYNC({ on: false }))).toBeNull();
    expect(await noteFor(SYNC({ rules: 'ready' }))).toBeNull();
    expect(await noteFor(SYNC(), IN_STEAM, { cloud: {}, account: 'me' })).toBeNull();
    expect(await noteFor(SYNC({ launch: false }), { steam: false })).toBeNull();
    expect(await noteFor(SYNC({ system: 'mac', stuck: 2, launch: false }), { steam: false })).toBeNull();
  });

  it("says where the rules can't be read, rather than nothing", async () => {
    const note = await noteFor(SYNC({ rules: 'unreadable', why: 'odd' }));
    expect(note?.text).toContain("couldn't be read");
    expect(note?.action).toBeUndefined();
  });
});
