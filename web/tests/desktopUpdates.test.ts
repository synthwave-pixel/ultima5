import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkForUpdates, isNewer, RELEASES, shouldNotice, updateKind } from '../../desktop/updates.cjs';

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

  it('are left alone in the Flatpak (flatpak updates it), unpackaged, and when told not to look', () => {
    expect(kind('linux', { FLATPAK_ID: 'com.synthwavepixel.ultima5', APPIMAGE: '/x' })).toBe('none');
    expect(kind('linux', { container: 'flatpak' })).toBe('none');
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

  it('offer the releases page for a newer release, once, and nothing when up to date or GitHub cannot be reached', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'u5-updates-'));
    const was = { platform: process.platform, argv: process.argv };
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    try {
      let latest = 'v1.1.12';
      let reachable = true;
      const asked: string[] = [];
      const opened: string[] = [];
      const electron = {
        app: { isPackaged: true, getVersion: () => '1.1.10', getPath: () => dir },
        net: {
          fetch: async () => {
            if (!reachable) throw new Error('offline');
            return { ok: true, json: async () => ({ tag_name: latest }) };
          },
        },
        dialog: {
          showMessageBox: async (_win: unknown, o: { message: string }) => {
            asked.push(o.message);
            return { response: 1 };
          },
        },
        shell: { openExternal: async (url: string) => void opened.push(url) },
      };
      const win = { isDestroyed: () => false };
      const look = () => checkForUpdates({ electron, win, quiet: false });
      await look();
      expect(asked).toEqual(['Ultima V 1.1.12 is out']);
      expect(opened).toEqual([RELEASES]);
      expect(JSON.parse(readFileSync(join(dir, 'updates.json'), 'utf8'))).toEqual({ noticed: '1.1.12' });
      await look(); // told once
      expect(asked.length).toBe(1);
      latest = 'v1.1.13';
      await checkForUpdates({ electron, win, quiet: true }); // Game Mode: nothing asked
      expect(asked.length).toBe(1);
      reachable = false;
      await look(); // offline: only logged
      expect(asked.length).toBe(1);
      reachable = true;
      await look();
      expect(asked).toEqual(['Ultima V 1.1.12 is out', 'Ultima V 1.1.13 is out']);
    } finally {
      Object.defineProperty(process, 'platform', { value: was.platform });
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
