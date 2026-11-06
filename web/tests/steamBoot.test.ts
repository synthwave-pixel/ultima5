// web/tests/steamBoot.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FoundCopy } from '../src/install/scan.ts';
import type { SteamLaunch } from '../src/install/sources.ts';
import { gameFiles as checkedIn } from './helpers.ts';

const runInstaller = vi.fn<(notice?: string) => Promise<string>>();
const saveInstalled = vi.fn<(files: unknown) => Promise<void>>();
vi.mock('../src/install/installer.ts', () => ({ runInstaller: (n?: string) => runInstaller(n) }));
vi.mock('../src/install/store.ts', () => ({
  saveInstalled: (f: unknown) => saveInstalled(f),
  loadInstalled: () => Promise.resolve(null),
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
function bridge(launch: SteamLaunch | null, saves: Record<string, string> | null = {}) {
  const written = new Map<string, string>();
  (globalThis as { u5native?: unknown }).u5native = {
    scanForGameFiles: () => Promise.resolve([]),
    ...(launch && {
      steam: {
        launch: () => launch,
        gameFiles: () => Promise.resolve(wholeCopy()),
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

describe('a launch from Steam', () => {
  let was: PropertyDescriptor | undefined;
  beforeEach(() => {
    was = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { value: memory(), configurable: true });
    runInstaller.mockReset();
    saveInstalled.mockReset();
    vi.resetModules();
  });
  afterEach(() => {
    delete (globalThis as { u5native?: unknown }).u5native;
    if (was) Object.defineProperty(globalThis, 'localStorage', was);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("plays Steam's copy, installing nothing in the browser", async () => {
    bridge({ steam: true, game: 'ok', where: '/steam/Ultima V', account: true });
    const { gameFiles } = await import('../src/boot.ts');
    const files = await gameFiles();
    expect(files.names()).toContain('DATA.OVL');
    expect(runInstaller).not.toHaveBeenCalled();
    expect(saveInstalled).not.toHaveBeenCalled();
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

  it('says when no account is known', async () => {
    bridge({ steam: true, game: 'ok', where: 'x', account: false }, null);
    const { steamNote } = await import('../src/boot.ts');
    expect(steamNote()?.text).toBe('Steam launched the game, but which Steam account did is unknown, so nothing can be saved.');
  });
});
