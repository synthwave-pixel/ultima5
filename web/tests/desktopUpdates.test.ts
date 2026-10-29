import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyUpdate,
  checkForUpdates,
  currentOffer,
  isNewer,
  lookForNews,
  newsSeen,
  currentNews,
  plainNotes,
  releaseNotes,
  onOffer,
  RELEASES,
  shouldNotice,
  toldOfUpdate,
  updateKind,
} from '../../desktop/updates.cjs';

/** Updates from the GitHub releases (desktop/updates.cjs). */
describe('the desktop app’s updates', () => {
  const kind = (platform: string, env: Record<string, string> = {}, packaged = true, argv: string[] = []) =>
    updateKind({ packaged, platform, env, argv });

  it('install themselves where electron-updater can replace the copy: the Windows installer’s, the AppImage', () => {
    expect(kind('win32')).toBe('auto');
    expect(kind('linux', { APPIMAGE: '/home/deck/Ultima-V.AppImage' })).toBe('auto');
  });

  it('are told of where it cannot: macOS (unsigned), the Windows portable .exe', () => {
    expect(kind('darwin')).toBe('notice');
    expect(kind('win32', { PORTABLE_EXECUTABLE_DIR: 'D:\\\\Games' })).toBe('notice');
  });

  it('in the Flatpak, go through its update portal (flatpakUpdates.cjs)', () => {
    expect(kind('linux', { FLATPAK_ID: 'com.synthwavepixel.ultima5', APPIMAGE: '/x' })).toBe('flatpak');
    expect(kind('linux', { container: 'flatpak' })).toBe('flatpak');
  });

  it('are left alone unpackaged, and when told not to look', () => {
    expect(kind('linux', { FLATPAK_ID: 'com.synthwavepixel.ultima5' }, false)).toBe('none');
    expect(kind('win32', {}, false)).toBe('none');
    expect(kind('darwin', {}, true, ['--no-update-check'])).toBe('none');
  });

  it('compare versions as the releases number them, a development build below its release', () => {
    expect(isNewer('1.1.12', '1.1.10')).toBe(true);
    expect(isNewer('v1.1.12', '1.1.12')).toBe(false);
    expect(isNewer('1.1.9', '1.1.10')).toBe(false); // by number, not as text
    expect(isNewer('1.2.0', '1.1.99')).toBe(true);
    expect(isNewer('1.1.0', '1.1.0-dev.20261008.1700')).toBe(true);
  });

  it('tell of each newer release once', () => {
    expect(shouldNotice('1.1.12', '1.1.10', null)).toBe(true);
    expect(shouldNotice('1.1.12', '1.1.10', '1.1.12')).toBe(false); // told already
    expect(shouldNotice('1.1.13', '1.1.10', '1.1.12')).toBe(true); // a newer one since
    expect(shouldNotice('1.1.10', '1.1.10', null)).toBe(false); // up to date
  });

  it('tell the game of a newer release, its page opened from the game, told of once - nothing up to date or offline', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'u5-updates-'));
    const file = join(dir, 'updates.json');
    const was = { platform: process.platform };
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    try {
      let latest = 'v1.1.12';
      let reachable = true;
      const opened: string[] = [];
      const seen: unknown[] = [];
      onOffer((o: unknown) => seen.push(o));
      const electron = {
        app: { isPackaged: true, getVersion: () => '1.1.10', getPath: () => dir },
        net: {
          fetch: async () => {
            if (!reachable) throw new Error('offline');
            return { ok: true, json: async () => ({ tag_name: latest }) };
          },
        },
        shell: { openExternal: async (url: string) => void opened.push(url) },
      };
      const look = (quiet = false) => checkForUpdates({ electron, quiet, file });
      await look();
      expect(currentOffer()).toEqual({ kind: 'release', version: '1.1.12', current: '1.1.10', told: false });
      expect(seen).toHaveLength(1);
      // The game's box shown: told, and kept so; its Open release page.
      toldOfUpdate({ file });
      expect(currentOffer()?.told).toBe(true);
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ noticed: '1.1.12' });
      expect(applyUpdate({ electron })).toBe(true);
      expect(opened).toEqual([RELEASES]);
      // Looked again, the same release: told already.
      await look();
      expect(currentOffer()?.told).toBe(true);
      // A newer one since: to be told of.
      latest = 'v1.1.13';
      await look(true); // Game Mode: no page offered
      expect(currentOffer()?.version).toBe('1.1.12');
      reachable = false;
      await look(); // offline: only logged
      expect(currentOffer()?.version).toBe('1.1.12');
      reachable = true;
      await look();
      expect(currentOffer()).toEqual({ kind: 'release', version: '1.1.13', current: '1.1.10', told: false });
    } finally {
      Object.defineProperty(process, 'platform', { value: was.platform });
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('say, once, that this is the first start of a newer version - not on the first run, nor running unpackaged', () => {
    const dir = mkdtempSync(join(tmpdir(), 'u5-news-'));
    const file = join(dir, 'updates.json');
    try {
      const app = (version: string, isPackaged = true) => ({ app: { isPackaged, getVersion: () => version }, file });
      expect(lookForNews(app('1.1.166'))).toBeNull(); // the first run: nothing to compare with
      expect(lookForNews(app('1.1.166'))).toBeNull(); // the same again
      expect(lookForNews(app('1.1.168'))).toEqual({ version: '1.1.168', from: '1.1.166' });
      expect(currentNews()).toEqual({ version: '1.1.168', from: '1.1.166' });
      newsSeen();
      expect(currentNews()).toBeNull();
      expect(lookForNews(app('1.1.168'))).toBeNull(); // started again: said already
      expect(lookForNews(app('1.1.170', false))).toBeNull(); // a development run
      // Kept beside the release last told of, not over it.
      writeFileSync(file, JSON.stringify({ noticed: '1.1.170', lastRun: '1.1.168' }));
      lookForNews(app('1.1.170'));
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ noticed: '1.1.170', lastRun: '1.1.170' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('give a release’s notes as plain lines, its Markdown and compare link let go; none offline', async () => {
    expect(
      plainNotes('### Menus\n\n- **The command menu** sits low ([why](https://x)).\n  - `Sh. Sword`\n\n\n**Full Changelog**: https://y'),
    ).toBe('Menus\n\n- The command menu sits low (why).\n  - Sh. Sword');
    const net = (ok: boolean) => ({
      fetch: async (url: string) => {
        if (!ok) throw new Error('offline');
        expect(url).toMatch(/\/releases\/tags\/v1\.1\.168$/);
        return { ok: true, json: async () => ({ body: '### Rules\n- **999** arrows' }) };
      },
    });
    expect(await releaseNotes({ net: net(true), version: '1.1.168' })).toBe('Rules\n- 999 arrows');
    expect(await releaseNotes({ net: net(false), version: '1.1.168' })).toBeNull();
  });

  it('has the network in the Flatpak: GitHub’s newest release, and a release’s notes, are looked for from inside it', () => {
    // Without it Chromium sees no network at all (net::ERR_INTERNET_DISCONNECTED) and the update waits on the portal's
    // own look. The portal will not take an update that adds a permission: this one came by Discover.
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'desktop', 'package.json'), 'utf8')) as {
      build: { flatpak: { finishArgs: string[] } };
    };
    expect(pkg.build.flatpak.finishArgs).toContain('--share=network');
  });
});
